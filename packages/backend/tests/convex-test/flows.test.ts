/**
 * E2E Integration Tests using convex-test
 *
 * Uses mocked Convex backend with fetch stubbing for Gemini/Telegram APIs.
 * Run with: bun run test
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "../test.setup";

function mockGeminiResponse(
	type: string | number,
	validFromDay: number | null,
	validFromMonth: number | null,
	expiryDate: string | null,
	barcode: string | null,
) {
	return {
		candidates: [
			{
				content: {
					parts: [
						{
							text: JSON.stringify({
								type,
								validFromDay,
								validFromMonth,
								expiryDate,
								barcode,
							}),
						},
					],
				},
			},
		],
	};
}

function mockTelegramResponse() {
	return { ok: true, result: { message_id: 123 } };
}

let sentMessages: { chatId: string; text?: string }[] = [];

type OCRSenario =
	| "valid_10"
	| "valid_5"
	| "valid_20"
	| "expired"
	| "invalid_type"
	| "missing_valid_from"
	| "invalid_valid_from"
	| "missing_expiry"
	| "missing_barcode"
	| "too_late_today"
	| "gemini_api_error";

// Helper to create a text message
function createTelegramMessage(
	text: string,
	chatId: string = "123456",
	username: string = "testuser",
) {
	// Parse chatId as number if it's numeric, otherwise use it as-is
	const numericChatId = isNaN(Number(chatId)) ? chatId : Number(chatId);
	return {
		message_id: Math.floor(Math.random() * 100000),
		chat: { id: numericChatId },
		from: { id: numericChatId, username, first_name: "Test" },
		text,
		date: Math.floor(Date.now() / 1000),
	};
}

// Helper to create a photo message
function createTelegramPhotoMessage(chatId: string = "123456") {
	// Parse chatId as number if it's numeric, otherwise use it as-is
	const numericChatId = isNaN(Number(chatId)) ? chatId : Number(chatId);
	return {
		message_id: Math.floor(Math.random() * 100000),
		chat: { id: numericChatId },
		from: { id: numericChatId, username: "testuser", first_name: "Test" },
		photo: [
			{ file_id: "small_photo_id", width: 100, height: 100 },
			{ file_id: "large_photo_id", width: 800, height: 600 },
		],
		date: Math.floor(Date.now() / 1000),
	};
}

// Helper to create a callback query
function createTelegramCallback(data: string, chatId: string = "123456") {
	// Parse chatId as number if it's numeric, otherwise use it as-is
	const numericChatId = isNaN(Number(chatId)) ? chatId : Number(chatId);
	return {
		id: "callback_id_" + Math.floor(Math.random() * 100000),
		data,
		message: {
			message_id: Math.floor(Math.random() * 100000),
			chat: { id: numericChatId },
		},
		from: { id: numericChatId, username: "testuser", first_name: "Test" },
	};
}

function setupFetchMock(
	geminiScenario: OCRSenario = "valid_10",
	customExpiryDate?: string,
) {
	sentMessages = [];

	const futureDate = new Date();
	futureDate.setDate(futureDate.getDate() + 14);
	const futureDateStr = futureDate.toISOString().split("T")[0];

	const validFromDate = new Date();
	validFromDate.setDate(validFromDate.getDate() - 1); // Started yesterday
	const validFromDay = validFromDate.getDate();
	const validFromMonth = validFromDate.getMonth() + 1; // JS months are 0-indexed

	const pastDate = new Date();
	pastDate.setDate(pastDate.getDate() - 7);
	const pastDateStr = pastDate.toISOString().split("T")[0];

	const todayDate = new Date();
	const todayDateStr = todayDate.toISOString().split("T")[0];

	// For testing old validFrom: we need a validFrom that will be >1 year old
	// even after the extraction logic adjusts the year based on expiry
	// Today is 2026-01-03, so >1 year ago is before 2025-01-03
	// Use a date well before that to ensure it's definitely >1 year old
	const veryOldDay = 1;
	const veryOldMonth = 12; // December of previous year

	// Use an expiry date at end of current year (will be >1 year after validFrom)
	const expiryForOldValidFrom = new Date();
	expiryForOldValidFrom.setMonth(11); // December (0-indexed)
	expiryForOldValidFrom.setDate(31);
	const expiryForOldValidFromStr = expiryForOldValidFrom.toISOString().split("T")[0];

	const scenarios = {
		valid_5: mockGeminiResponse(5, validFromDay, validFromMonth, customExpiryDate || futureDateStr, "1234567890001"),
		valid_10: mockGeminiResponse(10, validFromDay, validFromMonth, futureDateStr, "1234567890002"),
		valid_20: mockGeminiResponse(20, validFromDay, validFromMonth, futureDateStr, "1234567890003"),
		expired: mockGeminiResponse(10, validFromDay, validFromMonth, pastDateStr, "1234567890004"),
		invalid_type: mockGeminiResponse(0, validFromDay, validFromMonth, futureDateStr, "1234567890005"),
		missing_valid_from: mockGeminiResponse(10, null, null, futureDateStr, "1234567890006"),
		invalid_valid_from: mockGeminiResponse(10, veryOldDay, veryOldMonth, expiryForOldValidFromStr, "1234567890007"),
		missing_expiry: mockGeminiResponse(10, validFromDay, validFromMonth, null, "1234567890008"),
		missing_barcode: mockGeminiResponse(10, validFromDay, validFromMonth, futureDateStr, null),
		too_late_today: mockGeminiResponse(10, validFromDay, validFromMonth, todayDateStr, "1234567890010"),
		gemini_api_error: null, // Will throw error instead of returning mock
	};

	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, options?: RequestInit) => {
			// Mock Telegram sendMessage
			if (url.includes("api.telegram.org") && url.includes("/sendMessage")) {
				let body: any = {};
				if (options?.body instanceof FormData) {
					body = Object.fromEntries(options.body as any);
				} else if (typeof options?.body === "string") {
					body = JSON.parse(options.body);
				}
				sentMessages.push({ chatId: body.chat_id, text: body.text });
				return {
					ok: true,
					json: async () => mockTelegramResponse(),
				} as Response;
			}

			// Mock Telegram answerCallbackQuery
			if (
				url.includes("api.telegram.org") &&
				url.includes("/answerCallbackQuery")
			) {
				return {
					ok: true,
					json: async () => ({ ok: true, result: true }),
				} as Response;
			}

			// Mock Telegram getFile endpoint
			if (url.includes("api.telegram.org") && url.includes("/getFile")) {
				return {
					ok: true,
					json: async () => ({
						ok: true,
						result: {
							file_path: "test/file/path.jpg",
						},
					}),
				} as Response;
			}

			// Mock Telegram file download
			if (url.includes("api.telegram.org/file/")) {
				return {
					ok: true,
					arrayBuffer: async () => new ArrayBuffer(100),
					blob: async () => new Blob(["fake-image"], { type: "image/jpeg" }),
				} as Response;
			}

			// Mock Telegram sendPhoto
			if (url.includes("api.telegram.org") && url.includes("/sendPhoto")) {
				let body: any = {};
				if (options?.body instanceof FormData) {
					sentMessages.push({
						chatId: options.body.get("chat_id") as string,
						text: options.body.get("caption") as string,
					});
				}
				return {
					ok: true,
					json: async () => mockTelegramResponse(),
				} as Response;
			}

			// Mock Gemini OCR
			if (url.includes("generativelanguage.googleapis.com")) {
				if (geminiScenario === "gemini_api_error") {
					throw new Error("Gemini API error");
				}
				return {
					ok: true,
					json: async () => scenarios[geminiScenario],
				} as Response;
			}

			// Mock Convex storage (for image download in OCR and voucher claims)
			if (url.includes("convex.cloud") || url.includes("convex.site")) {
				return {
					ok: true,
					arrayBuffer: async () => new ArrayBuffer(100),
					blob: async () => new Blob(["voucher-image"], { type: "image/jpeg" }),
				} as Response;
			}

			// Fallback - shouldn't reach here in tests
			console.warn(`Unmocked fetch: ${url}`);
			return { ok: false, status: 404 } as Response;
		}),
	);
}

describe("User Signup Flow", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("new user with valid invite code is created via Telegram message", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456789";

		const inviteCode = await t.run(async (ctx) => {
			const codeId = await ctx.db.insert("inviteCodes", {
				code: "TESTCODE",
				maxUses: 100,
				usedCount: 0,
				createdAt: Date.now(),
			});
			return "TESTCODE";
		});

		// Simulate sending "code TESTCODE"
		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage(`code ${inviteCode}`, chatId),
		});

		// Check user created
		const user = await t.run(async (ctx) => {
			return await ctx.db
				.query("users")
				.withIndex("by_chat_id", (q) => q.eq("telegramChatId", chatId))
				.first();
		});

		expect(user).toBeDefined();
		expect(user?.isBanned).toBe(false);

		// Verify welcome message
		const welcomeMsg = sentMessages.find(
			(m) =>
				m.chatId === chatId &&
				m.text?.includes("Welcome to Dunnes Voucher Bot!"),
		);
		expect(welcomeMsg).toBeDefined();
	});

	test("validate invite code increments usage via Telegram message", async () => {
		const t = convexTest(schema, modules);
		const chatId = "987654321";

		await t.run(async (ctx) => {
			await ctx.db.insert("inviteCodes", {
				code: "SINGLEUSE",
				maxUses: 1,
				usedCount: 0,
				createdAt: Date.now(),
			});
		});

		// First use: Should succeed (uses mock message)
		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage("code SINGLEUSE", chatId),
		});

		const user = await t.run(async (ctx) => {
			return await ctx.db
				.query("users")
				.withIndex("by_chat_id", (q) => q.eq("telegramChatId", chatId))
				.first();
		});
		expect(user).toBeDefined();

		// Second use: Should fail (new user from different chat)
		const chatId2 = "987654322";
		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage("code SINGLEUSE", chatId2),
		});

		// Verify failure message
		const errorMsg = sentMessages.find(
			(m) => m.chatId === chatId2 && m.text?.includes("limit"),
		);
		expect(errorMsg).toBeDefined();
	});

	test("invalid invite code returns error via Telegram message", async () => {
		const t = convexTest(schema, modules);
		const chatId = "111222333";

		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage("code DOESNOTEXIST", chatId),
		});

		// Verify failure message
		const errorMsg = sentMessages.find(
			(m) => m.chatId === chatId && m.text?.includes("Invalid"),
		);
		expect(errorMsg).toBeDefined();

		// Verify user NOT created
		const user = await t.run(async (ctx) => {
			return await ctx.db
				.query("users")
				.withIndex("by_chat_id", (q) => q.eq("telegramChatId", chatId))
				.first();
		});
		expect(user).toBeNull();
	});
});

describe("Voucher Upload Flow", () => {
	beforeEach(() => {
		// Setup fetch mock with real dates
		setupFetchMock("valid_10");
		// Stub env vars for OCR
		vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-api-key");
		// Enable fake timers with current real time
		vi.useFakeTimers({ now: Date.now() });
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("upload voucher creates processing voucher via Telegram webhook", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456";

		// Create a user
		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: chatId,
				coins: 20,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		// Simulate sending a photo
		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramPhotoMessage(chatId),
		});

		// Wait for OCR action and follow-up mutations
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		// Check voucher is created and processed
		const voucher = await t.run(async (ctx) => {
			return await ctx.db
				.query("vouchers")
				.withIndex("by_uploader", (q) => q.eq("uploaderId", userId))
				.first();
		});

		expect(voucher).toBeDefined();
		expect(voucher?.status).toBe("available");
		expect(voucher?.type).toBe("10");

		// Check user got coins from the upload
		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId);
		});
		expect(user?.coins).toBe(30); // 20 original + 10 for uploading €10 voucher
	});
});

describe("Voucher Claim Flow", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("claim voucher deducts coins via Telegram webhook", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456";

		// Create user with coins
		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: chatId,
				coins: 20,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		// Create another user (the uploader)
		const uploaderId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: "uploader123",
				coins: 0,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		// Create an available voucher
		const imageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["voucher-image"]));
		});

		await t.run(async (ctx) => {
			await ctx.db.insert("vouchers", {
				type: "10",
				status: "available",
				imageStorageId,
				uploaderId: uploaderId,
				expiryDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
				validFrom: Date.now() - 24 * 60 * 60 * 1000,
				createdAt: Date.now(),
			});
		});

		// Claim the voucher via Telegram command
		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage("10", chatId),
		});

		// Verify user coins were deducted
		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId);
		});

		expect(user?.coins).toBe(10); // 20 - 10

		// Verify user received message with voucher
		const successMsg = sentMessages.find(
			(m) =>
				m.chatId === chatId && m.text?.includes("Here is your €10 voucher"),
		);
		expect(successMsg).toBeDefined();
	});

	test("claim with insufficient coins fails via Telegram webhook", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456";

		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: chatId,
				coins: 5,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		// Create another user (the uploader)
		const uploaderId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: "uploader456",
				coins: 0,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		// Create an available voucher
		const imageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["voucher-image"]));
		});

		await t.run(async (ctx) => {
			await ctx.db.insert("vouchers", {
				type: "10",
				status: "available",
				imageStorageId,
				uploaderId: uploaderId,
				expiryDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
				validFrom: Date.now() - 24 * 60 * 60 * 1000,
				createdAt: Date.now(),
			});
		});

		// Try to claim via Telegram
		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage("10", chatId),
		});

		// Verify failure message
		const errorMsg = sentMessages.find(
			(m) => m.chatId === chatId && m.text?.includes("Insufficient coins"),
		);
		expect(errorMsg).toBeDefined();
	});

	test("claim fails when no voucher available via Telegram webhook", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456";

		await t.run(async (ctx) => {
			await ctx.db.insert("users", {
				telegramChatId: chatId,
				coins: 20,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		// Try to claim without any vouchers in system
		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage("10", chatId),
		});

		// Verify failure message
		const errorMsg = sentMessages.find(
			(m) =>
				m.chatId === chatId &&
				m.text?.includes("No €10 vouchers currently available"),
		);
		expect(errorMsg).toBeDefined();
	});
});

describe("OCR Flow with Mocked Gemini", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	test("valid voucher OCR awards coins to uploader", async () => {
		setupFetchMock("valid_10");
		const t = convexTest(schema, modules);

		// Create user
		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: "123456",
				coins: 0,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		// Create storage and voucher
		const imageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["fake-image"]));
		});

		const voucherId = await t.run(async (ctx) => {
			return await ctx.db.insert("vouchers", {
				type: "0",
				status: "processing",
				imageStorageId,
				uploaderId: userId,
				expiryDate: 0,
				createdAt: Date.now(),
			});
		});

		// Simulate OCR completing with valid result
		await t.mutation(internal.ocr.store.storeVoucherFromOcr, {
			userId,
			imageStorageId,
			type: "10",
			expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
			validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
			barcode: "1234567890",
			rawResponse: "{}",
		});

		// Wait for scheduled functions (Telegram notifications)
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		// Check new voucher was created with status available
		const vouchers = await t.run(async (ctx) => {
			return await ctx.db.query("vouchers").collect();
		});
		// Should have 2 vouchers: original processing + new available one
		expect(vouchers.length).toBe(2);
		const availableVoucher = vouchers.find((v) => v.status === "available");
		expect(availableVoucher).toBeDefined();
		expect(availableVoucher?.type).toBe("10");

		// Check user got coins (10 for €10 voucher)
		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId);
		});
		expect(user?.coins).toBe(10);
	});

	test("expired voucher OCR fails and notifies user", async () => {
		setupFetchMock("expired");
		const t = convexTest(schema, modules);

		// Create user
		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: "123456",
				coins: 0,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		// Create storage and voucher
		const imageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["fake-image"]));
		});

		const voucherId = await t.run(async (ctx) => {
			return await ctx.db.insert("vouchers", {
				type: "0",
				status: "processing",
				imageStorageId,
				uploaderId: userId,
				expiryDate: 0,
				createdAt: Date.now(),
			});
		});

		// Simulate OCR with expired date
		const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
		await t.mutation(internal.ocr.store.storeVoucherFromOcr, {
			userId,
			imageStorageId,
			type: "10",
			expiryDate: pastDate,
			barcode: "1234567890",
			rawResponse: "{}",
		});

		// Wait for scheduled functions (Telegram notifications)
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		// Check voucher was rejected (no new voucher created, original processing voucher remains)
		const vouchers = await t.run(async (ctx) => {
			return await ctx.db.query("vouchers").collect();
		});
		// Only the original processing voucher exists, no new voucher was created
		expect(vouchers.length).toBe(1);
		expect(vouchers[0].status).toBe("processing");

		// Check user did NOT get coins
		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId);
		});
		expect(user?.coins).toBe(0);
	});

	test("test vouchers expiring today are rejected after 9 PM", async () => {
		const t = convexTest(schema, modules);
		const chatId = "12345";

		const todayStr = "2025-12-21";
		const mockNow = new Date(`${todayStr}T21:30:00`);
		vi.useFakeTimers();
		vi.setSystemTime(mockNow);

		// Create user
		await t.mutation(internal.users.createUserWithInvite, {
			telegramChatId: chatId,
			inviteCode: "TEST",
		});

		// Mock response with expiration date set to today
		setupFetchMock("valid_5", todayStr);

		// Stub Gemini API key
		vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-api-key");
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");

		// Send telegram photo message
		const message = createTelegramPhotoMessage(chatId);

		await t.action(internal.telegram.handleTelegramMessage, { message });

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const user = await t.query(internal.users.getUserByTelegramChatId, {
			telegramChatId: chatId,
		});

		const vouchers = await t.run((ctx) => {
			return ctx.db
				.query("vouchers")

				.withIndex("by_uploader", (q) => q.eq("uploaderId", user!._id))

				.collect();
		});

		// No voucher should be created - rejected due to 9 PM cutoff
		expect(vouchers.length).toBe(0);

		// Verify Telegram error message was sent
		const failureMessage = sentMessages.find(
			(m) =>
				m.chatId === chatId &&
				m.text?.includes("Voucher Processing Failed") &&
				m.text?.includes("Vouchers expiring today can only be uploaded before 9 PM"),
		);

		expect(failureMessage).toBeDefined();
	});
	test("test duplicate barcode is rejected via Telegram webhook", async () => {
		// Use a barcode that the mock OCR will return
		const duplicateBarcode = "1234567890002";
		const chatId = "123456";
		setupFetchMock("valid_10");
		vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-api-key");
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
		vi.useFakeTimers({ now: Date.now() });
		const t = convexTest(schema, modules);

		// Create existing user (already signed up)
		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: chatId,
				coins: 0,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		// Create first voucher with the same barcode that OCR will return
		const imageStorageId1 = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["image1"]));
		});

		await t.run(async (ctx) => {
			await ctx.db.insert("vouchers", {
				type: "10",
				status: "available",
				imageStorageId: imageStorageId1,
				uploaderId: userId,
				expiryDate: Date.now() + 14 * 24 * 60 * 60 * 1000,
				validFrom: Date.now() - 24 * 60 * 60 * 1000,
				barcodeNumber: duplicateBarcode,
				createdAt: Date.now(),
			});
		});

		// Simulate Telegram webhook with a photo message (like a real user uploading)
		const telegramMessage = {
			message_id: 12345,
			chat: { id: Number(chatId) },
			from: { id: 12345, username: "testuser", first_name: "Test" },
			photo: [{ file_id: "small_photo_id", width: 100, height: 100 }],
			date: Math.floor(Date.now() / 1000),
		};

		// Call the Telegram message handler directly (simulates webhook)
		await t.action(internal.telegram.handleTelegramMessage, {
			message: telegramMessage,
		});

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		// Only the original voucher should exist - no duplicate is created
		const vouchers = await t.run(async (ctx) => {
			return await ctx.db.query("vouchers").collect();
		});
		expect(vouchers.length).toBe(1);
		expect(vouchers[0].barcodeNumber).toBe(duplicateBarcode);

		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId);
		});
		expect(user?.coins).toBe(0);

		// Verify the user received a message about the duplicate
		const duplicateMessage = sentMessages.find(
			(msg) =>
				msg.text?.includes("already been uploaded") ||
				msg.text?.includes("duplicate"),
		);
		expect(duplicateMessage).toBeDefined();
		expect(duplicateMessage?.chatId).toBe(chatId);

		vi.useRealTimers();
		vi.unstubAllEnvs();
	});
});

describe("Report Flow", () => {
	beforeEach(() => {
		setupFetchMock();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("reporting voucher refunds coins when no replacement", async () => {
		const t = convexTest(schema, modules);

		// Create uploader
		const uploaderId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: "uploader123",
				coins: 10,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		// Create claimer
		const claimerId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: "claimer456",
				coins: 10,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		// Create claimed voucher
		const imageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["voucher"]));
		});

		const voucherId = await t.run(async (ctx) => {
			return await ctx.db.insert("vouchers", {
				type: "10",
				status: "claimed",
				imageStorageId,
				uploaderId,
				claimerId,
				claimedAt: Date.now(),
				expiryDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
				validFrom: Date.now() - 24 * 60 * 60 * 1000,
				createdAt: Date.now(),
			});
		});

		// Report the voucher
		const result = await t.mutation(internal.vouchers.reportVoucher, {
			userId: claimerId,
			voucherId,
		});

		expect(result.status).toBe("refunded");

		// Check claimer got coins back
		const claimer = await t.run(async (ctx) => {
			return await ctx.db.get(claimerId);
		});
		expect(claimer?.coins).toBe(20);
	});
});

describe("Ban Flow", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("uploader gets banned when 3 of last 5 uploads reported", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const uploaderChatId = "uploader_ban_test";
		const reporterChatId = "reporter_test";

		// Create uploader user (will be banned)
		const uploaderId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: uploaderChatId,
				coins: 100,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		// Create reporter user
		const reporterId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: reporterChatId,
				coins: 50,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		// Create 5 vouchers, all claimed by reporter
		const voucherIds: Id<"vouchers">[] = [];
		for (let i = 0; i < 5; i++) {
			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob([`voucher_${i}`]));
			});

			const voucherId = await t.run(async (ctx) => {
				return await ctx.db.insert("vouchers", {
					type: "10",
					status: "claimed",
					imageStorageId,
					uploaderId,
					claimerId: reporterId,
					claimedAt: Date.now() - (5 - i) * 1000,
					expiryDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
					validFrom: Date.now() - 24 * 60 * 60 * 1000,
					createdAt: Date.now() - (5 - i) * 2000,
				});
			});
			voucherIds.push(voucherId);
		}

		// Report first voucher on Day 1
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[0],
		});

		// Advance to Day 2 and report second voucher
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[1],
		});

		// Verify uploader is NOT banned yet
		let uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		expect(uploader?.isBanned).toBe(false);

		// Advance to Day 3 and report third voucher - this should trigger ban (3 of 5)
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[2],
		});

		// Wait for scheduled functions (ban notification) to complete
		vi.runAllTimers();
		await t.finishInProgressScheduledFunctions();

		// Verify the uploader is now banned
		uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		expect(uploader?.isBanned).toBe(true);
		expect(uploader?.bannedAt).toBeDefined();

		// Verify ban notification was sent to uploader
		const banNotification = sentMessages.find(
			(m) => m.chatId === uploaderChatId && m.text?.includes("Account Banned"),
		);
		expect(banNotification).toBeDefined();
		expect(banNotification?.text).toContain(
			"3 or more of your last 5 uploads were reported",
		);

		vi.useRealTimers();
	});
	test("banned user gets a ban message when trying to interact", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const uploaderChatId = "uploader_ban_test";
		const reporterChatId = "reporter_test";

		// Create uploader user (will be banned)
		const uploaderId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: uploaderChatId,
				coins: 100,
				isBanned: true, // Start as banned for this test
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		// Create reporter user (not relevant for this specific test, but good to have)
		await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: reporterChatId,
				coins: 50,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		// Now test that the banned user gets a ban message when trying to interact
		sentMessages.length = 0; // Clear sent messages

		// Simulate banned user trying to upload a voucher
		const newImageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["new_voucher_image"]));
		});

		// This should fail with ban message
		await expect(
			t.mutation(internal.vouchers.uploadVoucher, {
				userId: uploaderId,
				imageStorageId: newImageStorageId,
			}),
		).rejects.toThrow("You have been banned from this service");

		// Simulate banned user sending a message to the bot
		const bannedUserMessage = createTelegramMessage(
			"test message",
			uploaderChatId,
		);

		// The message handler should not throw, but should send a ban response
		await t.action(internal.telegram.handleTelegramMessage, {
			message: bannedUserMessage,
		});

		// Verify banned user received ban message
		const banMessage = sentMessages.find(
			(m) => m.chatId === uploaderChatId && m.text?.includes("banned"),
		);
		expect(banMessage).toBeDefined();

		vi.useRealTimers();
	});
});

describe("Reminder Flow", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("sends reminders to users who claimed vouchers yesterday", async () => {
		vi.useFakeTimers();

		const now = Date.now();
		const oneDayMs = 24 * 60 * 60 * 1000;
		const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
		const yesterday = now - oneDayMs;
		const twoDaysAgo = now - 2 * oneDayMs;
		const futureExpiry = now + sevenDaysMs;

		const t = convexTest(schema, modules);

		const claimerId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: "claimer123",
				coins: 100,
				isBanned: false,
				createdAt: now,
				lastActiveAt: now,
			});
		});

		const uploaderId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: "uploader456",
				coins: 50,
				isBanned: false,
				createdAt: now,
				lastActiveAt: now,
			});
		});

		// Create voucher claimed yesterday (should trigger reminder)
		const yesterdayVoucherId = await t.run(async (ctx) => {
			const imageStorageId = await ctx.storage.store(new Blob(["test"]));
			return await ctx.db.insert("vouchers", {
				type: "10",
				status: "claimed",
				imageStorageId,
				uploaderId,
				claimerId,
				claimedAt: yesterday,
				expiryDate: futureExpiry,
				createdAt: yesterday,
			});
		});

		// Create voucher claimed today (should NOT trigger)
		const todayVoucherId = await t.run(async (ctx) => {
			const imageStorageId = await ctx.storage.store(new Blob(["test"]));
			return await ctx.db.insert("vouchers", {
				type: "5",
				status: "claimed",
				imageStorageId,
				uploaderId,
				claimerId,
				claimedAt: now,
				expiryDate: futureExpiry,
				createdAt: now,
			});
		});

		// Create voucher claimed 2 days ago (should NOT trigger)
		const oldVoucherId = await t.run(async (ctx) => {
			const imageStorageId = await ctx.storage.store(new Blob(["test"]));
			return await ctx.db.insert("vouchers", {
				type: "20",
				status: "claimed",
				imageStorageId,
				uploaderId,
				claimerId,
				claimedAt: twoDaysAgo,
				expiryDate: futureExpiry,
				createdAt: twoDaysAgo,
			});
		});

		const chatIds = await t.query(
			internal.reminders.getUsersWhoClaimedYesterday,
			{},
		);

		expect(chatIds).toHaveLength(1);
		expect(chatIds[0]).toBe("claimer123");

		sentMessages.length = 0;
		await t.action(internal.reminders.sendDailyUploadReminders, {});

		vi.runAllTimers();
		await t.finishInProgressScheduledFunctions();

		const reminderMessage = sentMessages.find(
			(m) =>
				m.chatId === "claimer123" &&
				m.text?.includes("Upload your new vouchers"),
		);
		expect(reminderMessage).toBeDefined();

		const uploaderMessage = sentMessages.find(
			(m) => m.chatId === "uploader456",
		);
		expect(uploaderMessage).toBeUndefined();

		vi.useRealTimers();
	});
});

describe("Rate Limiting Flow", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
		vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-api-key");
		// Enable fake timers with current real time for predictable time checks
		vi.useFakeTimers({ now: Date.now() });
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("upload limit (10 per 24h) blocks subsequent uploads", async () => {
		const t = convexTest(schema, modules);
		const chatId = "11223344";

		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: chatId,
				coins: 100,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		const imageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["test_image"]));
		});

		// Upload 10 vouchers (the limit)
		for (let i = 0; i < 10; i++) {
			// We can directly use the mutation to populate history quickly
			// or assume the user has existing uploads
			await t.run(async (ctx) => {
				await ctx.db.insert("vouchers", {
					type: "10",
					status: "available",
					imageStorageId,
					uploaderId: userId,
					expiryDate: 0,
					createdAt: Date.now() - 1000, // Just now
				});
			});
		}

		// Try to upload the 11th voucher via Telegram
		// (Simulating a user sending an image)
		const telegramMessage = createTelegramPhotoMessage(chatId);

		// This action eventually calls uploadVoucher internal mutation
		await t.action(internal.telegram.handleTelegramMessage, {
			message: telegramMessage,
		});

		// Wait for any scheduled messages
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		// Verify limit message was sent
		const limitMessage = sentMessages.find(
			(m) =>
				m.chatId === chatId &&
				m.text?.includes("Daily Upload Limit Reached") &&
				m.text?.includes("10 vouchers"),
		);
		expect(limitMessage).toBeDefined();

		// Verify no new voucher was created (count remains 10)
		const count = await t.run(async (ctx) => {
			return (
				await ctx.db
					.query("vouchers")
					.withIndex("by_uploader", (q) => q.eq("uploaderId", userId))
					.collect()
			).length;
		});
		expect(count).toBe(10);
	});

	test("claim limit (5 per 24h) blocks subsequent claims", async () => {
		const t = convexTest(schema, modules);
		const claimerChatId = "55667788";
		const uploaderChatId = "99887766";

		const claimerId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: claimerChatId,
				coins: 500, // Plenty of coins
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		const uploaderId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: uploaderChatId,
				coins: 0,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		const imageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["test_image"]));
		});

		// Simulate 5 existing claims in the last 24h
		for (let i = 0; i < 5; i++) {
			await t.run(async (ctx) => {
				await ctx.db.insert("vouchers", {
					type: "5",
					status: "claimed",
					imageStorageId,
					uploaderId,
					claimerId,
					claimedAt: Date.now() - 1000, // Just now
					expiryDate: Date.now() + 86400000,
					validFrom: Date.now() - 24 * 60 * 60 * 1000,
					createdAt: Date.now() - 10000,
				});
			});
		}

		// Create an available voucher to try and claim
		await t.run(async (ctx) => {
			await ctx.db.insert("vouchers", {
				type: "5",
				status: "available",
				imageStorageId,
				uploaderId,
				expiryDate: Date.now() + 86400000,
				validFrom: Date.now() - 24 * 60 * 60 * 1000,
				createdAt: Date.now(),
			});
		});

		// Try to claim the 6th voucher via Telegram
		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage("5", claimerChatId),
		});

		// Wait for any scheduled messages
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		// Verify limit message was sent
		const limitMessage = sentMessages.find(
			(m) =>
				m.chatId === claimerChatId &&
				m.text?.includes("Daily Claim Limit Reached") &&
				m.text?.includes("5 vouchers"),
		);
		expect(limitMessage).toBeDefined();

		// Verify transaction count for claims is still 5 (actually 0 transactions created in this test setup,
		// but we can check the claimable voucher is still available)
		const availableVoucher = await t.run(async (ctx) => {
			return await ctx.db
				.query("vouchers")
				.withIndex("by_status_type", (q) =>
					q.eq("status", "available").eq("type", "5"),
				)
				.first();
		});
		expect(availableVoucher).toBeDefined(); // Still available, not claimed
	});
});

describe("Voucher Expiration Flow", () => {
	test("expireOldVouchers marks past vouchers as expired", async () => {
		const t = convexTest(schema, modules);
		const uploaderChatId = "222222";

		const uploaderId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: uploaderChatId,
				coins: 0,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		const imageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["test"]));
		});

		const now = Date.now();

		const futureVoucherId = await t.run(async (ctx) => {
			return await ctx.db.insert("vouchers", {
				type: "5",
				status: "available",
				uploaderId,
				imageStorageId,
				expiryDate: now + 86400000, // Tomorrow
				validFrom: now - 86400000,
				createdAt: now,
			});
		});

		const expiredVoucherId = await t.run(async (ctx) => {
			return await ctx.db.insert("vouchers", {
				type: "5",
				status: "available",
				uploaderId,
				imageStorageId,
				expiryDate: now - 86400000, // Yesterday
				validFrom: now - 172800000,
				createdAt: now - 172800000,
			});
		});

		const count = await t.mutation(internal.vouchers.expireOldVouchers, {});

		expect(count).toBe(1);

		const futureVoucher = await t.run(async (ctx) => {
			return await ctx.db.get(futureVoucherId);
		});
		expect(futureVoucher?.status).toBe("available");

		const expiredVoucher = await t.run(async (ctx) => {
			return await ctx.db.get(expiredVoucherId);
		});
		expect(expiredVoucher?.status).toBe("expired");
	});

	test("requestVoucher does not return expired vouchers", async () => {
		const t = convexTest(schema, modules);
		const uploaderChatId = "222222";
		const claimerChatId = "333333";

		const uploaderId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: uploaderChatId,
				coins: 0,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		const claimerId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: claimerChatId,
				coins: 100, // Enough coins
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		const imageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["test"]));
		});

		const now = Date.now();

		await t.run(async (ctx) => {
			return await ctx.db.insert("vouchers", {
				type: "5",
				status: "available",
				uploaderId,
				imageStorageId,
				expiryDate: now - 86400000, // Expired yesterday
				validFrom: now - 172800000,
				createdAt: now - 172800000,
			});
		});

		const result = await t.mutation(internal.vouchers.requestVoucher, {
			userId: claimerId,
			type: "5",
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("No €5 vouchers currently available");
	});
});

describe("Ban Flow Tests", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("reporter banned when 3+ of last 5 claims are reported", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const now = Date.now();

		const uploaderId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: "uploader123",
				coins: 0,
				isBanned: false,
				createdAt: now,
				lastActiveAt: now,
			});
		});

		const reporterId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: "reporter456",
				coins: 100,
				isBanned: false,
				createdAt: now,
				lastActiveAt: now,
			});
		});

		// Create 5 vouchers and have reporter claim all of them
		const voucherIds: Id<"vouchers">[] = [];
		for (let i = 0; i < 5; i++) {
			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob([`voucher-${i}`]));
			});

			const voucherId = await t.run(async (ctx) => {
				return await ctx.db.insert("vouchers", {
					type: "5",
					status: "claimed",
					imageStorageId,
					uploaderId,
					claimerId: reporterId,
					expiryDate: now + 7 * 24 * 60 * 60 * 1000,
					claimedAt: now - (5 - i) * 1000, // Stagger claim times
					createdAt: now - (5 - i) * 2000,
				});
			});
			voucherIds.push(voucherId);
		}

		// Report first voucher on Day 1
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[0],
		});

		// Advance to Day 2 and report second voucher
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[1],
		});

		let reporter = await t.run(async (ctx) => {
			return await ctx.db.get(reporterId);
		});
		expect(reporter?.isBanned).toBe(false);

		// Advance to Day 3 and report third voucher
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[2],
		});

		reporter = await t.run(async (ctx) => {
			return await ctx.db.get(reporterId);
		});
		expect(reporter?.isBanned).toBe(false);

		// Advance to Day 4 and report fourth voucher - this should trigger ban (3 existing + this one)
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		const result4 = await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[3],
		});

		expect(result4.status).toBe("banned");
		expect(result4.message).toContain("3 or more of your last 5 claims");

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		reporter = await t.run(async (ctx) => {
			return await ctx.db.get(reporterId);
		});
		expect(reporter?.isBanned).toBe(true);
		expect(reporter?.bannedAt).toBeDefined();
		vi.useRealTimers();
	});

	test("uploader banned when 3+ of last 5 uploads are reported", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const now = Date.now();

		const uploaderId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: "uploader789",
				coins: 0,
				isBanned: false,
				createdAt: now,
				lastActiveAt: now,
			});
		});

		const reporterId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: "reporter101",
				coins: 100,
				isBanned: false,
				createdAt: now,
				lastActiveAt: now,
			});
		});

		// Create 5 vouchers uploaded by uploader, claimed by reporter
		const voucherIds: Id<"vouchers">[] = [];
		for (let i = 0; i < 5; i++) {
			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob([`voucher-${i}`]));
			});

			const voucherId = await t.run(async (ctx) => {
				return await ctx.db.insert("vouchers", {
					type: "5",
					status: "claimed",
					imageStorageId,
					uploaderId,
					claimerId: reporterId,
					expiryDate: now + 7 * 24 * 60 * 60 * 1000,
					claimedAt: now - (5 - i) * 1000,
					createdAt: now - (5 - i) * 2000, // Most recent upload last
				});
			});
			voucherIds.push(voucherId);
		}

		// Report first voucher on Day 1
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[0],
		});

		// Advance to Day 2 and report second voucher
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[1],
		});

		let uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		expect(uploader?.isBanned).toBe(false);

		// Advance to Day 3 and report third voucher - this should trigger uploader ban (3 of 5)
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[2],
		});

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		expect(uploader?.isBanned).toBe(true);
		expect(uploader?.bannedAt).toBeDefined();
		vi.useRealTimers();
	});

	test("uploader NOT banned when reports come from banned users", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const now = Date.now();

		// Create uploader
		const uploaderId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: "gooduploader",
				coins: 0,
				isBanned: false,
				createdAt: now,
				lastActiveAt: now,
			});
		});

		const goodReporterId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: "goodreporter",
				coins: 100,
				isBanned: false,
				createdAt: now,
				lastActiveAt: now,
			});
		});

		const badReporterId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: "badreporter",
				coins: 100,
				isBanned: true, // Already banned
				bannedAt: now - 1000,
				createdAt: now,
				lastActiveAt: now,
			});
		});

		const voucherIds: Id<"vouchers">[] = [];
		for (let i = 0; i < 5; i++) {
			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob([`voucher-${i}`]));
			});

			const reporterForThisVoucher = i < 3 ? badReporterId : goodReporterId;

			const voucherId = await t.run(async (ctx) => {
				return await ctx.db.insert("vouchers", {
					type: "5",
					status: "claimed",
					imageStorageId,
					uploaderId,
					claimerId: reporterForThisVoucher,
					expiryDate: now + 7 * 24 * 60 * 60 * 1000,
					claimedAt: now - (5 - i) * 1000,
					createdAt: now - (5 - i) * 2000,
				});
			});
			voucherIds.push(voucherId);
		}

		for (let i = 0; i < 3; i++) {
			await t.run(async (ctx) => {
				await ctx.db.insert("reports", {
					voucherId: voucherIds[i],
					reporterId: badReporterId,
					uploaderId,
					reason: "not_working",
					createdAt: now - (3 - i) * 1000,
				});
			});
		}

		await t.mutation(internal.vouchers.reportVoucher, {
			userId: goodReporterId,
			voucherId: voucherIds[3],
		});

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		// Verify uploader is NOT banned (only 1 valid report out of 5)
		const uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		expect(uploader?.isBanned).toBe(false);
		vi.useRealTimers();
	});
});

describe("Failed Uploads", () => {
	beforeEach(() => {
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
		vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-api-key");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.useRealTimers();
	});

	describe("Validation Failures", () => {
		test("records COULD_NOT_READ_VALID_FROM when validFrom missing", async () => {
			vi.useFakeTimers();
			setupFetchMock("missing_valid_from");
			const t = convexTest(schema, modules);
			const chatId = "123456789";

			// Create invite code and user
			await t.run(async (ctx) => {
				await ctx.db.insert("inviteCodes", {
					code: "TESTCODE",
					maxUses: 100,
					usedCount: 0,
					createdAt: Date.now(),
				});
			});

			await t.action(internal.telegram.handleTelegramMessage, {
				message: createTelegramMessage("code TESTCODE", chatId),
			});

			const user = await t.query(internal.users.getUserByTelegramChatId, {
				telegramChatId: chatId,
			});
			expect(user).toBeDefined();

			const userId = user!._id;
			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["fake-image"]));
			});

			const initialUploadCount = user!.uploadCount || 0;

			// Clear messages from user creation
			sentMessages = [];

			// Upload voucher
			await t.mutation(internal.vouchers.uploadVoucher, {
				userId,
				imageStorageId,
			});

			await t.finishAllScheduledFunctions(vi.runAllTimers);

			// Verify failedUpload created
			const failedUploads = await t.run(async (ctx) => {
				return await ctx.db.query("failedUploads").collect();
			});

			expect(failedUploads).toHaveLength(1);
			expect(failedUploads[0]).toMatchObject({
				userId,
				imageStorageId,
				failureType: "validation",
				failureReason: "COULD_NOT_READ_VALID_FROM",
				extractedType: "10",
				extractedBarcode: "1234567890006",
				extractedExpiryDate: expect.any(String),
			});
			expect(failedUploads[0].extractedValidFrom).toBeUndefined();

			// Verify no voucher created
			const vouchers = await t.run(async (ctx) => {
				return await ctx.db.query("vouchers").collect();
			});
			expect(vouchers).toHaveLength(0);

			// Verify uploadCount NOT incremented
			const updatedUser = await t.run(async (ctx) => {
				return await ctx.db.get(userId);
			});
			expect(updatedUser?.uploadCount || 0).toBe(initialUploadCount);

			// Verify error message sent
			expect(sentMessages).toHaveLength(1);
			expect(sentMessages[0].text).toContain("valid from date");
		});

		// Note: We don't test "validFrom >1 year old" because the extraction logic
		// in extract.ts normalizes the validFrom year to match the expiry year,
		// which prevents this scenario from occurring in practice.

		test("records INVALID_TYPE when type is not 5, 10, or 20", async () => {
			vi.useFakeTimers();
			setupFetchMock("invalid_type");
			const t = convexTest(schema, modules);
			const chatId = "111222333";

			await t.run(async (ctx) => {
				await ctx.db.insert("inviteCodes", {
					code: "TEST3",
					maxUses: 100,
					usedCount: 0,
					createdAt: Date.now(),
				});
			});

			await t.action(internal.telegram.handleTelegramMessage, {
				message: createTelegramMessage("code TEST3", chatId),
			});

			const user = await t.query(internal.users.getUserByTelegramChatId, {
				telegramChatId: chatId,
			});

			const userId = user!._id;
			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["fake-image"]));
			});

			// Clear messages from user creation
			sentMessages = [];

			await t.mutation(internal.vouchers.uploadVoucher, {
				userId,
				imageStorageId,
			});

			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const failedUploads = await t.run(async (ctx) => {
				return await ctx.db.query("failedUploads").collect();
			});

			expect(failedUploads).toHaveLength(1);
			expect(failedUploads[0]).toMatchObject({
				failureType: "validation",
				failureReason: "INVALID_TYPE",
				extractedType: "0",
			});

			expect(sentMessages[0].text).toContain("€5, €10, or €20 Dunnes voucher");
		});

		test("records COULD_NOT_READ_EXPIRY_DATE when expiry date missing", async () => {
			vi.useFakeTimers();
			setupFetchMock("missing_expiry");
			const t = convexTest(schema, modules);
			const chatId = "444555666";

			await t.run(async (ctx) => {
				await ctx.db.insert("inviteCodes", {
					code: "TEST4",
					maxUses: 100,
					usedCount: 0,
					createdAt: Date.now(),
				});
			});

			await t.action(internal.telegram.handleTelegramMessage, {
				message: createTelegramMessage("code TEST4", chatId),
			});

			const user = await t.query(internal.users.getUserByTelegramChatId, {
				telegramChatId: chatId,
			});

			const userId = user!._id;
			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["fake-image"]));
			});

			// Clear messages from user creation
			sentMessages = [];

			await t.mutation(internal.vouchers.uploadVoucher, {
				userId,
				imageStorageId,
			});

			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const failedUploads = await t.run(async (ctx) => {
				return await ctx.db.query("failedUploads").collect();
			});

			expect(failedUploads).toHaveLength(1);
			expect(failedUploads[0]).toMatchObject({
				failureType: "validation",
				failureReason: "COULD_NOT_READ_EXPIRY_DATE",
			});

			expect(sentMessages[0].text).toContain("expiry date");
		});

		test("records EXPIRED when voucher already expired", async () => {
			vi.useFakeTimers();
			setupFetchMock("expired");
			const t = convexTest(schema, modules);
			const chatId = "777888999";

			await t.run(async (ctx) => {
				await ctx.db.insert("inviteCodes", {
					code: "TEST5",
					maxUses: 100,
					usedCount: 0,
					createdAt: Date.now(),
				});
			});

			await t.action(internal.telegram.handleTelegramMessage, {
				message: createTelegramMessage("code TEST5", chatId),
			});

			const user = await t.query(internal.users.getUserByTelegramChatId, {
				telegramChatId: chatId,
			});

			const userId = user!._id;
			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["fake-image"]));
			});

			// Clear messages from user creation
			sentMessages = [];

			await t.mutation(internal.vouchers.uploadVoucher, {
				userId,
				imageStorageId,
			});

			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const failedUploads = await t.run(async (ctx) => {
				return await ctx.db.query("failedUploads").collect();
			});

			expect(failedUploads).toHaveLength(1);
			expect(failedUploads[0]).toMatchObject({
				failureType: "validation",
				failureReason: "EXPIRED",
			});

			expect(sentMessages[0].text).toContain("expired");
		});

		test("records TOO_LATE_TODAY when voucher expires today after 9 PM", async () => {
			vi.useFakeTimers();
			setupFetchMock("too_late_today");
			const t = convexTest(schema, modules);

			// Set time to 21:30 (9:30 PM)
			const now = new Date();
			now.setHours(21, 30, 0, 0);
			vi.useFakeTimers({ now: now.getTime() });

			const chatId = "101010101";

			await t.run(async (ctx) => {
				await ctx.db.insert("inviteCodes", {
					code: "TEST6",
					maxUses: 100,
					usedCount: 0,
					createdAt: Date.now(),
				});
			});

			await t.action(internal.telegram.handleTelegramMessage, {
				message: createTelegramMessage("code TEST6", chatId),
			});

			const user = await t.query(internal.users.getUserByTelegramChatId, {
				telegramChatId: chatId,
			});

			const userId = user!._id;
			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["fake-image"]));
			});

			// Clear messages from user creation
			sentMessages = [];

			await t.mutation(internal.vouchers.uploadVoucher, {
				userId,
				imageStorageId,
			});

			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const failedUploads = await t.run(async (ctx) => {
				return await ctx.db.query("failedUploads").collect();
			});

			expect(failedUploads).toHaveLength(1);
			expect(failedUploads[0]).toMatchObject({
				failureType: "validation",
				failureReason: "TOO_LATE_TODAY",
			});

			expect(sentMessages[0].text).toContain("after 9 PM");
		});

		test("records COULD_NOT_READ_BARCODE when barcode missing", async () => {
			vi.useFakeTimers();
			setupFetchMock("missing_barcode");
			const t = convexTest(schema, modules);
			const chatId = "202020202";

			await t.run(async (ctx) => {
				await ctx.db.insert("inviteCodes", {
					code: "TEST7",
					maxUses: 100,
					usedCount: 0,
					createdAt: Date.now(),
				});
			});

			await t.action(internal.telegram.handleTelegramMessage, {
				message: createTelegramMessage("code TEST7", chatId),
			});

			const user = await t.query(internal.users.getUserByTelegramChatId, {
				telegramChatId: chatId,
			});

			const userId = user!._id;
			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["fake-image"]));
			});

			// Clear messages from user creation
			sentMessages = [];

			await t.mutation(internal.vouchers.uploadVoucher, {
				userId,
				imageStorageId,
			});

			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const failedUploads = await t.run(async (ctx) => {
				return await ctx.db.query("failedUploads").collect();
			});

			expect(failedUploads).toHaveLength(1);
			expect(failedUploads[0]).toMatchObject({
				failureType: "validation",
				failureReason: "COULD_NOT_READ_BARCODE",
			});
			expect(failedUploads[0].extractedBarcode).toBeUndefined();

			expect(sentMessages[0].text).toContain("barcode");
		});

		test("records DUPLICATE_BARCODE when barcode already exists", async () => {
			vi.useFakeTimers();
			setupFetchMock("valid_10");
			const t = convexTest(schema, modules);
			const chatId = "303030303";

			await t.run(async (ctx) => {
				await ctx.db.insert("inviteCodes", {
					code: "TEST8",
					maxUses: 100,
					usedCount: 0,
					createdAt: Date.now(),
				});
			});

			await t.action(internal.telegram.handleTelegramMessage, {
				message: createTelegramMessage("code TEST8", chatId),
			});

			const user = await t.query(internal.users.getUserByTelegramChatId, {
				telegramChatId: chatId,
			});

			const userId = user!._id;

			// Create existing voucher with same barcode
			await t.run(async (ctx) => {
				const futureDate = Date.now() + 14 * 24 * 60 * 60 * 1000;
				await ctx.db.insert("vouchers", {
					type: "10",
					status: "available",
					imageStorageId: await ctx.storage.store(new Blob(["old-image"])),
					uploaderId: userId,
					expiryDate: futureDate,
					barcodeNumber: "1234567890002", // Same barcode from valid_10 scenario
					createdAt: Date.now(),
				});
			});

			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["fake-image"]));
			});

			await t.mutation(internal.vouchers.uploadVoucher, {
				userId,
				imageStorageId,
			});

			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const failedUploads = await t.run(async (ctx) => {
				return await ctx.db.query("failedUploads").collect();
			});

			expect(failedUploads).toHaveLength(1);
			expect(failedUploads[0]).toMatchObject({
				failureType: "validation",
				failureReason: "DUPLICATE_BARCODE",
				extractedBarcode: "1234567890002",
			});

			expect(sentMessages).toContainEqual(
				expect.objectContaining({
					text: expect.stringContaining("already been uploaded"),
				}),
			);

			// Verify only 1 voucher exists (the original one)
			const vouchers = await t.run(async (ctx) => {
				return await ctx.db.query("vouchers").collect();
			});
			expect(vouchers).toHaveLength(1);
		});
	});

	describe("System Errors", () => {
		test("records system error when Gemini API fails", async () => {
			vi.useFakeTimers();
			setupFetchMock("gemini_api_error");
			const t = convexTest(schema, modules);
			const chatId = "404040404";

			await t.run(async (ctx) => {
				await ctx.db.insert("inviteCodes", {
					code: "TEST9",
					maxUses: 100,
					usedCount: 0,
					createdAt: Date.now(),
				});
			});

			await t.action(internal.telegram.handleTelegramMessage, {
				message: createTelegramMessage("code TEST9", chatId),
			});

			const user = await t.query(internal.users.getUserByTelegramChatId, {
				telegramChatId: chatId,
			});

			const userId = user!._id;
			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["fake-image"]));
			});

			await t.mutation(internal.vouchers.uploadVoucher, {
				userId,
				imageStorageId,
			});

			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const failedUploads = await t.run(async (ctx) => {
				return await ctx.db.query("failedUploads").collect();
			});

			expect(failedUploads).toHaveLength(1);
			expect(failedUploads[0]).toMatchObject({
				failureType: "system",
				failureReason: "SYSTEM_ERROR",
			});
			expect(failedUploads[0].errorMessage).toContain("Gemini API error");

			// Verify no OCR data
			expect(failedUploads[0].rawOcrResponse).toBeUndefined();
			expect(failedUploads[0].extractedType).toBeUndefined();

			// Verify generic error message sent
			expect(sentMessages).toContainEqual(
				expect.objectContaining({
					text: expect.stringContaining("encountered an error"),
				}),
			);
		});
	});

	describe("Data Integrity", () => {
		test("verifies all required fields present in failed upload", async () => {
			vi.useFakeTimers();
			setupFetchMock("missing_valid_from");
			const t = convexTest(schema, modules);
			const chatId = "505050505";

			await t.run(async (ctx) => {
				await ctx.db.insert("inviteCodes", {
					code: "TEST10",
					maxUses: 100,
					usedCount: 0,
					createdAt: Date.now(),
				});
			});

			await t.action(internal.telegram.handleTelegramMessage, {
				message: createTelegramMessage("code TEST10", chatId),
			});

			const user = await t.query(internal.users.getUserByTelegramChatId, {
				telegramChatId: chatId,
			});

			const userId = user!._id;
			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["fake-image"]));
			});

			await t.mutation(internal.vouchers.uploadVoucher, {
				userId,
				imageStorageId,
			});

			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const failedUploads = await t.run(async (ctx) => {
				return await ctx.db.query("failedUploads").collect();
			});

			const failedUpload = failedUploads[0];
			expect(failedUpload.userId).toBe(userId);
			expect(failedUpload.imageStorageId).toBe(imageStorageId);
			expect(failedUpload.failureType).toBe("validation");
			expect(failedUpload.failureReason).toBe("COULD_NOT_READ_VALID_FROM");
			expect(failedUpload._creationTime).toBeGreaterThan(0);
		});

		test("verifies OCR data is properly stored", async () => {
			vi.useFakeTimers();
			setupFetchMock("invalid_type");
			const t = convexTest(schema, modules);
			const chatId = "606060606";

			await t.run(async (ctx) => {
				await ctx.db.insert("inviteCodes", {
					code: "TEST11",
					maxUses: 100,
					usedCount: 0,
					createdAt: Date.now(),
				});
			});

			await t.action(internal.telegram.handleTelegramMessage, {
				message: createTelegramMessage("code TEST11", chatId),
			});

			const user = await t.query(internal.users.getUserByTelegramChatId, {
				telegramChatId: chatId,
			});

			const userId = user!._id;
			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["fake-image"]));
			});

			await t.mutation(internal.vouchers.uploadVoucher, {
				userId,
				imageStorageId,
			});

			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const failedUploads = await t.run(async (ctx) => {
				return await ctx.db.query("failedUploads").collect();
			});

			const failedUpload = failedUploads[0];
			expect(failedUpload.rawOcrResponse).toBeDefined();
			expect(failedUpload.rawOcrResponse).toContain("candidates");
			expect(failedUpload.extractedType).toBe("0");
			expect(failedUpload.extractedBarcode).toBe("1234567890005");
			expect(failedUpload.extractedExpiryDate).toBeDefined();
		});
	});

	describe("Integration", () => {
		test("verifies upload count NOT incremented on failure", async () => {
			vi.useFakeTimers();
			setupFetchMock("expired");
			const t = convexTest(schema, modules);
			const chatId = "707070707";

			await t.run(async (ctx) => {
				await ctx.db.insert("inviteCodes", {
					code: "TEST12",
					maxUses: 100,
					usedCount: 0,
					createdAt: Date.now(),
				});
			});

			await t.action(internal.telegram.handleTelegramMessage, {
				message: createTelegramMessage("code TEST12", chatId),
			});

			const user = await t.query(internal.users.getUserByTelegramChatId, {
				telegramChatId: chatId,
			});

			const userId = user!._id;
			const initialUploadCount = user!.uploadCount || 0;

			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["fake-image"]));
			});

			await t.mutation(internal.vouchers.uploadVoucher, {
				userId,
				imageStorageId,
			});

			await t.finishAllScheduledFunctions(vi.runAllTimers);

			// Verify uploadCount remains the same
			const updatedUser = await t.run(async (ctx) => {
				return await ctx.db.get(userId);
			});

			expect(updatedUser?.uploadCount || 0).toBe(initialUploadCount);

			// Now upload a successful voucher and verify count increments
			setupFetchMock("valid_10");
			const imageStorageId2 = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["fake-image-2"]));
			});

			await t.mutation(internal.vouchers.uploadVoucher, {
				userId,
				imageStorageId: imageStorageId2,
			});

			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const finalUser = await t.run(async (ctx) => {
				return await ctx.db.get(userId);
			});

			expect(finalUser?.uploadCount || 0).toBe(initialUploadCount + 1);
		});

		test("verifies image storage persists for failed uploads", async () => {
			vi.useFakeTimers();
			setupFetchMock("missing_barcode");
			const t = convexTest(schema, modules);
			const chatId = "808080808";

			await t.run(async (ctx) => {
				await ctx.db.insert("inviteCodes", {
					code: "TEST13",
					maxUses: 100,
					usedCount: 0,
					createdAt: Date.now(),
				});
			});

			await t.action(internal.telegram.handleTelegramMessage, {
				message: createTelegramMessage("code TEST13", chatId),
			});

			const user = await t.query(internal.users.getUserByTelegramChatId, {
				telegramChatId: chatId,
			});

			const userId = user!._id;
			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["fake-image"]));
			});

			await t.mutation(internal.vouchers.uploadVoucher, {
				userId,
				imageStorageId,
			});

			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const failedUploads = await t.run(async (ctx) => {
				return await ctx.db.query("failedUploads").collect();
			});

			expect(failedUploads[0].imageStorageId).toBe(imageStorageId);

			// Verify the storage still exists (not deleted)
			const storageUrl = await t.run(async (ctx) => {
				return await ctx.storage.getUrl(imageStorageId);
			});

			expect(storageUrl).toBeDefined();
		});
	});
});
