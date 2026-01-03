/**
 * Voucher Flow Tests (Upload, Claim, Expiration)
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "../test.setup";
import {
	createTelegramMessage,
	createTelegramPhotoMessage,
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
	| "missing_expiry"
	| "missing_barcode";

function setupFetchMock(scenario: OCRSenario = "valid_10") {
	sentMessages = [];

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
				const futureDate = new Date();
				futureDate.setDate(futureDate.getDate() + 14);
				const futureDateStr = futureDate.toISOString().split("T")[0];

				const validFromDate = new Date();
				validFromDate.setDate(validFromDate.getDate() - 1);
				const validFromDay = validFromDate.getDate();
				const validFromMonth = validFromDate.getMonth() + 1;

				const scenarios: Record<OCRSenario, any> = {
					valid_10: mockGeminiResponse({ type: 10, validFromDay, validFromMonth, expiryDate: futureDateStr, barcode: "1234567890002" }),
					valid_5: mockGeminiResponse({ type: 5, expiryDate: futureDateStr, barcode: "1234567890001" }),
					valid_20: mockGeminiResponse({ type: 20, validFromDay, validFromMonth, expiryDate: futureDateStr, barcode: "1234567890003" }),
					expired: mockGeminiResponse({ type: 10, validFromDay, validFromMonth, expiryDate: "2025-12-27", barcode: "1234567890004" }),
					invalid_type: mockGeminiResponse({ type: 0, validFromDay, validFromMonth, expiryDate: futureDateStr, barcode: "1234567890005" }),
					missing_valid_from: mockGeminiResponse({ type: 10, validFromDay: null, validFromMonth: null, expiryDate: futureDateStr, barcode: "1234567890006" }),
					missing_expiry: mockGeminiResponse({ type: 10, validFromDay, validFromMonth, expiryDate: null, barcode: "1234567890008" }),
					missing_barcode: mockGeminiResponse({ type: 10, validFromDay, validFromMonth, expiryDate: futureDateStr, barcode: null }),
				};

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
		// Setup fetch mock with valid_10 scenario (returns €10 voucher)
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
