/**
 * Failed Uploads Tests (Validation, System Errors, Data Integrity, Integration)
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "../test.setup";
import {
	createUser,
	mockGeminiResponse,
	mockTelegramResponse,
} from "./fixtures/testHelpers";

let sentMessages: { chatId: string; text?: string }[] = [];

type OCRSenario =
	| "valid_10"
	| "expired"
	| "invalid_type"
	| "missing_valid_from"
	| "missing_expiry"
	| "missing_barcode"
	| "too_late_today"
	| "gemini_api_error";

function setupFetchMock(geminiScenario: OCRSenario = "valid_10") {
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

	const scenarios = {
		valid_10: mockGeminiResponse({
			type: 10,
			validFromDay,
			validFromMonth,
			expiryDate: futureDateStr,
			barcode: "1234567890002",
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
						result: { file_path: "test/file/path.jpg" },
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

			// Create user with createUser helper
			const userId = await createUser(t, { telegramChatId: chatId });
			const initialUploadCount = 0;
			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["fake-image"]));
			});

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

		test("records INVALID_TYPE when type is not 5, 10, or 20", async () => {
			vi.useFakeTimers();
			setupFetchMock("invalid_type");
			const t = convexTest(schema, modules);
			const chatId = "111222333";

			const userId = await createUser(t, { telegramChatId: chatId });
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

			// Create user with createUser helper
			const userId = await createUser(t, { telegramChatId: chatId });
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

			// Create user with createUser helper
			const userId = await createUser(t, { telegramChatId: chatId });
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

			// Create user with createUser helper
			const userId = await createUser(t, { telegramChatId: chatId });
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

			// Create user with createUser helper
			const userId = await createUser(t, { telegramChatId: chatId });
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

			// Create user with createUser helper
			const userId = await createUser(t, { telegramChatId: chatId });

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

			// Create user with createUser helper
			const userId = await createUser(t, { telegramChatId: chatId });
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

			// Create user with createUser helper
			const userId = await createUser(t, { telegramChatId: chatId });
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

			// Create user with createUser helper
			const userId = await createUser(t, { telegramChatId: chatId });
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

			// Create user with createUser helper
			const userId = await createUser(t, { telegramChatId: chatId });
			const initialUploadCount = 0;

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

			// Create user with createUser helper
			const userId = await createUser(t, { telegramChatId: chatId });
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
