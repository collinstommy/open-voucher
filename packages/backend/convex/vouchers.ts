import { v } from "convex/values";
import dayjs from "dayjs";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
	internalMutation,
	internalQuery,
	type QueryCtx,
} from "./_generated/server";
import { userMutation, userQuery } from "./auth";
import { CLAIM_COSTS, UPLOAD_REWARDS } from "../src/lib/constants";
import { applyCoinDelta } from "../src/lib/coinLedger";

function getVoucherExpiryCalendarDay(expiryDate: number): string {
	const date = new Date(expiryDate);
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function getIrishCalendarDay(now: number = Date.now()): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/Dublin",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date(now));
}

function canReportClaimedVoucher(
	expiryDate: number,
	now: number = Date.now(),
): boolean {
	return getVoucherExpiryCalendarDay(expiryDate) >= getIrishCalendarDay(now);
}

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
	handler: async (ctx, { userId, imageStorageId }) => {
		const user = await ctx.db.get(userId);
		if (!user) {
			throw new Error("User not found");
		}
		if (user.isBanned) {
			throw new Error("You have been banned from this service");
		}

		const now = Date.now();
		const oneDayAgo = now - 24 * 60 * 60 * 1000;
		const MAX_DAILY_UPLOADS = 10;
		const recentUploads = await ctx.db
			.query("vouchers")
			.withIndex("by_uploader_created", (q) =>
				q.eq("uploaderId", userId).gt("createdAt", oneDayAgo),
			)
			.collect();

		if (recentUploads.length >= MAX_DAILY_UPLOADS) {
			await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
				chatId: user.telegramChatId,
				text: "🚫 <b>Daily Upload Limit Reached</b>\n\nYou can only upload 10 vouchers per 24 hours. Please try again later.",
			});
			return null;
		}

		await ctx.scheduler.runAfter(0, internal.ocr.processVoucherImage, {
			userId,
			imageStorageId,
		});

		return null;
	},
});

export const requestVoucher = internalMutation({
	args: {
		userId: v.id("users"),
		type: v.union(v.literal("5"), v.literal("10"), v.literal("20")),
	},
	handler: async (ctx, { userId, type }) => {
		const user = await ctx.db.get(userId);
		if (!user) {
			throw new Error("User not found");
		}

		const cost = CLAIM_COSTS[type];
		if (user.coins < cost) {
			return {
				success: false,
				error: `Insufficient coins. You need ${cost} coins.`,
			};
		}

		const now = Date.now();
		const oneDayAgo = now - 24 * 60 * 60 * 1000;
		const MAX_DAILY_CLAIMS = 5;
		const recentClaims = await ctx.db
			.query("vouchers")
			.withIndex("by_claimer_claimed_at", (q) =>
				q.eq("claimerId", userId).gt("claimedAt", oneDayAgo),
			)
			.collect();

		if (recentClaims.length >= MAX_DAILY_CLAIMS) {
			return {
				success: false,
				error:
					"<b>Daily Claim Limit Reached</b>\n\nYou can only claim 5 vouchers per 24 hours. Please try again later.",
			};
		}

		// Find available voucher expiring soonest
		const vouchers = await ctx.db
			.query("vouchers")
			.withIndex("by_status_type", (q) =>
				q.eq("status", "available").eq("type", type),
			)
			.filter((q) =>
				q.and(
					q.gt(q.field("expiryDate"), now),
					q.or(
						q.eq(q.field("validFrom"), undefined),
						q.lte(q.field("validFrom"), now),
					),
				),
			)
			.collect();

		if (vouchers.length === 0) {
			return {
				success: false,
				error: `No €${type} vouchers currently available.`,
			};
		}

		const voucher = vouchers.sort((a, b) => a.expiryDate - b.expiryDate)[0];

		const imageUrl = await ctx.storage.getUrl(voucher.imageStorageId);
		if (!imageUrl) {
			return {
				success: false,
				error:
					"Failed to retrieve voucher image. No coins used. Please try again.",
			};
		}

		const { newBalance } = await applyCoinDelta(ctx, {
			userId,
			delta: -cost,
			type: "claim_spend",
			voucherId: voucher._id,
		});

		await ctx.db.patch(userId, {
			claimCount: (user.claimCount || 0) + 1,
		});

		await ctx.db.patch(voucher._id, {
			status: "claimed",
			claimerId: userId,
			claimedAt: now,
		});

		return {
			success: true,
			voucherId: voucher._id,
			imageUrl,
			remainingCoins: newBalance,
			expiryDate: voucher.expiryDate,
		};
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
	handler: async (ctx, { userId, voucherId }) => {
		const user = await ctx.db.get(userId);
		if (!user) throw new Error("User not found");

		if (user.isBanned) {
			return {
				status: "banned",
				message: "You have been banned from this service.",
			};
		}

		const now = Date.now();
		const startOfDay = dayjs(now).startOf("day").valueOf();

		// Check reports from today
		const todayReports = await ctx.db
			.query("reports")
			.withIndex("by_reporterId", (q) => q.eq("reporterId", user._id))
			.filter((q) => q.gte(q.field("createdAt"), startOfDay))
			.collect();

		if (todayReports.length >= 2) {
			return {
				status: "rate_limited",
				message:
					"You can only report 2 vouchers per day. Please try again tomorrow.",
			};
		}

		const voucher = await ctx.db.get(voucherId);

		if (!voucher) throw new Error("Voucher not found");
		if (voucher.claimerId !== user._id) {
			throw new Error("You did not claim this voucher");
		}

		if (!canReportClaimedVoucher(voucher.expiryDate, now)) {
			return {
				status: "expired",
				message:
					"This voucher expired before today and can no longer be reported.",
			};
		}

		const existingReport = await ctx.db
			.query("reports")
			.withIndex("by_voucher", (q) => q.eq("voucherId", voucherId))
			.filter((q) => q.eq(q.field("reporterId"), user._id))
			.first();

		if (existingReport) {
			return {
				status: "already_reported",
				message: "You have already reported this voucher.",
			};
		}
		const last5Claims = await ctx.db
			.query("vouchers")
			.withIndex("by_claimer_claimed_at", (q) => q.eq("claimerId", user._id))
			.order("desc")
			.take(5);

		const reporterReports = await ctx.db
			.query("reports")
			.withIndex("by_reporterId", (q) => q.eq("reporterId", user._id))
			.order("desc")
			.collect();

		// Check if 3+ of last 5 claims were reported
		if (last5Claims.length >= 5) {
			const last5ClaimIds = last5Claims.map((v) => v._id);
			const last5Reported = reporterReports.filter((r) =>
				last5ClaimIds.includes(r.voucherId),
			);
			if (last5Reported.length >= 3 && !user.flaggedForReviewAt) {
				console.log(
					`🚫 REPORTER FLAG: User ${user._id} (${user.telegramChatId}) flagged for excessive reporting. ` +
						`Reported ${last5Reported.length} of last 5 claims. ` +
						`Total claims: ${last5Claims.length}, Total reports: ${reporterReports.length}`,
				);
				console.log(
					"Last 5 claims:",
					last5Claims.map((v) => ({
						voucherId: v._id,
						type: v.type,
						claimedAt: new Date(v.claimedAt || 0).toISOString(),
						wasReported: last5Reported.some((r) => r.voucherId === v._id),
					})),
				);
				await ctx.db.patch(user._id, {
					flaggedForReviewAt: Date.now(),
				});
			}
		}

		let reportId: Id<"reports"> | undefined;
		if (voucher.status !== "reported") {
			await ctx.db.patch(voucherId, { status: "reported" });
			reportId = await ctx.db.insert("reports", {
				voucherId,
				reporterId: user._id,
				uploaderId: voucher.uploaderId,
				reason: "not_working",
				createdAt: Date.now(),
			});

			await ctx.db.patch(user._id, {
				claimReportCount: (user.claimReportCount || 0) + 1,
				lastReportAt: now,
			});

			const uploader = await ctx.db.get(voucher.uploaderId);
			if (uploader && voucher.type !== "0") {
				await ctx.db.patch(voucher.uploaderId, {
					uploadReportCount: (uploader.uploadReportCount || 0) + 1,
				});

				// Send message to uploader asking if they used the voucher
				await ctx.scheduler.runAfter(
					0,
					internal.telegram.sendUploaderReportMessage,
					{
						uploaderChatId: uploader.telegramChatId,
						voucherId: voucher._id,
						voucherType: voucher.type as "5" | "10" | "20",
						imageStorageId: voucher.imageStorageId,
						barcodeNumber: voucher.barcodeNumber,
					},
				);
			}
		}

		const totalUploads = await ctx.db
			.query("vouchers")
			.withIndex("by_uploader_created", (q) =>
				q.eq("uploaderId", voucher.uploaderId),
			)
			.collect();

		const totalUploadCount = totalUploads.length;

		// For accounts with 20+ uploads: check 5+ of last 10
		// For accounts with fewer uploads: check 3+ of last 5
		const isHighVolumeUploader = totalUploadCount >= 20;
		const uploadsToCheck = isHighVolumeUploader ? 10 : 5;
		const reportsThreshold = isHighVolumeUploader ? 5 : 3;

		const recentUploads = await ctx.db
			.query("vouchers")
			.withIndex("by_uploader_created", (q) =>
				q.eq("uploaderId", voucher.uploaderId),
			)
			.order("desc")
			.take(uploadsToCheck);

		if (recentUploads.length >= uploadsToCheck) {
			const uploaderReports = await ctx.db
				.query("reports")
				.withIndex("by_uploader", (q) => q.eq("uploaderId", voucher.uploaderId))
				.collect();

			const validReports = [];
			for (const report of uploaderReports) {
				const reporter = await ctx.db.get(report.reporterId);
				if (reporter && !reporter.isBanned) {
					validReports.push(report);
				}
			}

			// Check if threshold of recent uploads were reported
			const recentUploadIds = recentUploads.map((v) => v._id);
			const recentReported = validReports.filter((r) =>
				recentUploadIds.includes(r.voucherId),
			);

			const shouldFlag = recentReported.length >= reportsThreshold;

			if (shouldFlag) {
				const uploader = await ctx.db.get(voucher.uploaderId);
				if (uploader && !uploader.flaggedForReviewAt) {
					console.log(
						`🚫 UPLOADER FLAG: User ${voucher.uploaderId} flagged for bad uploads. ` +
							`${recentReported.length} of last ${uploadsToCheck} uploads reported. ` +
							`Total uploads: ${totalUploadCount}, Valid reports (non-banned): ${validReports.length}`,
					);
					console.log(
						`Last ${uploadsToCheck} uploads:`,
						recentUploads.map((v) => ({
							voucherId: v._id,
							type: v.type,
							status: v.status,
							createdAt: new Date(v.createdAt).toISOString(),
							wasReported: recentReported.some((r) => r.voucherId === v._id),
						})),
					);
					await ctx.db.patch(voucher.uploaderId, {
						flaggedForReviewAt: Date.now(),
					});
				}
			}
		}

		return {
			status: "reported",
			reportId: reportId,
			message:
				"Report received. You can request a replacement voucher if you need one.",
		};
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
