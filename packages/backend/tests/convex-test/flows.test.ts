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
	type: string,
	validFrom: string,
	expiryDate: string,
	barcode: string,
) {
	return {
		candidates: [
			{
				content: {
					parts: [
						{
							text: JSON.stringify({ type, validFrom, expiryDate, barcode }),
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
	| "invalid_type";

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
	const validFromStr = validFromDate.toISOString().split("T")[0];

	const pastDate = new Date();
	pastDate.setDate(pastDate.getDate() - 7);
	const pastDateStr = pastDate.toISOString().split("T")[0];

	const scenarios = {
		valid_5: mockGeminiResponse(
			"5",
			validFromStr,
			customExpiryDate || futureDateStr,
			"1234567890001",
		),
		valid_10: mockGeminiResponse(
			"10",
			validFromStr,
			futureDateStr,
			"1234567890002",
		),
		valid_20: mockGeminiResponse(
			"20",
			validFromStr,
			futureDateStr,
			"1234567890003",
		),
		expired: mockGeminiResponse(
			"10",
			validFromStr,
			pastDateStr,
			"1234567890004",
		),
		invalid_type: mockGeminiResponse(
			"0",
			validFromStr,
			futureDateStr,
			"1234567890005",
		),
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

describe("OCR Upload Flow", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.useFakeTimers();
		vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-api-key");
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("valid voucher creates voucher and awards coins", async () => {
		setupFetchMock("valid_10");
		const t = convexTest(schema, modules);
		const chatId = "123456";

		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: chatId,
				coins: 0,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		const imageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["fake-image"]));
		});

		const voucherId = await t.mutation(internal.vouchers.uploadVoucher, {
			userId,
			imageStorageId,
		});

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(voucherId).toBeDefined();

		const voucher = await t.run(async (ctx) => {
			return await ctx.db.get(voucherId!);
		});
		expect(voucher?.status).toBe("available");
		expect(voucher?.type).toBe("10");
		expect(voucher?.barcodeNumber).toBe("1234567890002");

		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId);
		});
		expect(user?.coins).toBe(10);
		expect(user?.uploadCount).toBe(1);

		const successMsg = sentMessages.find(
			(m) =>
				m.chatId === chatId &&
				m.text?.includes("Voucher Accepted") &&
				m.text?.includes("+10"),
		);
		expect(successMsg).toBeDefined();
	});

	test("expired voucher sends error message and does not create voucher", async () => {
		setupFetchMock("expired");
		const t = convexTest(schema, modules);
		const chatId = "123456";

		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: chatId,
				coins: 0,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		const imageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["fake-image"]));
		});

		const voucherId = await t.mutation(internal.vouchers.uploadVoucher, {
			userId,
			imageStorageId,
		});

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(voucherId).toBeNull();

		const vouchers = await t.run(async (ctx) => {
			return await ctx.db.query("vouchers").collect();
		});
		expect(vouchers.length).toBe(0);

		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId);
		});
		expect(user?.coins).toBe(0);
		expect(user?.uploadCount).toBeUndefined();

		const errorMsg = sentMessages.find(
			(m) =>
				m.chatId === chatId &&
				m.text?.includes("Voucher Processing Failed") &&
				m.text?.includes("expired"),
		);
		expect(errorMsg).toBeDefined();
	});

	test("invalid type sends error message and does not create voucher", async () => {
		setupFetchMock("invalid_type");
		const t = convexTest(schema, modules);
		const chatId = "123456";

		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: chatId,
				coins: 0,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		const imageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["fake-image"]));
		});

		const voucherId = await t.mutation(internal.vouchers.uploadVoucher, {
			userId,
			imageStorageId,
		});

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(voucherId).toBeNull();

		const vouchers = await t.run(async (ctx) => {
			return await ctx.db.query("vouchers").collect();
		});
		expect(vouchers.length).toBe(0);

		const errorMsg = sentMessages.find(
			(m) =>
				m.chatId === chatId &&
				m.text?.includes("Voucher Processing Failed") &&
				m.text?.includes("not appear to be a valid"),
		);
		expect(errorMsg).toBeDefined();
	});

	test("voucher expiring today after 9 PM is rejected", async () => {
		const t = convexTest(schema, modules);
		const chatId = "12345";

		await t.mutation(internal.users.createUserWithInvite, {
			telegramChatId: chatId,
			inviteCode: "TEST",
		});

		const todayStr = "2025-12-21";
		const mockNow = new Date(`${todayStr}T21:30:00`);
		vi.setSystemTime(mockNow);

		setupFetchMock("valid_5", todayStr);
		vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-api-key");
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");

		const user = await t.query(internal.users.getUserByTelegramChatId, {
			telegramChatId: chatId,
		});

		const imageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["fake-image"]));
		});

		const voucherId = await t.mutation(internal.vouchers.uploadVoucher, {
			userId: user!._id,
			imageStorageId,
		});

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(voucherId).toBeNull();

		const vouchers = await t.run(async (ctx) => {
			return ctx.db
				.query("vouchers")
				.withIndex("by_uploader", (q) => q.eq("uploaderId", user!._id))
				.collect();
		});

		expect(vouchers.length).toBe(0);

		const errorMsg = sentMessages.find(
			(m) =>
				m.chatId === chatId &&
				m.text?.includes("Voucher Processing Failed") &&
				m.text?.includes("expired"),
		);
		expect(errorMsg).toBeDefined();
	});

	test("duplicate barcode is rejected", async () => {
		setupFetchMock("valid_10");
		const t = convexTest(schema, modules);
		const chatId = "123456";
		const duplicateBarcode = "1234567890002";

		const userId = await t.run(async (ctx) => {
			return await ctx.db.insert("users", {
				telegramChatId: chatId,
				coins: 0,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});
		});

		const existingImageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["existing-image"]));
		});

		await t.run(async (ctx) => {
			await ctx.db.insert("vouchers", {
				type: "10",
				status: "available",
				imageStorageId: existingImageStorageId,
				uploaderId: userId,
				expiryDate: Date.now() + 14 * 24 * 60 * 60 * 1000,
				validFrom: Date.now() - 24 * 60 * 60 * 1000,
				barcodeNumber: duplicateBarcode,
				createdAt: Date.now(),
			});
		});

		const newImageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["new-image"]));
		});

		const voucherId = await t.mutation(internal.vouchers.uploadVoucher, {
			userId,
			imageStorageId: newImageStorageId,
		});

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(voucherId).toBeNull();

		const vouchers = await t.run(async (ctx) => {
			return await ctx.db.query("vouchers").collect();
		});
		expect(vouchers.length).toBe(1);

		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId);
		});
		expect(user?.coins).toBe(0);

		const errorMsg = sentMessages.find(
			(m) => m.chatId === chatId && m.text?.includes("already been uploaded"),
		);
		expect(errorMsg).toBeDefined();
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
