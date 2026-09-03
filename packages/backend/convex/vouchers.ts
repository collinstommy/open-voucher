import { v } from "convex/values";
import dayjs from "dayjs";
import type { Id } from "./_generated/dataModel";
import {
	internalMutation,
	internalQuery,
	type QueryCtx,
} from "./_generated/server";
import {
	reportVoucherCore,
	requestVoucherCore,
	uploadVoucherCore,
	type ClaimResult,
	type ReportResult,
} from "../src/lib/voucherFlows";
import { userMutation, userQuery } from "./auth";
import { CLAIM_COSTS, UPLOAD_REWARDS } from "../src/lib/constants";
import { applyCoinDelta } from "../src/lib/coinLedger";
import { recalculateReportCounts } from "../src/lib/reportCounts";

export const getVoucherByBarcode = internalQuery({
	args: { barcodeNumber: v.string() },
	handler: async (ctx, { barcodeNumber }) => {
		return await ctx.db
			.query("vouchers")
			.withIndex("by_barcode", (q) => q.eq("barcodeNumber", barcodeNumber))
			.first();
	},
});

export const uploadVoucher = internalMutation({
	args: {
		userId: v.id("users"),
		imageStorageId: v.id("_storage"),
	},
	handler: async (ctx, args) => {
		return await uploadVoucherCore(ctx, args);
	},
});
export const requestVoucher = internalMutation({
	args: {
		userId: v.id("users"),
		type: v.union(v.literal("5"), v.literal("10"), v.literal("20")),
	},
	handler: async (ctx, args) => {
		return await requestVoucherCore(ctx, args);
	},
});
export const refundFailedClaimDelivery = internalMutation({
	args: {
		userId: v.id("users"),
		voucherId: v.id("vouchers"),
		type: v.union(v.literal("5"), v.literal("10"), v.literal("20")),
	},
	handler: async (ctx, { userId, voucherId, type }) => {
		const user = await ctx.db.get(userId);
		const voucher = await ctx.db.get(voucherId);
		if (!user || !voucher) {
			return { refunded: false };
		}

		if (voucher.status !== "claimed" || voucher.claimerId !== userId) {
			return { refunded: false };
		}

		const refundAmount = CLAIM_COSTS[type];

		await applyCoinDelta(ctx, {
			userId,
			delta: refundAmount,
			type: "refund",
			voucherId,
		});

		await ctx.db.patch(userId, {
			claimCount: Math.max(0, (user.claimCount || 0) - 1),
		});

		await ctx.db.patch(voucherId, {
			status: "available",
			claimerId: undefined,
			claimedAt: undefined,
		});

		return { refunded: true, refundAmount };
	},
});

export const checkExistingReport = internalQuery({
	args: {
		userId: v.id("users"),
		voucherId: v.id("vouchers"),
	},
	handler: async (ctx, { userId, voucherId }) => {
		const existing = await ctx.db
			.query("reports")
			.withIndex("by_voucher", (q) => q.eq("voucherId", voucherId))
			.filter((q) => q.eq(q.field("reporterId"), userId))
			.first();
		return existing !== null;
	},
});

export const reportVoucher = internalMutation({
	args: {
		userId: v.id("users"),
		voucherId: v.id("vouchers"),
	},
	handler: async (ctx, args) => {
		return await reportVoucherCore(ctx, args);
	},
});
export const refundReportedVoucher = internalMutation({
	args: {
		userId: v.id("users"),
		voucherId: v.id("vouchers"),
	},
	handler: async (ctx, { userId, voucherId }) => {
		const voucher = await ctx.db.get(voucherId);
		if (!voucher) return { status: "not_found" };

		const user = await ctx.db.get(userId);
		if (!user) return { status: "not_found" };

		const refundAmount = CLAIM_COSTS[voucher.type];

		await applyCoinDelta(ctx, {
			userId: user._id,
			delta: refundAmount,
			type: "refund",
			voucherId,
		});

		return { status: "refunded", refundAmount };
	},
});

export const requestReplacement = internalMutation({
	args: {
		userId: v.id("users"),
		originalVoucherId: v.id("vouchers"),
	},
	handler: async (ctx, { userId, originalVoucherId }) => {
		const originalVoucher = await ctx.db.get(originalVoucherId);
		if (!originalVoucher) {
			return { status: "not_found" };
		}

		const user = await ctx.db.get(userId);
		if (!user) {
			return { status: "not_found" };
		}

		const now = Date.now();

		const replacement = await ctx.db
			.query("vouchers")
			.withIndex("by_status_type", (q) =>
				q.eq("status", "available").eq("type", originalVoucher.type),
			)
			.filter((q) =>
				q.or(
					q.eq(q.field("validFrom"), undefined),
					q.lte(q.field("validFrom"), now),
				),
			)
			.first();

		if (!replacement) {
			await applyCoinDelta(ctx, {
				userId,
				delta: CLAIM_COSTS[originalVoucher.type],
				type: "refund",
				voucherId: originalVoucherId,
			});
			return { status: "refunded" };
		}

		const imageUrl = await ctx.storage.getUrl(replacement.imageStorageId);
		if (!imageUrl) {
			await applyCoinDelta(ctx, {
				userId,
				delta: CLAIM_COSTS[originalVoucher.type],
				type: "refund",
				voucherId: originalVoucherId,
			});
			return {
				status: "refunded",
				message: "Replacement found but image missing. Coins refunded.",
			};
		}

		await ctx.db.patch(replacement._id, {
			status: "claimed",
			claimerId: user._id,
			claimedAt: now,
		});

		await ctx.db.patch(user._id, {
			claimCount: (user.claimCount || 0) + 1,
		});

		const report = await ctx.db
			.query("reports")
			.withIndex("by_voucher", (q) => q.eq("voucherId", originalVoucherId))
			.first();
		if (report) {
			await ctx.db.patch(report._id, {
				replacementVoucherId: replacement._id,
			});
		}

		await applyCoinDelta(ctx, {
			userId: user._id,
			delta: 0,
			type: "replacement_received",
			voucherId: replacement._id,
		});

		return {
			status: "replaced",
			voucher: {
				_id: replacement._id,
				type: replacement.type,
				imageUrl,
				expiryDate: replacement.expiryDate,
			},
		};
	},
});

export const expireOldVouchers = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();

		const availableVouchers = await ctx.db
			.query("vouchers")
			.withIndex("by_status_created", (q) => q.eq("status", "available"))
			.collect();

		let expiredCount = 0;
		for (const voucher of availableVouchers) {
			if (voucher.expiryDate < now) {
				await ctx.db.patch(voucher._id, { status: "expired" });
				console.log(`Expired voucher: ${voucher._id}`);
				expiredCount++;
			}
		}

		if (expiredCount > 0) {
			console.log(`Expired ${expiredCount} old vouchers.`);
		}

		return expiredCount;
	},
});

async function countAvailableVouchersByType(ctx: QueryCtx) {
	const availableVouchers = await ctx.db
		.query("vouchers")
		.withIndex("by_status_type", (q) => q.eq("status", "available"))
		.collect();

	const counts: Record<string, number> = { "5": 0, "10": 0, "20": 0 };
	for (const v of availableVouchers) {
		counts[v.type] = (counts[v.type] || 0) + 1;
	}
	return counts;
}

export const getAvailableVoucherCount = internalQuery({
	args: {},
	handler: async (ctx) => countAvailableVouchersByType(ctx),
});

export const getVoucherAvailability = userQuery({
	args: {},
	handler: async (ctx, { userId: _userId }) =>
		countAvailableVouchersByType(ctx),
});

export const getMyAvailableUploads = userQuery({
	args: {},
	handler: async (ctx, { userId }) => {
		const vouchers = await ctx.db
			.query("vouchers")
			.withIndex("by_uploader_created", (q) => q.eq("uploaderId", userId))
			.order("desc")
			.collect();

		const filtered = vouchers.filter(
			(v) => v.status === "available" || v.status === "invalidated",
		);

		return await Promise.all(
			filtered.map(async (v) => ({
				_id: v._id,
				type: v.type,
				status: v.status,
				barcodeNumber: v.barcodeNumber,
				expiryDate: v.expiryDate,
				createdAt: v.createdAt,
				imageUrl: await ctx.storage.getUrl(v.imageStorageId),
				coinValue: UPLOAD_REWARDS[v.type] ?? 0,
			})),
		);
	},
});

export const invalidateMyUpload = userMutation({
	args: {
		voucherId: v.id("vouchers"),
	},
	handler: async (ctx, { userId, voucherId }) => {
		const voucher = await ctx.db.get(voucherId);
		if (!voucher) throw new Error("Voucher not found");
		if (voucher.uploaderId !== userId)
			throw new Error("You can only invalidate your own vouchers");
		if (voucher.status !== "available")
			throw new Error("This voucher has already been claimed");

		await ctx.db.patch(voucherId, { status: "invalidated" });

		const deduction = UPLOAD_REWARDS[voucher.type] || 0;
		const { newBalance } = await applyCoinDelta(ctx, {
			userId,
			delta: -deduction,
			type: "self_invalidated",
			voucherId,
		});

		return { success: true, deduction, newCoins: newBalance };
	},
});

export const getMyClaimedVouchers = userQuery({
	args: {},
	handler: async (ctx, { userId }) => {
		const now = Date.now();

		const vouchers = await ctx.db
			.query("vouchers")
			.withIndex("by_claimer_claimed_at", (q) => q.eq("claimerId", userId))
			.order("desc")
			.collect();

		const active = vouchers.filter(
			(v) => v.status === "claimed" && v.expiryDate > now,
		);

		return await Promise.all(
			active.map(async (v) => ({
				_id: v._id,
				type: v.type,
				barcodeNumber: v.barcodeNumber,
				expiryDate: v.expiryDate,
				claimedAt: v.claimedAt,
				imageUrl: v.imageStorageId
					? await ctx.storage.getUrl(v.imageStorageId)
					: null,
				coinValue: CLAIM_COSTS[v.type] ?? 0,
			})),
		);
	},
});

export const returnClaimedVoucher = userMutation({
	args: {
		voucherId: v.id("vouchers"),
	},
	handler: async (ctx, { userId, voucherId }) => {
		const voucher = await ctx.db.get(voucherId);
		if (!voucher) throw new Error("Voucher not found");
		if (voucher.claimerId !== userId)
			throw new Error("You did not claim this voucher");
		if (voucher.status !== "claimed")
			throw new Error("This voucher is not currently claimed");

		// 9pm rule: can't return a voucher that expires today after 9pm Irish time
		const irishHour = Number(
			new Intl.DateTimeFormat("en-IE", {
				timeZone: "Europe/Dublin",
				hour: "numeric",
				hour12: false,
			}).format(new Date()),
		);
		const expiryDay = dayjs(voucher.expiryDate).startOf("day");
		const today = dayjs().startOf("day");
		if (expiryDay.isSame(today) && irishHour >= 21) {
			throw new Error(
				"This voucher expires today and it's after 9 PM. It can no longer be returned.",
			);
		}

		const refundAmount = CLAIM_COSTS[voucher.type] ?? 0;

		await ctx.db.patch(voucherId, {
			status: "available",
			claimerId: undefined,
			claimedAt: undefined,
		});

		const user = await ctx.db.get(userId);
		await applyCoinDelta(ctx, {
			userId,
			delta: refundAmount,
			type: "claim_returned",
			voucherId,
		});

		await ctx.db.patch(userId, {
			claimCount: Math.max(0, (user?.claimCount ?? 0) - 1),
		});

		return { success: true, refundAmount };
	},
});

export const getVoucherForUploaderConfirm = internalQuery({
	args: { voucherId: v.id("vouchers") },
	handler: async (ctx, { voucherId }) => {
		return await ctx.db.get(voucherId);
	},
});

export const confirmUploaderUsedVoucher = internalMutation({
	args: {
		uploaderId: v.id("users"),
		voucherId: v.id("vouchers"),
		amount: v.number(),
	},
	handler: async (ctx, { uploaderId, voucherId, amount }) => {
		const uploader = await ctx.db.get(uploaderId);
		if (!uploader) return;

		await applyCoinDelta(ctx, {
			userId: uploaderId,
			delta: -amount,
			type: "uploader_refund",
			voucherId,
		});

		await ctx.db.patch(voucherId, { status: "uploader_admitted_used" });

		// Remove the report since uploader admitted (honesty should not penalize ban status)
		const report = await ctx.db
			.query("reports")
			.withIndex("by_voucher", (q) => q.eq("voucherId", voucherId))
			.first();

		if (report) {
			await ctx.db.delete(report._id);
			await recalculateReportCounts(ctx, [
				report.reporterId,
				report.uploaderId,
			]);
		}
	},
});

export const recordUploaderDenied = internalMutation({
	args: {
		uploaderId: v.id("users"),
		voucherId: v.id("vouchers"),
	},
	handler: async (ctx, { uploaderId, voucherId }) => {
		await ctx.db.patch(voucherId, { status: "uploader_denied" });

		await ctx.db.insert("transactions", {
			userId: uploaderId,
			type: "uploader_denied",
			amount: 0,
			voucherId,
			createdAt: Date.now(),
		});
	},
});

// --- Public app wrappers (the Expo app consumes them) ---
//
// userMutation shells over the shared cores in src/lib/voucherFlows.ts.
// Shells own only identity plumbing (the authed userId) and chatless outbox
// writes; the state machine stays in the core so bot and app paths cannot
// drift. Synchronous failure outcomes (already displayed by the caller)
// write no rows.

/** Storage upload URL for app voucher uploads (client POSTs image bytes). */
export const generateVoucherUploadUrl = userMutation({
	args: {},
	handler: async (ctx) => {
		return await ctx.storage.generateUploadUrl();
	},
});

/** App upload: feeds the existing OCR pipeline (processVoucherImage). */
export const uploadVoucherFromApp = userMutation({
	args: {
		imageStorageId: v.id("_storage"),
	},
	handler: async (ctx, { userId, imageStorageId }) => {
		await uploadVoucherCore(ctx, { userId, imageStorageId });
		return { success: true as const };
	},
});

/** App claim: same core as the bot path; delivery is the returned image. */
export type ClaimVoucherFromAppResult = ClaimResult;

export const claimVoucherFromApp = userMutation({
	args: {
		type: v.union(v.literal("5"), v.literal("10"), v.literal("20")),
	},
	handler: async (
		ctx,
		{ userId, type },
	): Promise<ClaimVoucherFromAppResult> => {
		const result = await requestVoucherCore(ctx, { userId, type });
		if (result.success) {
			const user = await ctx.db.get(userId);
			if (user && user.telegramChatId === undefined) {
				const text =
					`✅ <b>Here is your €${type} voucher!</b>\n\n` +
					`Expires: ${dayjs(result.expiryDate).format("MMM Do")}\n` +
					`Remaining coins: ${result.remainingCoins}`;
				await ctx.db.insert("notificationOutbox", {
					userId,
					kind: "claim_success",
					payload: {
						text,
						data: {
							voucherId: result.voucherId,
							type,
							expiryDate: result.expiryDate,
							remainingCoins: result.remainingCoins,
						},
					},
				});
			}
		}
		return result;
	},
});

export type ReportVoucherFromAppResult = ReportResult;

export const reportVoucherFromApp = userMutation({
	args: {
		voucherId: v.id("vouchers"),
	},
	handler: async (
		ctx,
		{ userId, voucherId },
	): Promise<ReportVoucherFromAppResult> => {
		const result = await reportVoucherCore(ctx, { userId, voucherId });
		if (result.status === "reported") {
			const user = await ctx.db.get(userId);
			if (user && user.telegramChatId === undefined) {
				const text =
					"✅ Report received. You can request a replacement voucher if you need one.";
				await ctx.db.insert("notificationOutbox", {
					userId,
					kind: "report_received",
					payload: {
						text,
						data: { voucherId, reportId: result.reportId },
					},
				});
			}
		}
		return result;
	},
});
