/**
 * Voucher Flow Tests (Upload, Claim, Expiration, OCR)
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "../test.setup";
import {
	createTelegramMessage,
	createTelegramPhotoMessage,
	createUser,
	createVoucher,
	mockGeminiResponse,
	mockTelegramResponse,
} from "./fixtures/testHelpers";

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

function setupFetchMock(
	scenario: OCRSenario = "valid_10",
	customExpiryDate?: string,
) {
	sentMessages = [];

	const futureDate = new Date();
	futureDate.setDate(futureDate.getDate() + 14);
	const futureDateStr = futureDate.toISOString().split("T")[0];

	const validFromDate = new Date();
	validFromDate.setDate(validFromDate.getDate() - 1);
	const validFromDay = validFromDate.getDate();
	const validFromMonth = validFromDate.getMonth() + 1;

	const pastDate = new Date();
	pastDate.setDate(pastDate.getDate() - 7);
	const pastDateStr = pastDate.toISOString().split("T")[0];

	const todayDate = new Date();
	const todayDateStr = todayDate.toISOString().split("T")[0];

	const veryOldDay = 1;
	const veryOldMonth = 12;

	const expiryForOldValidFrom = new Date();
	expiryForOldValidFrom.setMonth(11);
	expiryForOldValidFrom.setDate(31);
	const expiryForOldValidFromStr = expiryForOldValidFrom
		.toISOString()
		.split("T")[0];

	const scenarios = {
		valid_10: mockGeminiResponse({
			type: 10,
			validFromDay,
			validFromMonth,
			expiryDate: customExpiryDate || futureDateStr,
			barcode: "1234567890002",
		}),
		valid_5: mockGeminiResponse({
			type: 5,
			expiryDate: customExpiryDate || futureDateStr,
			barcode: "1234567890001",
		}),
		valid_20: mockGeminiResponse({
			type: 20,
			validFromDay,
			validFromMonth,
			expiryDate: futureDateStr,
			barcode: "1234567890003",
		}),
		expired: mockGeminiResponse({
			type: 10,
			validFromDay,
			validFromMonth,
			expiryDate: pastDateStr,
			barcode: "1234567890004",
		}),
		invalid_type: mockGeminiResponse({
			type: 0,
			validFromDay,
			validFromMonth,
			expiryDate: futureDateStr,
			barcode: "1234567890005",
		}),
		missing_valid_from: mockGeminiResponse({
			type: 10,
			validFromDay: null,
			validFromMonth: null,
			expiryDate: futureDateStr,
			barcode: "1234567890006",
		}),
		invalid_valid_from: mockGeminiResponse({
			type: 10,
			validFromDay: veryOldDay,
			validFromMonth: veryOldMonth,
			expiryDate: expiryForOldValidFromStr,
			barcode: "1234567890007",
		}),
		missing_expiry: mockGeminiResponse({
			type: 10,
			validFromDay,
			validFromMonth,
			expiryDate: null,
			barcode: "1234567890008",
		}),
		missing_barcode: mockGeminiResponse({
			type: 10,
			validFromDay,
			validFromMonth,
			expiryDate: futureDateStr,
			barcode: null,
		}),
		too_late_today: mockGeminiResponse({
			type: 10,
			validFromDay,
			validFromMonth,
			expiryDate: todayDateStr,
			barcode: "1234567890010",
		}),
		gemini_api_error: null,
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
				if (scenario === "gemini_api_error") {
					throw new Error("Gemini API error");
				}
				return {
					ok: true,
					json: async () => scenarios[scenario],
				} as Response;
			}

			// Mock Convex storage
			if (url.includes("convex.cloud") || url.includes("convex.site")) {
				return {
					ok: true,
					arrayBuffer: async () => new ArrayBuffer(100),
					blob: async () => new Blob(["voucher-image"], { type: "image/jpeg" }),
				} as Response;
			}

			console.warn(`Unmocked fetch: ${url}`);
			return { ok: false, status: 404 } as Response;
		}),
	);
}

// ============================================================================
// Voucher Upload Flow
// ============================================================================

describe("Voucher Upload Flow", () => {
	beforeEach(() => {
		setupFetchMock("valid_10");
		vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-api-key");
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
		const userId = await createUser(t, { telegramChatId: chatId, coins: 20 });

		// Simulate sending a photo
		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramPhotoMessage({ chatId }),
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

// ============================================================================
// Voucher Claim Flow
// ============================================================================

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
		const userId = await createUser(t, { telegramChatId: chatId, coins: 20 });

		// Create another user (the uploader)
		const uploaderId = await createUser(t, {
			telegramChatId: "uploader123",
			coins: 0,
		});

		// Create an available voucher
		await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "available",
		});

		// Claim the voucher via Telegram command
		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage({ text: "10", chatId }),
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

		const userId = await createUser(t, { telegramChatId: chatId, coins: 5 });

		// Create another user (the uploader)
		const uploaderId = await createUser(t, {
			telegramChatId: "uploader456",
			coins: 0,
		});

		// Create an available voucher
		await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "available",
		});

		// Try to claim via Telegram
		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage({ text: "10", chatId }),
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

		await createUser(t, { telegramChatId: chatId, coins: 20 });

		// Try to claim without any vouchers in system
		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage({ text: "10", chatId }),
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

// ============================================================================
// Voucher Expiration Flow
// ============================================================================

describe("Voucher Expiration Flow", () => {
	test("expireOldVouchers marks past vouchers as expired", async () => {
		const t = convexTest(schema, modules);
		const uploaderChatId = "222222";

		const uploaderId = await createUser(t, {
			telegramChatId: uploaderChatId,
			coins: 0,
		});

		const now = Date.now();

		const futureVoucherId = await createVoucher(t, {
			type: "5",
			uploaderId,
			status: "available",
			expiryDate: now + 86400000, // Tomorrow
			validFrom: now - 86400000,
			createdAt: now,
		});

		const expiredVoucherId = await createVoucher(t, {
			type: "5",
			uploaderId,
			status: "available",
			expiryDate: now - 86400000, // Yesterday
			validFrom: now - 172800000,
			createdAt: now - 172800000,
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

		const uploaderId = await createUser(t, {
			telegramChatId: uploaderChatId,
			coins: 0,
		});
		const claimerId = await createUser(t, {
			telegramChatId: claimerChatId,
			coins: 100,
		});

		const now = Date.now();

		await createVoucher(t, {
			type: "5",
			uploaderId,
			status: "available",
			expiryDate: now - 86400000, // Expired yesterday
			validFrom: now - 172800000,
			createdAt: now - 172800000,
		});

		const result = await t.mutation(internal.vouchers.requestVoucher, {
			userId: claimerId,
			type: "5",
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("No €5 vouchers currently available");
	});
});

// ============================================================================
// OCR Flow with Mocked Gemini
// ============================================================================

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
		const userId = await createUser(t, { telegramChatId: "123456", coins: 0 });

		// Create storage and voucher
		const imageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["fake-image"]));
		});

		await t.run(async (ctx) => {
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
		const userId = await createUser(t, { telegramChatId: "123456", coins: 0 });

		// Create storage and voucher
		const imageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["fake-image"]));
		});

		await t.run(async (ctx) => {
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
		const pastDate = new Date(
			Date.now() - 7 * 24 * 60 * 60 * 1000,
		).toISOString();
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
		await t.mutation(internal.users.createUser, {
			telegramChatId: chatId,
		});

		// Mock response with expiration date set to today
		setupFetchMock("valid_5", todayStr);

		// Stub Gemini API key
		vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-api-key");
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");

		// Send telegram photo message
		const message = createTelegramPhotoMessage({ chatId });

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
				m.text?.includes(
					"Vouchers expiring today can only be uploaded before 9 PM",
				),
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
		const userId = await createUser(t, { telegramChatId: chatId, coins: 0 });

		// Create first voucher with the same barcode that OCR will return
		await createVoucher(t, {
			type: "10",
			uploaderId: userId,
			status: "available",
			barcodeNumber: duplicateBarcode,
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
