import { v } from "convex/values";
import { internal } from "../_generated/api";
import { CLAIM_COSTS, UPLOAD_REWARDS } from "../constants";
import { applyCoinDelta } from "../lib/coinLedger";
import { adminMutation, adminQuery } from "./auth";

export const getTodaysVouchers = adminQuery({
	args: {},
	handler: async (ctx) => {
		const now = new Date();
		const startOfDay = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
		).getTime();

		const vouchers = await ctx.db
			.query("vouchers")
			.filter((q) => q.gte(q.field("createdAt"), startOfDay))
			.collect();

		const vouchersWithImages = await Promise.all(
			vouchers.map(async (v) => ({
				_id: v._id,
				type: v.type,
				status: v.status,
				createdAt: v.createdAt,
				expiryDate: v.expiryDate,
				uploaderId: v.uploaderId,
				claimerId: v.claimerId,
				imageUrl: await ctx.storage.getUrl(v.imageStorageId),
			})),
		);

		return { vouchers: vouchersWithImages };
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

		await ctx.db.delete(reportId);

		return {
			success: true,
			voucherId: report.voucherId,
			newStatus: newVoucherStatus,
		};
	},
});

export const sendMessageToUser = adminMutation({
	args: {
		userId: v.id("users"),
		messageText: v.string(),
	},
	handler: async (ctx, { userId, messageText }) => {
		const user = await ctx.db.get(userId);
		if (!user) {
			throw new Error("User not found");
		}

		await ctx.db.insert("messages", {
			telegramMessageId: 0,
			telegramChatId: user.telegramChatId,
			direction: "outbound",
			messageType: "text",
			text: messageText,
			isAdminMessage: true,
			createdAt: Date.now(),
		});

		await ctx.scheduler.runAfter(0, internal.telegram.sendAdminMessageAction, {
			chatId: user.telegramChatId,
			text: messageText,
		});

		return { success: true };
	},
});
