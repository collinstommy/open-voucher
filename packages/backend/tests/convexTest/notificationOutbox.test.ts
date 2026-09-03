/**
 * Stage 4 (HTML flows tester + notification outbox) at unit layer:
 * - chatless users get notificationOutbox rows where Telegram sends would
 *   have happened, and zero Bot API sends are recorded for them
 * - linked users still get Telegram sends and zero outbox rows
 * - public upload/claim/report wrappers are thin over the internals
 *
 * E2E (bun test tests/e2e/) re-proves the same routing over real HTTP with
 * OCR_BYPASS=1 once a provisioned local backend exists; granular coverage
 * lives here with the same scoped fetch-stub pattern as vouchers.test.ts.
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "../test.setup";
import {
	createUser,
	createVoucher,
	mockGeminiResponse,
	mockTelegramResponse,
} from "./fixtures/testHelpers";

let sentMessages: { chatId: string; text?: string }[] = [];

function setupFetchMock() {
	sentMessages = [];

	const futureDate = new Date();
	futureDate.setDate(futureDate.getDate() + 14);
	const futureDateStr = futureDate.toISOString().split("T")[0];

	const validFromDate = new Date();
	validFromDate.setDate(validFromDate.getDate() - 1);

	const ocrResponse = mockGeminiResponse({
		type: 10,
		validFromDay: validFromDate.getDate(),
		validFromMonth: validFromDate.getMonth() + 1,
		expiryDate: futureDateStr,
		barcode: "stage4-outbox-test-001",
	});

	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, options?: RequestInit) => {
			if (url.includes("api.telegram.org") && url.includes("/sendMessage")) {
				let body: { chat_id?: string; text?: string } = {};
				if (typeof options?.body === "string") {
					body = JSON.parse(options.body);
				}
				sentMessages.push({ chatId: String(body.chat_id), text: body.text });
				return {
					ok: true,
					json: async () => mockTelegramResponse(),
				} as Response;
			}
			if (url.includes("generativelanguage.googleapis.com")) {
				return {
					ok: true,
					json: async () => ocrResponse,
				} as Response;
			}
			// Convex storage URL fetches (image bytes for OCR).
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

/** Chatless (Google-only) user: no telegramChatId column at all. */
async function createChatlessUser(t: any, coins = 0): Promise<Id<"users">> {
	return await t.run(async (ctx: any) => {
		return await ctx.db.insert("users", {
			username: "chatless",
			coins,
			isBanned: false,
			createdAt: Date.now(),
			lastActiveAt: Date.now(),
		});
	});
}

async function getOutbox(t: any, userId: Id<"users">) {
	return await t.run(async (ctx: any) => {
		return await ctx.db
			.query("notificationOutbox")
			.withIndex("by_user", (q: any) => q.eq("userId", userId))
			.collect();
	});
}

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

describe("Stage 4: upload decoupling", () => {
	test("chatless upload via wrapper writes an outbox row and sends nothing", async () => {
		const t = convexTest(schema, modules);
		const userId = await createChatlessUser(t);

		const imageStorageId = await t.run(async (ctx: any) => {
			return await ctx.storage.store(new Blob(["fake-image"]));
		});

		const authed = t.withIdentity({ subject: userId });
		const uploadUrl = await authed.mutation(
			api.vouchers.generateVoucherUploadUrl,
			{},
		);
		expect(typeof uploadUrl).toBe("string");

		const result = await authed.mutation(api.vouchers.uploadVoucherFromApp, {
			imageStorageId,
		});
		expect(result).toEqual({ success: true });

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const voucher = await t.run(async (ctx: any) => {
			return await ctx.db
				.query("vouchers")
				.withIndex("by_uploader", (q: any) => q.eq("uploaderId", userId))
				.first();
		});
		expect(voucher?.status).toBe("available");
		expect(voucher?.type).toBe("10");

		expect(sentMessages).toEqual([]);

		const outbox = await getOutbox(t, userId);
		expect(outbox.length).toBe(1);
		expect(outbox[0].kind).toBe("upload_accepted");
		expect(outbox[0].payload.text).toContain("Voucher Accepted!");
		expect(outbox[0].readAt).toBeUndefined();
	});

	test("linked upload still sends Telegram and writes no outbox rows", async () => {
		const t = convexTest(schema, modules);
		const chatId = "stage4-linked-uploader";
		const userId = await createUser(t, { telegramChatId: chatId, coins: 0 });

		const imageStorageId = await t.run(async (ctx: any) => {
			return await ctx.storage.store(new Blob(["fake-image"]));
		});

		const authed = t.withIdentity({ subject: userId });
		await authed.mutation(api.vouchers.uploadVoucherFromApp, {
			imageStorageId,
		});

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const accepted = sentMessages.find(
			(m) => m.chatId === chatId && m.text?.includes("Voucher Accepted!"),
		);
		expect(accepted).toBeDefined();

		expect(await getOutbox(t, userId)).toEqual([]);
	});
});

describe("Stage 4: claim decoupling", () => {
	test("chatless claim via wrapper claims and writes an outbox row", async () => {
		const t = convexTest(schema, modules);
		const claimerId = await createChatlessUser(t, 20);
		const uploaderId = await createUser(t, {
			telegramChatId: "stage4-claim-uploader",
			coins: 0,
		});
		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "available",
		});

		const authed = t.withIdentity({ subject: claimerId });
		const result = await authed.mutation(api.vouchers.claimVoucherFromApp, {
			type: "10",
		});

		expect(result.success).toBe(true);

		const voucher = await t.run(async (ctx: any) => {
			return await ctx.db.get(voucherId);
		});
		expect(voucher?.status).toBe("claimed");
		expect(voucher?.claimerId).toBe(claimerId);

		expect(sentMessages).toEqual([]);

		const outbox = await getOutbox(t, claimerId);
		expect(outbox.length).toBe(1);
		expect(outbox[0].kind).toBe("claim_success");
		expect(outbox[0].payload.text).toContain("Here is your €10 voucher!");
	});

	test("linked claim via wrapper sends nothing extra and writes no rows", async () => {
		const t = convexTest(schema, modules);
		const chatId = "stage4-linked-claimer";
		const claimerId = await createUser(t, {
			telegramChatId: chatId,
			coins: 20,
		});
		const uploaderId = await createUser(t, {
			telegramChatId: "stage4-claim-uploader-2",
			coins: 0,
		});
		await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "available",
		});

		const authed = t.withIdentity({ subject: claimerId });
		const result = await authed.mutation(api.vouchers.claimVoucherFromApp, {
			type: "10",
		});
		expect(result.success).toBe(true);

		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(sentMessages).toEqual([]);
		expect(await getOutbox(t, claimerId)).toEqual([]);
	});
});

describe("Stage 4: report decoupling", () => {
	test("chatless report notifies reporter and chatless uploader via outbox only", async () => {
		const t = convexTest(schema, modules);
		const uploaderId = await createChatlessUser(t);
		const reporterId = await createChatlessUser(t, 20);

		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId: reporterId,
			claimedAt: Date.now(),
			barcodeNumber: "stage4-report-001",
		});

		const authed = t.withIdentity({ subject: reporterId });
		const result = await authed.mutation(api.vouchers.reportVoucherFromApp, {
			voucherId,
		});
		expect(result.status).toBe("reported");

		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(sentMessages).toEqual([]);

		const reporterOutbox = await getOutbox(t, reporterId);
		expect(reporterOutbox.length).toBe(1);
		expect(reporterOutbox[0].kind).toBe("report_received");

		const uploaderOutbox = await getOutbox(t, uploaderId);
		expect(uploaderOutbox.length).toBe(1);
		expect(uploaderOutbox[0].kind).toBe("uploader_reported");
		expect(uploaderOutbox[0].payload.text).toContain(
			"Someone has reported one of your vouchers",
		);
	});

	test("report on a linked uploader's voucher still schedules the Telegram ask", async () => {
		const t = convexTest(schema, modules);
		const uploaderChatId = "stage4-reported-uploader";
		const uploaderId = await createUser(t, {
			telegramChatId: uploaderChatId,
			coins: 0,
		});
		const reporterId = await createChatlessUser(t, 20);

		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId: reporterId,
			claimedAt: Date.now(),
			barcodeNumber: "stage4-report-002",
		});

		const authed = t.withIdentity({ subject: reporterId });
		const result = await authed.mutation(api.vouchers.reportVoucherFromApp, {
			voucherId,
		});
		expect(result.status).toBe("reported");

		// No outbox row for the linked uploader; their ask goes to Telegram.
		expect(await getOutbox(t, uploaderId)).toEqual([]);
	});
});

describe("Stage 4: outbox reader", () => {
	test("getMyNotifications + markNotificationRead round trip", async () => {
		const t = convexTest(schema, modules);
		const userId = await createChatlessUser(t);

		await t.mutation(internal.notifications.insertOutboxRow, {
			userId,
			kind: "generic",
			payload: { text: "hello" },
		});

		const authed = t.withIdentity({ subject: userId });
		const rows = await authed.query(api.notifications.getMyNotifications, {});
		expect(rows.length).toBe(1);
		expect(rows[0].payload.text).toBe("hello");
		expect(rows[0].readAt).toBeUndefined();

		await authed.mutation(api.notifications.markNotificationRead, {
			notificationId: rows[0]._id,
		});
		const after = await authed.query(api.notifications.getMyNotifications, {});
		expect(after[0].readAt).toBeDefined();
	});

	test("markNotificationRead rejects another user's row", async () => {
		const t = convexTest(schema, modules);
		const ownerId = await createChatlessUser(t);
		const otherId = await createChatlessUser(t);

		const rowId = await t.run(async (ctx: any) => {
			return await ctx.db.insert("notificationOutbox", {
				userId: ownerId,
				kind: "generic",
				payload: { text: "mine" },
			});
		});

		const authed = t.withIdentity({ subject: otherId });
		await expect(
			authed.mutation(api.notifications.markNotificationRead, {
				notificationId: rowId,
			}),
		).rejects.toThrowError("Notification not found");
	});
});
