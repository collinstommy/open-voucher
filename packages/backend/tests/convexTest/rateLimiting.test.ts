/**
 * Rate Limiting Flow Tests
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
	mockTelegramResponse,
} from "./fixtures/testHelpers";

let sentMessages: { chatId: string; text?: string }[] = [];

function setupFetchMock() {
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

describe("Rate Limiting Flow", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
		vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-api-key");
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

		const userId = await createUser(t, { telegramChatId: chatId, coins: 100 });

		// Upload 10 vouchers (the limit)
		for (let i = 0; i < 10; i++) {
			await createVoucher(t, {
				type: "10",
				uploaderId: userId,
				status: "available",
				expiryDate: 0,
				createdAt: Date.now() - 1000, // Just now
			});
		}

		// Try to upload the 11th voucher via Telegram
		const telegramMessage = createTelegramPhotoMessage({ chatId });

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

		const claimerId = await createUser(t, {
			telegramChatId: claimerChatId,
			coins: 500,
		});
		const uploaderId = await createUser(t, {
			telegramChatId: uploaderChatId,
			coins: 0,
		});

		// Simulate 5 existing claims in the last 24h
		for (let i = 0; i < 5; i++) {
			await createVoucher(t, {
				type: "5",
				uploaderId,
				status: "claimed",
				claimerId,
				claimedAt: Date.now() - 1000, // Just now
			});
		}

		// Create an available voucher to try and claim
		await createVoucher(t, {
			type: "5",
			uploaderId,
			status: "available",
		});

		// Try to claim the 6th voucher via Telegram
		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage({ text: "5", chatId: claimerChatId }),
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

		// Verify transaction count for claims is still 5
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
