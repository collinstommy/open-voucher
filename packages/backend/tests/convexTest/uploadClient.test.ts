/**
 * Linked-account uploads: Telegram+Google identity does not imply Telegram
 * delivery. Client is request-scoped — Android uploads must not DM Telegram.
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "../test.setup";
import {
	createUser,
	createVoucher,
	mockGeminiResponse,
	mockTelegramResponse,
} from "./fixtures/testHelpers";

let sentMessages: { chatId: string; text?: string }[] = [];

function setupFetchMock(opts: { geminiError?: boolean } = {}) {
	sentMessages = [];

	const futureDate = new Date();
	futureDate.setDate(futureDate.getDate() + 14);
	const futureDateStr = futureDate.toISOString().split("T")[0];

	const validFromDate = new Date();
	validFromDate.setDate(validFromDate.getDate() - 1);

	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, options?: RequestInit) => {
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

			if (url.includes("generativelanguage.googleapis.com")) {
				if (opts.geminiError) {
					throw new Error("Gemini API error");
				}
				return {
					ok: true,
					json: async () =>
						mockGeminiResponse({
							type: 10,
							validFromDay: validFromDate.getDate(),
							validFromMonth: validFromDate.getMonth() + 1,
							expiryDate: futureDateStr,
							barcode: `linked-${Date.now()}`,
						}),
				} as Response;
			}

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

async function insertLinkedUser(
	t: ReturnType<typeof convexTest>,
	chatId: string,
) {
	const userId = await createUser(t, { telegramChatId: chatId, coins: 10 });
	await t.run(async (ctx) => {
		await ctx.db.insert("authIdentities", {
			provider: "google",
			providerAccountId: `sub-${chatId}`,
			userId,
			email: "linked@gmail.com",
		});
	});
	return userId;
}

describe("Upload client delivery", () => {
	beforeEach(() => {
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
		vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-api-key");
		vi.useFakeTimers({ now: Date.now() });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.useRealTimers();
	});

	test("linked account uploading from Android does not send Telegram", async () => {
		setupFetchMock();
		const t = convexTest(schema, modules);
		const chatId = "android-linked-1";
		const userId = await insertLinkedUser(t, chatId);

		const imageStorageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["fake-image"])),
		);
		sentMessages = [];

		const result = await t.mutation(internal.vouchers.uploadVoucher, {
			userId,
			imageStorageId,
			client: "android",
		});
		expect(result).toEqual({ accepted: true });

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const vouchers = await t.run(async (ctx) =>
			ctx.db.query("vouchers").collect(),
		);
		expect(vouchers).toHaveLength(1);
		expect(vouchers[0].status).toBe("available");
		expect(sentMessages).toHaveLength(0);
	});

	test("linked account uploading from Telegram still gets a Bot API message", async () => {
		setupFetchMock();
		const t = convexTest(schema, modules);
		const chatId = "telegram-linked-1";
		const userId = await insertLinkedUser(t, chatId);

		const imageStorageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["fake-image"])),
		);
		sentMessages = [];

		await t.mutation(internal.vouchers.uploadVoucher, {
			userId,
			imageStorageId,
			client: "telegram",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(sentMessages).toHaveLength(1);
		expect(sentMessages[0].chatId).toBe(chatId);
		expect(sentMessages[0].text).toContain("Voucher Accepted");
	});

	test("Android daily limit returns daily_limit and does not Telegram", async () => {
		setupFetchMock();
		const t = convexTest(schema, modules);
		const chatId = "android-limit-1";
		const userId = await insertLinkedUser(t, chatId);

		for (let i = 0; i < 10; i++) {
			await createVoucher(t, {
				type: "10",
				uploaderId: userId,
				status: "available",
				createdAt: Date.now() - 1000,
			});
		}

		const imageStorageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["fake-image"])),
		);
		sentMessages = [];

		const result = await t.mutation(internal.vouchers.uploadVoucher, {
			userId,
			imageStorageId,
			client: "android",
		});
		expect(result).toEqual({ accepted: false, reason: "daily_limit" });

		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(sentMessages).toHaveLength(0);
	});

	test("Android OCR failure does not send Telegram", async () => {
		setupFetchMock({ geminiError: true });
		const t = convexTest(schema, modules);
		const chatId = "android-ocr-fail-1";
		const userId = await insertLinkedUser(t, chatId);

		const imageStorageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["fake-image"])),
		);
		sentMessages = [];

		await t.mutation(internal.vouchers.uploadVoucher, {
			userId,
			imageStorageId,
			client: "android",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(sentMessages).toHaveLength(0);
	});

	test("submitUpload requires auth and accepts android client", async () => {
		setupFetchMock();
		const t = convexTest(schema, modules);
		const chatId = "android-submit-1";
		const userId = await insertLinkedUser(t, chatId);

		const imageStorageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["fake-image"])),
		);
		sentMessages = [];

		await expect(
			t.mutation(api.vouchers.submitUpload, {
				imageStorageId,
				client: "android",
			}),
		).rejects.toThrow("Unauthorized");

		const asUser = t.withIdentity({ subject: userId });
		const result = await asUser.mutation(api.vouchers.submitUpload, {
			imageStorageId,
			client: "android",
		});
		expect(result).toEqual({ accepted: true });

		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(sentMessages).toHaveLength(0);

		const vouchers = await t.run(async (ctx) =>
			ctx.db.query("vouchers").collect(),
		);
		expect(vouchers).toHaveLength(1);
	});

	test("submitUpload rejects telegram as a client", async () => {
		setupFetchMock();
		const t = convexTest(schema, modules);
		const userId = await insertLinkedUser(t, "no-spoof-1");
		const imageStorageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["fake-image"])),
		);

		const asUser = t.withIdentity({ subject: userId });
		await expect(
			asUser.mutation(api.vouchers.submitUpload, {
				imageStorageId,
				// @ts-expect-error telegram is not an app client
				client: "telegram",
			}),
		).rejects.toThrow();
	});

	test("generateUploadUrl requires auth", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(api.vouchers.generateUploadUrl, {}),
		).rejects.toThrow("Unauthorized");

		const userId = await createUser(t, { telegramChatId: "url-user-1" });
		const asUser = t.withIdentity({ subject: userId });
		const url = await asUser.mutation(api.vouchers.generateUploadUrl, {});
		expect(typeof url).toBe("string");
		expect(url.length).toBeGreaterThan(0);
	});
});
