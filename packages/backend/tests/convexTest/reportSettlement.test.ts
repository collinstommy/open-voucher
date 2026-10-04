/**
 * A reported voucher's claim settles exactly once: refunded or replaced.
 */

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { reportData } from "../../src/telegram/router";
import { modules } from "../test.setup";
import { createUser, createVoucher } from "./fixtures/testHelpers";

type T = TestConvex<typeof schema>;

let sentMessages: { chatId: string; text?: string }[] = [];
let sentPhotos: { chatId: string; caption?: string }[] = [];
let editedMessages: { chatId: string; messageId: number }[] = [];

function setupTelegramMock() {
	sentMessages = [];
	sentPhotos = [];
	editedMessages = [];

	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, options?: RequestInit) => {
			let body: Record<string, unknown> = {};
			if (options?.body instanceof FormData) {
				for (const [key, value] of options.body.entries()) {
					body[key] = value;
				}
			} else if (typeof options?.body === "string") {
				body = JSON.parse(options.body);
			}

			if (url.includes("/sendMessage")) {
				sentMessages.push({
					chatId: String(body.chat_id),
					text: body.text as string,
				});
			} else if (url.includes("/sendPhoto")) {
				sentPhotos.push({
					chatId: String(body.chat_id),
					caption: body.caption as string,
				});
			} else if (
				url.includes("/editMessageText") ||
				url.includes("/editMessageCaption")
			) {
				editedMessages.push({
					chatId: String(body.chat_id),
					messageId: Number(body.message_id),
				});
			}

			return {
				ok: true,
				json: async () => ({ ok: true, result: { message_id: 1 } }),
				blob: async () => new Blob(["voucher-image"], { type: "image/jpeg" }),
			} as unknown as Response;
		}),
	);
}

async function tap(
	t: T,
	{ chatId, id, data }: { chatId: string; id: string; data: string },
) {
	await t.action(internal.telegram.handleTelegramCallback, {
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
}

async function reportedVoucher(t: T) {
	const uploaderId = await createUser(t, { telegramChatId: "settle_uploader" });
	const claimerId = await createUser(t, {
		telegramChatId: "settle_claimer",
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
	return { uploaderId, claimerId, voucherId };
}

async function reportRow(t: T, voucherId: Id<"vouchers">) {
	return await t.run(async (ctx) =>
		ctx.db
			.query("reports")
			.withIndex("by_voucher", (q) => q.eq("voucherId", voucherId))
			.first(),
	);
}

async function coinsOf(t: T, userId: Id<"users">) {
	const user = await t.run(async (ctx) => ctx.db.get(userId));
	return user?.coins;
}

// ============================================================================
// Settlement mutations
// ============================================================================

describe("Settlement mutations settle a report exactly once", () => {
	test("a second refund attempt does nothing", async () => {
		const t = convexTest(schema, modules);
		const { claimerId, voucherId } = await reportedVoucher(t);

		const first = await t.mutation(internal.vouchers.refundReportedVoucher, {
			userId: claimerId,
			voucherId,
		});
		expect(first.status).toBe("refunded");
		if (first.status !== "refunded") throw new Error("expected a refund");
		expect(first.refundAmount).toBe(10);

		const second = await t.mutation(internal.vouchers.refundReportedVoucher, {
			userId: claimerId,
			voucherId,
		});
		expect(second.status).toBe("already_settled");
		if (second.status !== "already_settled")
			throw new Error("expected already_settled");
		expect(second.settlement).toBe("refunded");

		expect(await coinsOf(t, claimerId)).toBe(20);

		const txs = await t.run(async (ctx) =>
			ctx.db
				.query("transactions")
				.withIndex("by_user", (q) => q.eq("userId", claimerId))
				.collect(),
		);
		expect(txs.filter((tx) => tx.type === "refund")).toHaveLength(1);

		const report = await reportRow(t, voucherId);
		expect(report?.settlement).toBe("refunded");
		expect(report?.settledAt).toEqual(expect.any(Number));
	});

	test("replacement after refund does not hand over a voucher", async () => {
		const t = convexTest(schema, modules);
		const { uploaderId, claimerId, voucherId } = await reportedVoucher(t);

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

		const spare = await t.run(async (ctx) => ctx.db.get(spareVoucherId));
		expect(spare?.status).toBe("available");
		expect(await coinsOf(t, claimerId)).toBe(20);
	});

	test("a second replacement attempt does nothing", async () => {
		const t = convexTest(schema, modules);
		const { uploaderId, claimerId, voucherId } = await reportedVoucher(t);

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
		if (first.status !== "replaced") throw new Error("expected a replacement");

		const second = await t.mutation(internal.vouchers.requestReplacement, {
			userId: claimerId,
			originalVoucherId: voucherId,
		});
		expect(second.status).toBe("already_settled");

		const [firstSpare, secondSpare] = await t.run(async (ctx) => [
			await ctx.db.get(firstSpareId),
			await ctx.db.get(secondSpareId),
		]);
		const claimed = [firstSpare, secondSpare].filter(
			(v) => v?.status === "claimed",
		);
		expect(claimed).toHaveLength(1);
		expect(await coinsOf(t, claimerId)).toBe(10);

		const report = await reportRow(t, voucherId);
		expect(report?.settlement).toBe("replaced");
		expect(report?.replacementVoucherId).toBe(first.voucher._id);
		expect(report?.settledAt).toEqual(expect.any(Number));

		const txs = await t.run(async (ctx) =>
			ctx.db
				.query("transactions")
				.withIndex("by_user", (q) => q.eq("userId", claimerId))
				.collect(),
		);
		expect(txs.filter((tx) => tx.type === "replacement_received")).toHaveLength(
			1,
		);
	});

	test("refund after replacement does not refund", async () => {
		const t = convexTest(schema, modules);
		const { uploaderId, claimerId, voucherId } = await reportedVoucher(t);

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

		expect(await coinsOf(t, claimerId)).toBe(10);

		const txs = await t.run(async (ctx) =>
			ctx.db
				.query("transactions")
				.withIndex("by_user", (q) => q.eq("userId", claimerId))
				.collect(),
		);
		expect(txs.filter((tx) => tx.type === "refund")).toHaveLength(0);
	});

	test("replacement with no stock settles as refunded once", async () => {
		const t = convexTest(schema, modules);
		const { claimerId, voucherId } = await reportedVoucher(t);

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

		expect(await coinsOf(t, claimerId)).toBe(20);

		const report = await reportRow(t, voucherId);
		expect(report?.settlement).toBe("refunded");
	});

	test("only the claimer can settle a report", async () => {
		const t = convexTest(schema, modules);
		const { claimerId, voucherId } = await reportedVoucher(t);
		const otherId = await createUser(t, {
			telegramChatId: "settle_other",
			coins: 50,
		});

		const result = await t.mutation(internal.vouchers.refundReportedVoucher, {
			userId: otherId,
			voucherId,
		});
		expect(result.status).toBe("not_yours");

		expect(await coinsOf(t, otherId)).toBe(50);
		expect(await coinsOf(t, claimerId)).toBe(10);
		const report = await reportRow(t, voucherId);
		expect(report?.settlement).toBeUndefined();
	});

	test("an unreported voucher cannot be settled", async () => {
		const t = convexTest(schema, modules);
		const uploaderId = await createUser(t, {
			telegramChatId: "unreported_uploader",
		});
		const claimerId = await createUser(t, {
			telegramChatId: "unreported_claimer",
			coins: 10,
		});
		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId,
			claimedAt: Date.now(),
		});

		const refund = await t.mutation(internal.vouchers.refundReportedVoucher, {
			userId: claimerId,
			voucherId,
		});
		expect(refund.status).toBe("not_reported");

		const replace = await t.mutation(internal.vouchers.requestReplacement, {
			userId: claimerId,
			originalVoucherId: voucherId,
		});
		expect(replace.status).toBe("not_reported");

		expect(await coinsOf(t, claimerId)).toBe(10);
		const voucher = await t.run(async (ctx) => ctx.db.get(voucherId));
		expect(voucher?.status).toBe("claimed");
		const txs = await t.run(async (ctx) =>
			ctx.db
				.query("transactions")
				.withIndex("by_user", (q) => q.eq("userId", claimerId))
				.collect(),
		);
		expect(txs).toHaveLength(0);
	});

	test("a legacy replacement cannot be settled again", async () => {
		const t = convexTest(schema, modules);
		const uploaderId = await createUser(t, {
			telegramChatId: "legacy_replaced_uploader",
		});
		const claimerId = await createUser(t, {
			telegramChatId: "legacy_replaced_claimer",
			coins: 10,
		});
		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "reported",
			claimerId,
			claimedAt: Date.now(),
		});
		const replacementVoucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
		});

		// Pre-marker settlement: replacement recorded, no marker yet.
		await t.run(async (ctx) =>
			ctx.db.insert("reports", {
				voucherId,
				reporterId: claimerId,
				uploaderId,
				reason: "not_working",
				replacementVoucherId,
				createdAt: Date.now(),
			}),
		);

		const refund = await t.mutation(internal.vouchers.refundReportedVoucher, {
			userId: claimerId,
			voucherId,
		});
		expect(refund.status).toBe("already_settled");
		if (refund.status !== "already_settled")
			throw new Error("expected already_settled");
		expect(refund.settlement).toBe("replaced");

		const replace = await t.mutation(internal.vouchers.requestReplacement, {
			userId: claimerId,
			originalVoucherId: voucherId,
		});
		expect(replace.status).toBe("already_settled");

		expect(await coinsOf(t, claimerId)).toBe(10);
		const report = await reportRow(t, voucherId);
		expect(report?.settlement).toBe("replaced");
	});

	test("a legacy refund cannot be settled again", async () => {
		const t = convexTest(schema, modules);
		const uploaderId = await createUser(t, {
			telegramChatId: "legacy_refunded_uploader",
		});
		const claimerId = await createUser(t, {
			telegramChatId: "legacy_refunded_claimer",
			coins: 10,
		});
		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "reported",
			claimerId,
			claimedAt: Date.now(),
		});
		const spareVoucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "available",
		});

		// Pre-marker settlement: refund in the ledger, no marker yet.
		const createdAt = Date.now();
		await t.run(async (ctx) => {
			await ctx.db.insert("reports", {
				voucherId,
				reporterId: claimerId,
				uploaderId,
				reason: "not_working",
				createdAt,
			});
			await ctx.db.insert("transactions", {
				userId: claimerId,
				type: "refund",
				amount: 10,
				voucherId,
				createdAt,
			});
		});

		const replace = await t.mutation(internal.vouchers.requestReplacement, {
			userId: claimerId,
			originalVoucherId: voucherId,
		});
		expect(replace.status).toBe("already_settled");
		if (replace.status !== "already_settled")
			throw new Error("expected already_settled");
		expect(replace.settlement).toBe("refunded");

		const refund = await t.mutation(internal.vouchers.refundReportedVoucher, {
			userId: claimerId,
			voucherId,
		});
		expect(refund.status).toBe("already_settled");

		const spare = await t.run(async (ctx) => ctx.db.get(spareVoucherId));
		expect(spare?.status).toBe("available");
		expect(await coinsOf(t, claimerId)).toBe(10);
		const report = await reportRow(t, voucherId);
		expect(report?.settlement).toBe("refunded");
	});
});

// ============================================================================
// Settlement callbacks
// ============================================================================

describe("Settlement callbacks", () => {
	beforeEach(() => {
		setupTelegramMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
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

		await tap(t, {
			chatId,
			id: "tap_confirm",
			data: reportData("report_confirm", String(voucherId)),
		});
		const editsBefore = editedMessages.length;

		await tap(t, {
			chatId,
			id: "tap_no_1",
			data: reportData("report_replacement_no", String(voucherId)),
		});
		await tap(t, {
			chatId,
			id: "tap_no_2",
			data: reportData("report_replacement_no", String(voucherId)),
		});

		expect(
			sentMessages.filter((m) => m.text?.includes("coins have been refunded")),
		).toHaveLength(1);
		// Prompt consumed exactly once; the second tap must not edit again.
		expect(editedMessages.length - editsBefore).toBe(1);
		expect(await coinsOf(t, claimerId)).toBe(20);

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

		await tap(t, {
			chatId,
			id: "tap_confirm",
			data: reportData("report_confirm", String(voucherId)),
		});
		const editsBefore = editedMessages.length;

		await tap(t, {
			chatId,
			id: "tap_yes_1",
			data: reportData("report_replacement_yes", String(voucherId)),
		});
		await tap(t, {
			chatId,
			id: "tap_yes_2",
			data: reportData("report_replacement_yes", String(voucherId)),
		});
		// The other button must not pay out on top of the replacement.
		await tap(t, {
			chatId,
			id: "tap_no",
			data: reportData("report_replacement_no", String(voucherId)),
		});

		expect(
			sentPhotos.filter((p) => p.caption?.includes("Here is a replacement")),
		).toHaveLength(1);
		expect(
			sentMessages.filter((m) => m.text?.includes("coins have been refunded")),
		).toHaveLength(0);
		expect(editedMessages.length - editsBefore).toBe(1);

		const [spare, secondSpare] = await t.run(async (ctx) => [
			await ctx.db.get(spareVoucherId),
			await ctx.db.get(secondSpareVoucherId),
		]);
		const claimed = [spare, secondSpare].filter((v) => v?.status === "claimed");
		expect(claimed).toHaveLength(1);
		expect(await coinsOf(t, claimerId)).toBe(10);

		const report = await reportRow(t, voucherId);
		expect(report?.settlement).toBe("replaced");
		expect(report?.replacementVoucherId).toBe(claimed[0]?._id);
	});

	test("forged callbacks on someone else's voucher do nothing", async () => {
		const t = convexTest(schema, modules);
		const { uploaderId, claimerId, voucherId } = await reportedVoucher(t);
		const attackerChatId = "999888777";
		await createUser(t, {
			telegramChatId: attackerChatId,
			coins: 50,
		});
		const spareVoucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "available",
		});

		await tap(t, {
			chatId: attackerChatId,
			id: "forge_no",
			data: reportData("report_replacement_no", String(voucherId)),
		});
		await tap(t, {
			chatId: attackerChatId,
			id: "forge_yes",
			data: reportData("report_replacement_yes", String(voucherId)),
		});

		expect(sentMessages).toHaveLength(0);
		expect(editedMessages).toHaveLength(0);
		expect(await coinsOf(t, claimerId)).toBe(10);

		const report = await reportRow(t, voucherId);
		expect(report?.settlement).toBeUndefined();
		const [spare, victim] = await t.run(async (ctx) => [
			await ctx.db.get(spareVoucherId),
			await ctx.db.get(voucherId),
		]);
		expect(spare?.status).toBe("available");
		expect(victim?.status).toBe("reported");
		expect(victim?.claimerId).toBe(claimerId);
	});
});
