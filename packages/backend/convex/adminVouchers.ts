import { v } from "convex/values";
import { applyCoinDelta } from "../src/lib/coinLedger";
import { CLAIM_COSTS, UPLOAD_REWARDS } from "../src/lib/constants";
import { recalculateReportCounts } from "../src/lib/reportCounts";
import type { Id } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";
import { adminMutation, adminQuery } from "./adminGuards";

/**
 * Lists voucher images created since `since`, with fresh download URLs.
 * Backs the incremental image backup in scripts/backup.sh — the CLI runs
 * it with deployment credentials, and only reads the recent index range.
 */
export const getImageUploadsSince = internalQuery({
	args: { since: v.number() },
	handler: async (ctx, { since }) => {
		const rows = await ctx.db
			.query("vouchers")
			.withIndex("by_creation_time", (q) => q.gt("_creationTime", since))
			.collect();

		return await Promise.all(
			rows.map(async (voucher) => ({
				voucherId: voucher._id,
				createdAt: voucher.createdAt,
				imageStorageId: voucher.imageStorageId,
				url: await ctx.storage.getUrl(voucher.imageStorageId),
			})),
		);
	},
});

export const getAllVouchers = adminQuery({
	args: {
		paginationOpts: v.object({
			numItems: v.number(),
			cursor: v.nullable(v.string()),
			id: v.number(),
		}),
	},
	handler: async (ctx, { paginationOpts }) => {
		const { cursor, ...rest } = paginationOpts;
		const results = await ctx.db
			.query("vouchers")
			.order("desc")
			.paginate({ ...rest, cursor: cursor ?? null });

		const vouchersWithImages = await Promise.all(
			results.page.map(async (v) => {
				const uploader = await ctx.db.get(v.uploaderId);
				return {
					_id: v._id,
					type: v.type,
					status: v.status,
					createdAt: v.createdAt,
					expiryDate: v.expiryDate,
					uploaderId: v.uploaderId,
					uploaderFirstName: uploader?.firstName,
					claimerId: v.claimerId,
					imageUrl: await ctx.storage.getUrl(v.imageStorageId),
				};
			}),
		);

		return {
			page: vouchersWithImages,
			continueCursor: results.continueCursor,
			isDone: results.isDone,
		};
	},
});

export const expireVoucherAndDeductCoins = adminMutation({
	args: {
		voucherId: v.id("vouchers"),
	},
	handler: async (ctx, { voucherId }) => {
		const voucher = await ctx.db.get(voucherId);
		if (!voucher) {
			throw new Error("Voucher not found");
		}

		if (voucher.status === "expired") {
			throw new Error("Voucher is already expired");
		}

		const uploader = await ctx.db.get(voucher.uploaderId);
		if (!uploader) {
			throw new Error("Uploader not found");
		}

		const deductionAmount = UPLOAD_REWARDS[voucher.type] ?? 0;

		await ctx.db.patch(voucherId, { status: "expired" });

		const { newBalance } = await applyCoinDelta(ctx, {
			userId: voucher.uploaderId,
			delta: -deductionAmount,
			type: "admin_expiry_deduction",
			voucherId,
		});

		return {
			success: true,
			deductedAmount: deductionAmount,
			newBalance,
		};
	},
});

export const removeVoucherAndReverseCoins = adminMutation({
	args: {
		voucherId: v.id("vouchers"),
	},
	handler: async (ctx, { voucherId }) => {
		const voucher = await ctx.db.get(voucherId);
		if (!voucher) {
			throw new Error("Voucher not found");
		}
		if (voucher.status === "removed") {
			throw new Error("Voucher is already removed");
		}

		const ledger = await ctx.db
			.query("transactions")
			.withIndex("by_voucher", (q) => q.eq("voucherId", voucherId))
			.collect();

		const netByUser = new Map<Id<"users">, number>();
		for (const entry of ledger) {
			netByUser.set(
				entry.userId,
				(netByUser.get(entry.userId) ?? 0) + entry.amount,
			);
		}

		const reversals: Array<{
			userId: Id<"users">;
			amount: number;
			newBalance: number;
		}> = [];
		for (const [userId, net] of netByUser) {
			if (net === 0) continue;
			const { newBalance } = await applyCoinDelta(ctx, {
				userId,
				delta: -net,
				type: "admin_removed",
				voucherId,
			});
			reversals.push({ userId, amount: -net, newBalance });
		}

		await ctx.db.patch(voucherId, { status: "removed" });

		const uploader = await ctx.db.get(voucher.uploaderId);
		if (uploader) {
			await ctx.db.patch(voucher.uploaderId, {
				uploadCount: Math.max(0, (uploader.uploadCount ?? 0) - 1),
			});
		}
		if (voucher.claimerId) {
			const claimer = await ctx.db.get(voucher.claimerId);
			if (claimer) {
				await ctx.db.patch(voucher.claimerId, {
					claimCount: Math.max(0, (claimer.claimCount ?? 0) - 1),
				});
			}
		}

		return { success: true, reversals };
	},
});

export const reverseClaim = adminMutation({
	args: {
		voucherId: v.id("vouchers"),
	},
	handler: async (ctx, { voucherId }) => {
		const voucher = await ctx.db.get(voucherId);
		if (!voucher) {
			throw new Error("Voucher not found");
		}

		if (voucher.status !== "claimed") {
			throw new Error("Voucher must be claimed to reverse");
		}

		if (!voucher.claimerId) {
			throw new Error("Voucher has no claimer");
		}

		const claimer = await ctx.db.get(voucher.claimerId);
		if (!claimer) {
			throw new Error("Claimer not found");
		}

		const refundAmount = CLAIM_COSTS[voucher.type] ?? 0;

		await ctx.db.patch(voucherId, {
			status: "available",
			claimerId: undefined,
			claimedAt: undefined,
		});

		const { newBalance } = await applyCoinDelta(ctx, {
			userId: voucher.claimerId,
			delta: refundAmount,
			type: "claim_reversed",
			voucherId,
		});

		await ctx.db.patch(voucher.claimerId, {
			claimCount: Math.max(0, (claimer.claimCount || 0) - 1),
		});

		return {
			success: true,
			refundAmount,
			newClaimerBalance: newBalance,
		};
	},
});

export const clearReportAndUpdateVoucher = adminMutation({
	args: {
		reportId: v.id("reports"),
		newVoucherStatus: v.union(v.literal("expired"), v.literal("available")),
	},
	handler: async (ctx, { reportId, newVoucherStatus }) => {
		const report = await ctx.db.get(reportId);
		if (!report) {
			throw new Error("Report not found");
		}

		const voucher = await ctx.db.get(report.voucherId);
		if (!voucher) {
			throw new Error("Voucher not found");
		}

		await ctx.db.patch(report.voucherId, { status: newVoucherStatus });

		await ctx.db.patch(reportId, {
			outcome: "admin_cleared",
			resolvedAt: Date.now(),
		});
		await recalculateReportCounts(ctx, [report.reporterId, report.uploaderId]);

		return {
			success: true,
			voucherId: report.voucherId,
			newStatus: newVoucherStatus,
		};
	},
});
