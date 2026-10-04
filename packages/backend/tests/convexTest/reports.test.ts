/**
 * Report and Ban Flow Tests
 */

import { convexTest } from "convex-test";
import dayjs from "dayjs";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { reportData, uploaderData } from "../../src/telegram/router";
import { modules } from "../test.setup";
import {
	adminLogin,
	createUser,
	createVoucher,
	mockTelegramResponse,
} from "./fixtures/testHelpers";

let sentMessages: { chatId: string; text?: string }[] = [];
let sentPhotos: { chatId: string; caption?: string }[] = [];
let editedMessages: { chatId: string; messageId: number; text?: string }[] = [];

function setupFetchMock() {
	sentMessages = [];
	sentPhotos = [];
	editedMessages = [];

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

			// Mock Telegram sendPhoto
			if (url.includes("api.telegram.org") && url.includes("/sendPhoto")) {
				let body: any = {};
				if (options?.body instanceof FormData) {
					body = Object.fromEntries(options.body as any);
				}
				sentPhotos.push({ chatId: body.chat_id, caption: body.caption });
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

			// Mock Telegram editMessageText / editMessageCaption
			if (
				url.includes("api.telegram.org") &&
				(url.includes("/editMessageText") ||
					url.includes("/editMessageCaption"))
			) {
				let body: any = {};
				if (typeof options?.body === "string") {
					body = JSON.parse(options.body);
				}
				editedMessages.push({
					chatId: body.chat_id,
					messageId: body.message_id,
					text: body.text ?? body.caption,
				});
				return {
					ok: true,
					json: async () => ({ ok: true, result: true }),
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
// Report Flow
// ============================================================================

describe("Report Flow", () => {
	beforeEach(() => {
		setupFetchMock();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("rejects reports for vouchers that expired before today", async () => {
		const t = convexTest(schema, modules);

		const uploaderId = await createUser(t, {
			telegramChatId: "uploader_expired_report",
			coins: 10,
		});
		const claimerId = await createUser(t, {
			telegramChatId: "claimer_expired_report",
			coins: 10,
		});

		const yesterday = dayjs().subtract(1, "day");
		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId,
			claimedAt: Date.now(),
			expiryDate: Date.UTC(
				yesterday.year(),
				yesterday.month(),
				yesterday.date(),
				22,
				59,
				0,
				0,
			),
		});

		const result = await t.mutation(internal.vouchers.reportVoucher, {
			userId: claimerId,
			voucherId,
		});

		expect(result.status).toBe("expired");
	});

	test("allows reports for vouchers expiring today", async () => {
		const t = convexTest(schema, modules);

		const uploaderId = await createUser(t, {
			telegramChatId: "uploader_today_report",
			coins: 10,
		});
		const claimerId = await createUser(t, {
			telegramChatId: "claimer_today_report",
			coins: 10,
		});

		const today = dayjs();
		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId,
			claimedAt: Date.now(),
			expiryDate: Date.UTC(
				today.year(),
				today.month(),
				today.date(),
				22,
				59,
				0,
				0,
			),
		});

		const result = await t.mutation(internal.vouchers.reportVoucher, {
			userId: claimerId,
			voucherId,
		});

		expect(result.status).toBe("reported");
	});

	test("requestReplacement refunds coins or records replacement_received", async () => {
		const t = convexTest(schema, modules);

		const uploaderId = await createUser(t, {
			telegramChatId: "uploader123",
			coins: 10,
		});

		const claimerId = await createUser(t, {
			telegramChatId: "claimer456",
			coins: 10,
		});

		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId,
			claimedAt: Date.now(),
		});

		await t.mutation(internal.vouchers.reportVoucher, {
			userId: claimerId,
			voucherId,
		});

		const noReplacementResult = await t.mutation(
			internal.vouchers.requestReplacement,
			{
				userId: claimerId,
				originalVoucherId: voucherId,
			},
		);

		expect(noReplacementResult.status).toBe("refunded");

		const claimerAfterRefund = await t.run(async (ctx) =>
			ctx.db.get(claimerId),
		);
		expect(claimerAfterRefund?.coins).toBe(20);

		const txsAfterRefund = await t.run(async (ctx) =>
			ctx.db
				.query("transactions")
				.withIndex("by_user", (q) => q.eq("userId", claimerId))
				.collect(),
		);
		expect(
			txsAfterRefund.some((tx) => tx.type === "replacement_received"),
		).toBe(false);

		const uploaderId2 = await createUser(t, {
			telegramChatId: "uploader_replacement_tx",
			coins: 10,
		});
		const claimerId2 = await createUser(t, {
			telegramChatId: "claimer_replacement_tx",
			coins: 10,
		});

		const originalVoucherId = await createVoucher(t, {
			type: "10",
			uploaderId: uploaderId2,
			status: "claimed",
			claimerId: claimerId2,
			claimedAt: Date.now(),
		});

		const replacementVoucherId = await createVoucher(t, {
			type: "10",
			uploaderId: uploaderId2,
			status: "available",
		});

		await t.mutation(internal.vouchers.reportVoucher, {
			userId: claimerId2,
			voucherId: originalVoucherId,
		});

		const replacementResult = await t.mutation(
			internal.vouchers.requestReplacement,
			{
				userId: claimerId2,
				originalVoucherId,
			},
		);

		expect(replacementResult.status).toBe("replaced");

		const txsAfterReplacement = await t.run(async (ctx) =>
			ctx.db
				.query("transactions")
				.withIndex("by_user", (q) => q.eq("userId", claimerId2))
				.collect(),
		);
		const replacementTx = txsAfterReplacement.find(
			(tx) => tx.type === "replacement_received",
		);
		expect(replacementTx).toBeDefined();
		expect(replacementTx?.amount).toBe(0);
		expect(replacementTx?.voucherId).toBe(replacementVoucherId);

		const claimerAfterReplacement = await t.run(async (ctx) =>
			ctx.db.get(claimerId2),
		);
		expect(claimerAfterReplacement?.coins).toBe(10);
	});

	test("refundReportedVoucher refunds coins and records transaction", async () => {
		const t = convexTest(schema, modules);

		const uploaderId = await createUser(t, {
			telegramChatId: "uploader999",
			coins: 10,
		});

		const claimerId = await createUser(t, {
			telegramChatId: "claimer888",
			coins: 10,
		});

		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId,
			claimedAt: Date.now(),
		});

		await t.mutation(internal.vouchers.reportVoucher, {
			userId: claimerId,
			voucherId,
		});

		const refundResult = await t.mutation(
			internal.vouchers.refundReportedVoucher,
			{
				userId: claimerId,
				voucherId,
			},
		);

		expect(refundResult.status).toBe("refunded");
		if (refundResult.status !== "refunded") {
			throw new Error("expected a refund");
		}
		expect(refundResult.refundAmount).toBe(10);

		const claimer = await t.run(async (ctx) => {
			return await ctx.db.get(claimerId);
		});
		expect(claimer?.coins).toBe(20);

		const transactions = await t.run(async (ctx) => {
			return await ctx.db
				.query("transactions")
				.withIndex("by_user", (q) => q.eq("userId", claimerId))
				.collect();
		});
		const refundTx = transactions.find(
			(tx) => tx.type === "refund" && tx.voucherId === voucherId,
		);
		expect(refundTx).toBeTruthy();
		expect(refundTx?.amount).toBe(10);
	});
});

// ============================================================================
// Report Settlement (once-only)
// ============================================================================

describe("Report settlement is once-only", () => {
	async function settleFixture(t: any, coins = 10) {
		const uploaderId = await createUser(t, {
			telegramChatId: `settle_uploader_${Math.random()}`,
		});
		const claimerId = await createUser(t, {
			telegramChatId: `settle_claimer_${Math.random()}`,
			coins,
		});
		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId,
			claimedAt: Date.now(),
		});
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: claimerId,
			voucherId,
		});
		return { uploaderId, claimerId, voucherId };
	}

	test("a second refund attempt does nothing", async () => {
		const t = convexTest(schema, modules);
		const { claimerId, voucherId } = await settleFixture(t, 10);

		const first = await t.mutation(internal.vouchers.refundReportedVoucher, {
			userId: claimerId,
			voucherId,
		});
		expect(first.status).toBe("refunded");

		const second = await t.mutation(internal.vouchers.refundReportedVoucher, {
			userId: claimerId,
			voucherId,
		});
		expect(second.status).toBe("already_settled");

		const [claimer, txs, report] = await t.run(async (ctx) => [
			await ctx.db.get(claimerId),
			await ctx.db
				.query("transactions")
				.withIndex("by_user", (q) => q.eq("userId", claimerId))
				.collect(),
			await ctx.db
				.query("reports")
				.withIndex("by_voucher", (q) => q.eq("voucherId", voucherId))
				.first(),
		]);
		expect(claimer?.coins).toBe(20);
		expect(txs.filter((tx: any) => tx.type === "refund")).toHaveLength(1);
		expect(report?.settlement).toBe("refunded");
	});

	test("replacement after refund does not hand over a voucher", async () => {
		const t = convexTest(schema, modules);
		const { uploaderId, claimerId, voucherId } = await settleFixture(t, 10);

		await t.mutation(internal.vouchers.refundReportedVoucher, {
			userId: claimerId,
			voucherId,
		});

		const spareVoucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "available",
		});

		const result = await t.mutation(internal.vouchers.requestReplacement, {
			userId: claimerId,
			originalVoucherId: voucherId,
		});
		expect(result.status).toBe("already_settled");

		const [spare, claimer] = await t.run(async (ctx) => [
			await ctx.db.get(spareVoucherId),
			await ctx.db.get(claimerId),
		]);
		expect(spare?.status).toBe("available");
		expect(claimer?.coins).toBe(20);
	});

	test("a second replacement attempt does nothing", async () => {
		const t = convexTest(schema, modules);
		const { uploaderId, claimerId, voucherId } = await settleFixture(t, 10);

		const firstSpareId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "available",
		});
		const secondSpareId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "available",
		});

		const first = await t.mutation(internal.vouchers.requestReplacement, {
			userId: claimerId,
			originalVoucherId: voucherId,
		});
		expect(first.status).toBe("replaced");

		const second = await t.mutation(internal.vouchers.requestReplacement, {
			userId: claimerId,
			originalVoucherId: voucherId,
		});
		expect(second.status).toBe("already_settled");

		const [firstSpare, secondSpare, claimer, txs] = await t.run(
			async (ctx) => [
				await ctx.db.get(firstSpareId),
				await ctx.db.get(secondSpareId),
				await ctx.db.get(claimerId),
				await ctx.db
					.query("transactions")
					.withIndex("by_user", (q) => q.eq("userId", claimerId))
					.collect(),
			],
		);
		const claimedCount = [firstSpare, secondSpare].filter(
			(v: any) => v?.status === "claimed",
		).length;
		expect(claimedCount).toBe(1);
		expect(claimer?.coins).toBe(10);
		expect(
			txs.filter((tx: any) => tx.type === "replacement_received"),
		).toHaveLength(1);
	});

	test("refund after replacement does not refund", async () => {
		const t = convexTest(schema, modules);
		const { uploaderId, claimerId, voucherId } = await settleFixture(t, 10);

		await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "available",
		});

		const first = await t.mutation(internal.vouchers.requestReplacement, {
			userId: claimerId,
			originalVoucherId: voucherId,
		});
		expect(first.status).toBe("replaced");

		const second = await t.mutation(internal.vouchers.refundReportedVoucher, {
			userId: claimerId,
			voucherId,
		});
		expect(second.status).toBe("already_settled");

		const [claimer, txs] = await t.run(async (ctx) => [
			await ctx.db.get(claimerId),
			await ctx.db
				.query("transactions")
				.withIndex("by_user", (q) => q.eq("userId", claimerId))
				.collect(),
		]);
		expect(claimer?.coins).toBe(10);
		expect(txs.filter((tx: any) => tx.type === "refund")).toHaveLength(0);
	});

	test("replacement with no stock settles as refunded once", async () => {
		const t = convexTest(schema, modules);
		const { claimerId, voucherId } = await settleFixture(t, 10);

		const first = await t.mutation(internal.vouchers.requestReplacement, {
			userId: claimerId,
			originalVoucherId: voucherId,
		});
		expect(first.status).toBe("refunded");

		const second = await t.mutation(internal.vouchers.requestReplacement, {
			userId: claimerId,
			originalVoucherId: voucherId,
		});
		expect(second.status).toBe("already_settled");

		const third = await t.mutation(internal.vouchers.refundReportedVoucher, {
			userId: claimerId,
			voucherId,
		});
		expect(third.status).toBe("already_settled");

		const [claimer, txs, report] = await t.run(async (ctx) => [
			await ctx.db.get(claimerId),
			await ctx.db
				.query("transactions")
				.withIndex("by_user", (q) => q.eq("userId", claimerId))
				.collect(),
			await ctx.db
				.query("reports")
				.withIndex("by_voucher", (q) => q.eq("voucherId", voucherId))
				.first(),
		]);
		expect(claimer?.coins).toBe(20);
		expect(txs.filter((tx: any) => tx.type === "refund")).toHaveLength(1);
		expect(report?.settlement).toBe("refunded");
	});

	test("replacement skips expired stock and refunds when only expired remain", async () => {
		const t = convexTest(schema, modules);
		const { uploaderId, claimerId, voucherId } = await settleFixture(t, 10);

		const expiredVoucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "available",
			expiryDate: Date.now() - 60 * 60 * 1000,
		});

		const result = await t.mutation(internal.vouchers.requestReplacement, {
			userId: claimerId,
			originalVoucherId: voucherId,
		});
		expect(result.status).toBe("refunded");

		const [expired, claimer, txs, report] = await t.run(async (ctx) => [
			await ctx.db.get(expiredVoucherId),
			await ctx.db.get(claimerId),
			await ctx.db
				.query("transactions")
				.withIndex("by_user", (q) => q.eq("userId", claimerId))
				.collect(),
			await ctx.db
				.query("reports")
				.withIndex("by_voucher", (q) => q.eq("voucherId", voucherId))
				.first(),
		]);
		expect(expired?.status).toBe("available");
		expect(claimer?.coins).toBe(20);
		expect(txs.filter((tx: any) => tx.type === "refund")).toHaveLength(1);
		expect(
			txs.filter((tx: any) => tx.type === "replacement_received"),
		).toHaveLength(0);
		expect(report?.settlement).toBe("refunded");
	});

	test("replacement picks the soonest-expiring qualifying voucher", async () => {
		const t = convexTest(schema, modules);
		const { uploaderId, claimerId, voucherId } = await settleFixture(t, 10);
		const now = Date.now();

		await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "available",
			expiryDate: now - 60 * 60 * 1000,
		});
		const laterVoucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "available",
			expiryDate: now + 7 * 24 * 60 * 60 * 1000,
		});
		const soonerVoucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "available",
			expiryDate: now + 24 * 60 * 60 * 1000,
		});

		const result = await t.mutation(internal.vouchers.requestReplacement, {
			userId: claimerId,
			originalVoucherId: voucherId,
		});
		expect(result.status).toBe("replaced");
		if (result.status !== "replaced") throw new Error("expected a replacement");
		expect(result.voucher._id).toBe(soonerVoucherId);

		const [sooner, later] = await t.run(async (ctx) => [
			await ctx.db.get(soonerVoucherId),
			await ctx.db.get(laterVoucherId),
		]);
		expect(sooner?.status).toBe("claimed");
		expect(later?.status).toBe("available");
	});

	test("only the claimer can settle a report", async () => {
		const t = convexTest(schema, modules);
		const { claimerId, voucherId } = await settleFixture(t, 10);
		const otherId = await createUser(t, {
			telegramChatId: `settle_other_${Math.random()}`,
			coins: 50,
		});

		const result = await t.mutation(internal.vouchers.refundReportedVoucher, {
			userId: otherId,
			voucherId,
		});
		expect(result.status).toBe("not_yours");

		const [other, claimer, report] = await t.run(async (ctx) => [
			await ctx.db.get(otherId),
			await ctx.db.get(claimerId),
			await ctx.db
				.query("reports")
				.withIndex("by_voucher", (q) => q.eq("voucherId", voucherId))
				.first(),
		]);
		expect(other?.coins).toBe(50);
		expect(claimer?.coins).toBe(10);
		expect(report?.settlement).toBeUndefined();
	});
});

// ============================================================================
// Ban Flow (Part 1)
// ============================================================================

describe("Ban Flow", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("uploader gets flagged when 3 of last 5 uploads reported", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const uploaderChatId = "uploader_ban_test";
		const reporterChatId = "reporter_test";

		// Create uploader user (will be banned)
		const uploaderId = await createUser(t, {
			telegramChatId: uploaderChatId,
			coins: 100,
		});

		// Create reporter user
		const reporterId = await createUser(t, {
			telegramChatId: reporterChatId,
			coins: 50,
		});

		// Create 5 vouchers, all claimed by reporter
		const voucherIds: Id<"vouchers">[] = [];
		for (let i = 0; i < 5; i++) {
			const voucherId = await createVoucher(t, {
				type: "10",
				uploaderId,
				status: "claimed",
				claimerId: reporterId,
				claimedAt: Date.now() - (5 - i) * 1000,
				createdAt: Date.now() - (5 - i) * 2000,
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

		// Verify uploader is NOT flagged yet
		let uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		expect(uploader?.flaggedForReviewAt).toBeUndefined();

		// Advance to Day 3 and report third voucher - this should trigger flag (3 of 5)
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[2],
		});

		// Verify the uploader is now flagged for review
		uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		expect(uploader?.flaggedForReviewAt).toBeDefined();
		expect(uploader?.isBanned).toBe(false);

		vi.runAllTimers();
		await t.finishInProgressScheduledFunctions();
		vi.useRealTimers();
	});

	test("banned user gets a ban message when trying to interact", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const uploaderChatId = "uploader_ban_test";
		const reporterChatId = "reporter_test";

		// Create uploader user (will be banned)
		const uploaderId = await createUser(t, {
			telegramChatId: uploaderChatId,
			coins: 100,
			isBanned: true, // Start as banned for this test
		});

		// Create reporter user
		await createUser(t, { telegramChatId: reporterChatId, coins: 50 });

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

		vi.useRealTimers();
	});
});

// ============================================================================
// Ban Flow Tests (merged from Part 2)
// ============================================================================

describe("Ban Flow Tests", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("reporter flagged when 3+ of last 5 claims are reported", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const now = Date.now();

		const uploaderId = await createUser(t, {
			telegramChatId: "uploader123",
			coins: 0,
		});
		const reporterId = await createUser(t, {
			telegramChatId: "reporter456",
			coins: 100,
		});

		// Create 5 vouchers and have reporter claim all of them
		const voucherIds: Id<"vouchers">[] = [];
		for (let i = 0; i < 5; i++) {
			const voucherId = await createVoucher(t, {
				type: "5",
				uploaderId,
				status: "claimed",
				claimerId: reporterId,
				expiryDate: now + 7 * 24 * 60 * 60 * 1000,
				claimedAt: now - (5 - i) * 1000, // Stagger claim times
				createdAt: now - (5 - i) * 2000,
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
		expect(reporter?.flaggedForReviewAt).toBeUndefined();

		// Advance to Day 3 and report third voucher
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[2],
		});

		reporter = await t.run(async (ctx) => {
			return await ctx.db.get(reporterId);
		});
		expect(reporter?.flaggedForReviewAt).toBeUndefined();

		// Advance to Day 4 and report fourth voucher - this should trigger flag (3 existing + this one)
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		const result4 = await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[3],
		});

		expect(result4.status).toBe("reported");

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		reporter = await t.run(async (ctx) => {
			return await ctx.db.get(reporterId);
		});
		expect(reporter?.flaggedForReviewAt).toBeDefined();
		expect(reporter?.isBanned).toBe(false);

		await t.finishAllScheduledFunctions(vi.runAllTimers);
		vi.useRealTimers();
	});

	test("uploader flagged when 3+ of last 5 uploads are reported", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const now = Date.now();

		const uploaderId = await createUser(t, {
			telegramChatId: "uploader789",
			coins: 0,
		});
		const reporterId = await createUser(t, {
			telegramChatId: "reporter101",
			coins: 100,
		});

		// Create 5 vouchers uploaded by uploader, claimed by reporter
		const voucherIds: Id<"vouchers">[] = [];
		for (let i = 0; i < 5; i++) {
			const voucherId = await createVoucher(t, {
				type: "5",
				uploaderId,
				status: "claimed",
				claimerId: reporterId,
				expiryDate: now + 7 * 24 * 60 * 60 * 1000,
				claimedAt: now - (5 - i) * 1000,
				createdAt: now - (5 - i) * 2000, // Most recent upload last
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
		expect(uploader?.flaggedForReviewAt).toBeUndefined();

		// Advance to Day 3 and report third voucher - this should trigger uploader flag (3 of 5)
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[2],
		});

		uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		expect(uploader?.flaggedForReviewAt).toBeDefined();
		expect(uploader?.isBanned).toBe(false);

		await t.finishAllScheduledFunctions(vi.runAllTimers);
		vi.useRealTimers();
	});

	test("high volume uploader (20+ uploads) flagged when 5+ of last 10 uploads are reported", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const now = Date.now();

		const uploaderId = await createUser(t, {
			telegramChatId: "highvolume_uploader",
			coins: 0,
		});
		const reporterId = await createUser(t, {
			telegramChatId: "reporter_highvol",
			coins: 100,
		});

		const voucherIds: Id<"vouchers">[] = [];
		for (let i = 0; i < 22; i++) {
			const voucherId = await createVoucher(t, {
				type: "5",
				uploaderId,
				status: "claimed",
				claimerId: reporterId,
				expiryDate: now + 7 * 24 * 60 * 60 * 1000,
				claimedAt: now - (22 - i) * 1000,
				createdAt: now - (22 - i) * 2000, // Most recent upload last
			});
			voucherIds.push(voucherId);
		}

		// Report vouchers within the most recent 10 (vouchers 12-21 are the last 10)
		// Report first 4 of the last 10 - should NOT trigger ban yet (need 5 of last 10)
		for (let i = 12; i < 16; i++) {
			vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day between reports
			await t.mutation(internal.vouchers.reportVoucher, {
				userId: reporterId,
				voucherId: voucherIds[i],
			});
		}

		let uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		expect(uploader?.flaggedForReviewAt).toBeUndefined();

		// Report 5th voucher of the last 10 - this should trigger flag (5 of last 10)
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[16],
		});

		uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		expect(uploader?.flaggedForReviewAt).toBeDefined();
		expect(uploader?.isBanned).toBe(false);

		await t.finishAllScheduledFunctions(vi.runAllTimers);
		vi.useRealTimers();
	});

	test("uploader NOT banned when reports come from banned users", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const now = Date.now();

		// Create uploader
		const uploaderId = await createUser(t, {
			telegramChatId: "gooduploader",
			coins: 0,
		});
		const goodReporterId = await createUser(t, {
			telegramChatId: "goodreporter",
			coins: 100,
		});
		const badReporterId = await createUser(t, {
			telegramChatId: "badreporter",
			coins: 100,
			isBanned: true, // Already banned
		});

		const voucherIds: Id<"vouchers">[] = [];
		for (let i = 0; i < 5; i++) {
			const reporterForThisVoucher = i < 3 ? badReporterId : goodReporterId;

			const voucherId = await createVoucher(t, {
				type: "5",
				uploaderId,
				status: "claimed",
				claimerId: reporterForThisVoucher,
				expiryDate: now + 7 * 24 * 60 * 60 * 1000,
				claimedAt: now - (5 - i) * 1000,
				createdAt: now - (5 - i) * 2000,
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

	test("uploader admission keeps the report and still flags at threshold", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const now = Date.now();

		const uploaderId = await createUser(t, {
			telegramChatId: "admit_uploader",
			coins: 100,
		});
		const reporterId = await createUser(t, {
			telegramChatId: "reporter_admit",
			coins: 100,
		});

		const voucherIds: Id<"vouchers">[] = [];
		for (let i = 0; i < 5; i++) {
			const voucherId = await createVoucher(t, {
				type: "10",
				uploaderId,
				status: "claimed",
				claimerId: reporterId,
				expiryDate: now + 7 * 24 * 60 * 60 * 1000,
				claimedAt: now - (5 - i) * 1000,
				createdAt: now - (5 - i) * 2000,
			});
			voucherIds.push(voucherId);
		}

		// Report 2 vouchers first
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[0],
		});
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[1],
		});

		let report = await t.run(async (ctx) => {
			return await ctx.db
				.query("reports")
				.withIndex("by_voucher", (q) => q.eq("voucherId", voucherIds[0]))
				.first();
		});
		expect(report).toBeDefined();

		await t.mutation(internal.vouchers.confirmUploaderUsedVoucher, {
			uploaderId,
			voucherId: voucherIds[0],
			amount: 5,
		});

		report = await t.run(async (ctx) => {
			return await ctx.db
				.query("reports")
				.withIndex("by_voucher", (q) => q.eq("voucherId", voucherIds[0]))
				.first();
		});
		expect(report?.outcome).toBe("uploader_admitted");
		expect(report?.resolvedAt).toEqual(expect.any(Number));

		// Report 2 more vouchers (would be 4th report if first wasn't deleted)
		vi.advanceTimersByTime(24 * 60 * 60 * 1000);
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[2],
		});

		vi.advanceTimersByTime(24 * 60 * 60 * 1000);
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[3],
		});

		// Verify uploader IS flagged (3 reports meets threshold)
		const uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		expect(uploader?.flaggedForReviewAt).toBeDefined();
		expect(uploader?.isBanned).toBe(false);

		await t.finishAllScheduledFunctions(vi.runAllTimers);
		vi.useRealTimers();
	});
});

describe("Uploader report callbacks", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("sendUploaderReportMessage sends voucher image with barcode suffix", async () => {
		const t = convexTest(schema, modules);
		const uploaderChatId = "uploader_report_photo";

		const uploaderId = await createUser(t, {
			telegramChatId: uploaderChatId,
			coins: 50,
		});

		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "reported",
			barcodeNumber: "2226687019052",
		});

		const imageStorageId = await t.run(async (ctx) => {
			const voucher = await ctx.db.get(voucherId);
			return voucher!.imageStorageId;
		});

		await t.action(internal.telegram.sendUploaderReportMessage, {
			uploaderChatId,
			voucherId,
			voucherType: "10",
			imageStorageId,
			barcodeNumber: "2226687019052",
		});

		expect(sentPhotos).toHaveLength(1);
		expect(sentPhotos[0].chatId).toBe(uploaderChatId);
		expect(sentPhotos[0].caption).toContain("ending in 9052");
		expect(sentPhotos[0].caption).toContain(
			"Someone has reported one of your vouchers as not working",
		);
		expect(sentMessages).toHaveLength(0);
	});

	test("uploader_admitted ignores clicks from non-uploader", async () => {
		const t = convexTest(schema, modules);
		const uploaderChatId = "uploader_cb";
		const attackerChatId = "attacker_cb";

		const uploaderId = await createUser(t, {
			telegramChatId: uploaderChatId,
			coins: 50,
		});
		await createUser(t, {
			telegramChatId: attackerChatId,
			coins: 10,
		});

		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "reported",
		});

		await t.action(internal.telegram.handleTelegramCallback, {
			callbackQuery: {
				id: "callback_attacker",
				from: {
					id: attackerChatId,
					is_bot: false,
					first_name: "Attacker",
				},
				message: {
					message_id: 1,
					chat: { id: attackerChatId, type: "private" },
					text: "Did you use this voucher?",
				},
				data: uploaderData("uploader_admitted", String(voucherId)),
			},
		});

		const voucher = await t.run(async (ctx) => ctx.db.get(voucherId));
		expect(voucher?.status).toBe("reported");

		const uploader = await t.run(async (ctx) => ctx.db.get(uploaderId));
		expect(uploader?.coins).toBe(50);
	});
});

describe("Report Confirmation Flow", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("clicking No cancels report and removes inline keyboard", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456789";
		const messageId = 100;

		const userId = await createUser(t, {
			telegramChatId: chatId,
			coins: 10,
		});

		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId: userId,
			status: "claimed",
			claimerId: userId,
			claimedAt: Date.now(),
		});

		await t.action(internal.telegram.handleTelegramCallback, {
			callbackQuery: {
				id: "callback_1",
				from: { id: chatId, is_bot: false, first_name: "TestUser" },
				message: {
					message_id: 99,
					chat: { id: chatId, type: "private" },
					text: "Here's your €10 voucher!",
				},
				data: reportData("report_init", String(voucherId)),
			},
		});

		const confirmationMsg = sentMessages.find((m) =>
			m.text?.includes("Report this voucher as not working"),
		);
		expect(confirmationMsg).toBeDefined();
		expect(confirmationMsg?.chatId).toBe(chatId);

		// Simulate user clicking "No" to cancel
		await t.action(internal.telegram.handleTelegramCallback, {
			callbackQuery: {
				id: "callback_2",
				from: { id: chatId, is_bot: false, first_name: "TestUser" },
				message: {
					message_id: messageId,
					chat: { id: chatId, type: "private" },
					text: confirmationMsg?.text,
				},
				data: reportData("report_cancel", String(voucherId)),
			},
		});

		const editedMsg = editedMessages.find(
			(m) => m.chatId === chatId && m.messageId === messageId,
		);
		expect(editedMsg?.text).toBe(confirmationMsg?.text);

		// Verify "Cancelled" message was sent
		const cancelMsg = sentMessages.find((m) => m.text?.includes("Cancelled"));
		expect(cancelMsg?.chatId).toBe(chatId);
	});

	test("clicking Yes confirms report and removes inline keyboard", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456789";
		const messageId = 100;

		const uploaderId = await createUser(t, {
			telegramChatId: "uploader",
			coins: 0,
		});
		const claimerId = await createUser(t, {
			telegramChatId: chatId,
			coins: 10,
		});

		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId,
			claimedAt: Date.now(),
		});

		await t.action(internal.telegram.handleTelegramCallback, {
			callbackQuery: {
				id: "callback_1",
				from: { id: chatId, is_bot: false, first_name: "TestUser" },
				message: {
					message_id: 99,
					chat: { id: chatId, type: "private" },
					text: "Here's your €10 voucher!",
				},
				data: reportData("report_init", String(voucherId)),
			},
		});

		const confirmationMsg = sentMessages.find((m) =>
			m.text?.includes("Report this voucher as not working"),
		);
		expect(confirmationMsg).toBeDefined();

		await t.action(internal.telegram.handleTelegramCallback, {
			callbackQuery: {
				id: "callback_2",
				from: { id: chatId, is_bot: false, first_name: "TestUser" },
				message: {
					message_id: messageId,
					chat: { id: chatId, type: "private" },
					text: confirmationMsg?.text,
				},
				data: reportData("report_confirm", String(voucherId)),
			},
		});

		const reportMsg = sentMessages.find(
			(m) =>
				m.text?.includes("Report received") ||
				m.text?.includes("No replacement vouchers available"),
		);
		expect(reportMsg).toBeDefined();
	});

	test("double tap on 'No thanks' refunds only once", async () => {
		const t = convexTest(schema, modules);
		const chatId = "222333444";

		const uploaderId = await createUser(t, {
			telegramChatId: "tap_uploader",
			coins: 0,
		});
		const claimerId = await createUser(t, {
			telegramChatId: chatId,
			coins: 10,
		});
		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId,
			claimedAt: Date.now(),
		});

		const tap = (id: string, data: string) =>
			t.action(internal.telegram.handleTelegramCallback, {
				callbackQuery: {
					id,
					from: { id: chatId, is_bot: false, first_name: "TestUser" },
					message: {
						message_id: 7001,
						chat: { id: chatId, type: "private" },
						text: "Here's your €10 voucher!",
					},
					data,
				},
			});

		await tap("tap_confirm", reportData("report_confirm", String(voucherId)));
		await tap(
			"tap_no_1",
			reportData("report_replacement_no", String(voucherId)),
		);
		await tap(
			"tap_no_2",
			reportData("report_replacement_no", String(voucherId)),
		);

		const refundMessages = sentMessages.filter((m) =>
			m.text?.includes("coins have been refunded"),
		);
		expect(refundMessages).toHaveLength(1);

		const claimer = await t.run(async (ctx) => ctx.db.get(claimerId));
		expect(claimer?.coins).toBe(20);

		const txs = await t.run(async (ctx) =>
			ctx.db
				.query("transactions")
				.withIndex("by_user", (q) => q.eq("userId", claimerId))
				.collect(),
		);
		expect(txs.filter((tx) => tx.type === "refund")).toHaveLength(1);
	});

	test("double tap on 'Yes, send a replacement' hands over one voucher", async () => {
		const t = convexTest(schema, modules);
		const chatId = "555666777";

		const uploaderId = await createUser(t, {
			telegramChatId: "tap_yes_uploader",
			coins: 0,
		});
		const claimerId = await createUser(t, {
			telegramChatId: chatId,
			coins: 10,
		});
		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId,
			claimedAt: Date.now(),
		});
		const spareVoucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "available",
		});
		const secondSpareVoucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "available",
		});

		const tap = (id: string, data: string) =>
			t.action(internal.telegram.handleTelegramCallback, {
				callbackQuery: {
					id,
					from: { id: chatId, is_bot: false, first_name: "TestUser" },
					message: {
						message_id: 7002,
						chat: { id: chatId, type: "private" },
						text: "Here's your €10 voucher!",
					},
					data,
				},
			});

		await tap("tap_confirm", reportData("report_confirm", String(voucherId)));
		await tap(
			"tap_yes_1",
			reportData("report_replacement_yes", String(voucherId)),
		);
		await tap(
			"tap_yes_2",
			reportData("report_replacement_yes", String(voucherId)),
		);
		// The other button must not pay out on top of the replacement.
		await tap(
			"tap_no",
			reportData("report_replacement_no", String(voucherId)),
		);

		const replacementMessages = sentPhotos.filter((p) =>
			p.caption?.includes("Here is a replacement"),
		);
		expect(replacementMessages).toHaveLength(1);
		expect(
			sentMessages.filter((m) => m.text?.includes("coins have been refunded")),
		).toHaveLength(0);

		const [spare, secondSpare, claimer] = await t.run(async (ctx) => [
			await ctx.db.get(spareVoucherId),
			await ctx.db.get(secondSpareVoucherId),
			await ctx.db.get(claimerId),
		]);
		const claimedCount = [spare, secondSpare].filter(
			(v) => v?.status === "claimed",
		).length;
		expect(claimedCount).toBe(1);
		expect(claimer?.coins).toBe(10);
	});
});

// ============================================================================
// Review System
// ============================================================================

describe("Review System", () => {
	beforeEach(() => {
		vi.stubEnv("ADMIN_PASSWORD", "test-admin-password");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("getFlaggedUsers returns only flagged non-banned users", async () => {
		const t = convexTest(schema, modules);

		const flaggedUserId = await createUser(t, {
			telegramChatId: "flagged1",
			flaggedForReviewAt: Date.now(),
		});
		await createUser(t, {
			telegramChatId: "banned1",
			isBanned: true,
			flaggedForReviewAt: Date.now(),
		});
		await createUser(t, {
			telegramChatId: "normal1",
		});

		const loginResult = await adminLogin(t);

		const flagged = await t.query(api.adminUsers.getFlaggedUsers, {
			token: loginResult.token,
		});

		expect(flagged).toHaveLength(1);
		expect(flagged[0]._id).toBe(flaggedUserId);
		expect(flagged[0].telegramChatId).toBe("flagged1");
	});

	test("banUser bans user and preserves flag", async () => {
		const t = convexTest(schema, modules);

		const userId = await createUser(t, {
			telegramChatId: "toban",
			flaggedForReviewAt: Date.now(),
		});

		const loginResult = await adminLogin(t);

		await t.mutation(api.adminUsers.banUser, {
			token: loginResult.token,
			userId,
		});

		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId);
		});

		expect(user?.isBanned).toBe(true);
		expect(user?.bannedAt).toBeDefined();
		expect(user?.flaggedForReviewAt).toBeDefined();
	});

	test("flagForReview flags an unflagged user", async () => {
		const t = convexTest(schema, modules);

		const userId = await createUser(t, {
			telegramChatId: "toflag",
		});
		const loginResult = await adminLogin(t);

		await t.mutation(api.adminUsers.flagForReview, {
			token: loginResult.token,
			userId,
		});

		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId);
		});

		expect(user?.isBanned).toBe(false);
		expect(user?.flaggedForReviewAt).toBeDefined();
	});

	test("unbanUser unbans user and preserves flag", async () => {
		const t = convexTest(schema, modules);

		const userId = await createUser(t, {
			telegramChatId: "tounban",
			isBanned: true,
			bannedAt: Date.now(),
			flaggedForReviewAt: Date.now(),
		});

		const loginResult = await adminLogin(t);

		await t.mutation(api.adminUsers.unbanUser, {
			token: loginResult.token,
			userId,
		});

		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId);
		});

		expect(user?.isBanned).toBe(false);
		expect(user?.bannedAt).toBeUndefined();
		expect(user?.flaggedForReviewAt).toBeDefined();
	});

	test("dismissFlag clears flag without banning", async () => {
		const t = convexTest(schema, modules);

		const userId = await createUser(t, {
			telegramChatId: "todismiss",
			flaggedForReviewAt: Date.now(),
		});

		const loginResult = await adminLogin(t);

		await t.mutation(api.adminUsers.dismissFlag, {
			token: loginResult.token,
			userId,
		});

		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId);
		});

		expect(user?.isBanned).toBe(false);
		expect(user?.flaggedForReviewAt).toBeUndefined();
	});

	test("already flagged user is not re-flagged", async () => {
		const t = convexTest(schema, modules);
		const now = Date.now();

		const uploaderId = await createUser(t, {
			telegramChatId: "already_flagged",
			coins: 0,
			flaggedForReviewAt: now - 10000,
		});
		const reporterId = await createUser(t, {
			telegramChatId: "reporter_reflag",
			coins: 100,
		});

		const voucherIds: Id<"vouchers">[] = [];
		for (let i = 0; i < 5; i++) {
			const voucherId = await createVoucher(t, {
				type: "5",
				uploaderId,
				status: "claimed",
				claimerId: reporterId,
				expiryDate: now + 7 * 24 * 60 * 60 * 1000,
				claimedAt: now - (5 - i) * 1000,
				createdAt: now - (5 - i) * 2000,
			});
			voucherIds.push(voucherId);
		}

		// Report 3 vouchers - should not update flaggedForReviewAt since already flagged
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[0],
		});
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[1],
		});
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[2],
		});

		const uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});

		expect(uploader?.flaggedForReviewAt).toBe(now - 10000);
		expect(uploader?.isBanned).toBe(false);
	});
});

describe("Report count recalculation", () => {
	beforeEach(() => {
		setupFetchMock();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("reportVoucher recalculates both uploader and reporter counts", async () => {
		const t = convexTest(schema, modules);
		const now = Date.now();
		const uploaderId = await createUser(t, {
			telegramChatId: "recalc_uploader_1",
		});
		const reporterId = await createUser(t, {
			telegramChatId: "recalc_reporter_1",
			coins: 50,
		});

		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId: reporterId,
			expiryDate: now + 7 * 24 * 60 * 60 * 1000,
			claimedAt: now,
			createdAt: now,
		});

		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId,
		});

		const [uploader, reporter] = await t.run(async (ctx) => {
			return [await ctx.db.get(uploaderId), await ctx.db.get(reporterId)];
		});

		expect(uploader?.uploadReportCount).toBe(1);
		expect(reporter?.claimReportCount).toBe(1);
	});

	test("type 0 vouchers now count toward uploadReportCount", async () => {
		const t = convexTest(schema, modules);
		const now = Date.now();
		const uploaderId = await createUser(t, {
			telegramChatId: "recalc_uploader_type0",
		});
		const reporterId = await createUser(t, {
			telegramChatId: "recalc_reporter_type0",
			coins: 50,
		});

		const voucherId = await createVoucher(t, {
			type: "0",
			uploaderId,
			status: "claimed",
			claimerId: reporterId,
			expiryDate: now + 7 * 24 * 60 * 60 * 1000,
			claimedAt: now,
		});

		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId,
		});

		const uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});

		expect(uploader?.uploadReportCount).toBe(1);
	});

	test("confirmUploaderUsedVoucher keeps the report and drops it from counts", async () => {
		const t = convexTest(schema, modules);
		const now = Date.now();
		const uploaderId = await createUser(t, {
			telegramChatId: "recalc_admit_uploader",
			coins: 100,
		});
		const reporterId = await createUser(t, {
			telegramChatId: "recalc_admit_reporter",
			coins: 100,
		});

		const v1 = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId: reporterId,
			expiryDate: now + 7 * 24 * 60 * 60 * 1000,
			claimedAt: now - 2000,
			createdAt: now - 2000,
		});
		const v2 = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId: reporterId,
			expiryDate: now + 7 * 24 * 60 * 60 * 1000,
			claimedAt: now - 1000,
			createdAt: now - 1000,
		});

		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: v1,
		});
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: v2,
		});

		const [uploader, reporter] = await t.run(async (ctx) => {
			return [await ctx.db.get(uploaderId), await ctx.db.get(reporterId)];
		});
		expect(uploader?.uploadReportCount).toBe(2);
		expect(reporter?.claimReportCount).toBe(2);

		await t.mutation(internal.vouchers.confirmUploaderUsedVoucher, {
			uploaderId,
			voucherId: v1,
			amount: 10,
		});

		const [uploaderAfter, reporterAfter, admitted] = await t.run(
			async (ctx) => {
				const report = await ctx.db
					.query("reports")
					.withIndex("by_voucher", (q) => q.eq("voucherId", v1))
					.first();
				return [
					await ctx.db.get(uploaderId),
					await ctx.db.get(reporterId),
					report,
				];
			},
		);
		expect(uploaderAfter?.uploadReportCount).toBe(1);
		expect(reporterAfter?.claimReportCount).toBe(1);
		expect(admitted?.outcome).toBe("uploader_admitted");
	});

	test("recordUploaderDenied keeps the report in the counts", async () => {
		const t = convexTest(schema, modules);
		const now = Date.now();
		const uploaderId = await createUser(t, {
			telegramChatId: "recalc_deny_uploader",
			coins: 100,
		});
		const reporterId = await createUser(t, {
			telegramChatId: "recalc_deny_reporter",
			coins: 100,
		});

		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId: reporterId,
			expiryDate: now + 7 * 24 * 60 * 60 * 1000,
			claimedAt: now,
			createdAt: now,
		});

		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId,
		});
		await t.mutation(internal.vouchers.recordUploaderDenied, {
			uploaderId,
			voucherId,
		});

		const [uploader, reporter, report] = await t.run(async (ctx) => {
			return [
				await ctx.db.get(uploaderId),
				await ctx.db.get(reporterId),
				await ctx.db
					.query("reports")
					.withIndex("by_voucher", (q) => q.eq("voucherId", voucherId))
					.first(),
			];
		});
		expect(uploader?.uploadReportCount).toBe(1);
		expect(reporter?.claimReportCount).toBe(1);
		expect(report?.outcome).toBe("uploader_denied");
		expect(report?.resolvedAt).toEqual(expect.any(Number));
	});

	test("clearReportAndUpdateVoucher keeps the report and drops it from counts", async () => {
		const t = convexTest(schema, modules);
		const now = Date.now();
		vi.stubEnv("ADMIN_PASSWORD", "test-admin-password");

		const uploaderId = await createUser(t, {
			telegramChatId: "recalc_clear_uploader",
		});
		const reporterId = await createUser(t, {
			telegramChatId: "recalc_clear_reporter",
			coins: 50,
		});

		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId: reporterId,
			expiryDate: now + 7 * 24 * 60 * 60 * 1000,
			claimedAt: now,
		});

		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId,
		});

		const reportId = await t.run(async (ctx) => {
			const report = await ctx.db
				.query("reports")
				.withIndex("by_voucher", (q) => q.eq("voucherId", voucherId))
				.first();
			return report?._id as Id<"reports">;
		});

		const loginResult = await adminLogin(t);

		await t.mutation(api.adminVouchers.clearReportAndUpdateVoucher, {
			token: loginResult.token,
			reportId,
			newVoucherStatus: "expired",
		});

		const [uploader, reporter, cleared] = await t.run(async (ctx) => {
			const report = await ctx.db.get(reportId);
			return [
				await ctx.db.get(uploaderId),
				await ctx.db.get(reporterId),
				report,
			];
		});
		expect(uploader?.uploadReportCount).toBe(0);
		expect(reporter?.claimReportCount).toBe(0);
		expect(cleared?.outcome).toBe("admin_cleared");
		vi.unstubAllEnvs();
	});

	test("multiple reports accumulate and recount correctly", async () => {
		const t = convexTest(schema, modules);
		const now = Date.now();
		const uploaderId = await createUser(t, {
			telegramChatId: "recalc_multi_uploader",
		});
		const r1 = await createUser(t, {
			telegramChatId: "recalc_multi_r1",
			coins: 50,
		});
		const r2 = await createUser(t, {
			telegramChatId: "recalc_multi_r2",
			coins: 50,
		});

		const v1 = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId: r1,
			expiryDate: now + 7 * 24 * 60 * 60 * 1000,
			claimedAt: now - 3000,
			createdAt: now - 3000,
		});
		const v2 = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId: r2,
			expiryDate: now + 7 * 24 * 60 * 60 * 1000,
			claimedAt: now - 2000,
			createdAt: now - 2000,
		});
		const v3 = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId: r1,
			expiryDate: now + 7 * 24 * 60 * 60 * 1000,
			claimedAt: now - 1000,
			createdAt: now - 1000,
		});

		await t.mutation(internal.vouchers.reportVoucher, {
			userId: r1,
			voucherId: v1,
		});
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: r2,
			voucherId: v2,
		});
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: r1,
			voucherId: v3,
		});

		const uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		const reporter1 = await t.run(async (ctx) => {
			return await ctx.db.get(r1);
		});
		expect(uploader?.uploadReportCount).toBe(3);
		expect(reporter1?.claimReportCount).toBe(2);

		// Delete one report via admin clear
		vi.stubEnv("ADMIN_PASSWORD", "test-admin-password");
		const reportId = await t.run(async (ctx) => {
			const report = await ctx.db
				.query("reports")
				.withIndex("by_voucher", (q) => q.eq("voucherId", v1))
				.first();
			return report?._id as Id<"reports">;
		});
		const loginResult = await adminLogin(t);
		await t.mutation(api.adminVouchers.clearReportAndUpdateVoucher, {
			token: loginResult.token,
			reportId,
			newVoucherStatus: "available",
		});
		vi.unstubAllEnvs();

		const [uploaderAfter, r1After] = await t.run(async (ctx) => {
			return [await ctx.db.get(uploaderId), await ctx.db.get(r1)];
		});
		expect(uploaderAfter?.uploadReportCount).toBe(2);
		expect(r1After?.claimReportCount).toBe(1);
	});
});
