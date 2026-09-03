// Shared voucher-flow cores. The bot path (internalMutation shells below in
// convex/vouchers.ts, called from the Telegram actions with a chat-looked-up
// userId) and the app path (userMutation wrappers with the authed userId)
// execute the same state machine: guards, coin ledger, and notifications live
// here so the two transports cannot drift. Shells own only identity plumbing
// (who the userId comes from) and transport-specific delivery.

import dayjs from "dayjs";
import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { MutationCtx } from "../../convex/_generated/server";
import { applyCoinDelta } from "./coinLedger";
import { CLAIM_COSTS } from "./constants";
import { notifyUser } from "./notify";
import { recalculateReportCounts } from "./reportCounts";

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

export type ClaimResult =
	| {
			success: true;
			voucherId: Id<"vouchers">;
			imageUrl: string;
			remainingCoins: number;
			expiryDate: number;
	  }
	| { success: false; error: string };

export type ReportResult =
	| { status: "banned"; message: string }
	| { status: "rate_limited"; message: string }
	| { status: "expired"; message: string }
	| { status: "already_reported"; message: string }
	| {
			status: "reported";
			reportId: Id<"reports"> | undefined;
			message: string;
	  };

export async function uploadVoucherCore(
	ctx: MutationCtx,
	{
		userId,
		imageStorageId,
	}: { userId: Id<"users">; imageStorageId: Id<"_storage"> },
): Promise<null> {
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
		const text =
			"🚫 <b>Daily Upload Limit Reached</b>\n\nYou can only upload 10 vouchers per 24 hours. Please try again later.";
		await notifyUser(ctx, user, text, {
			kind: "upload_limit",
			payload: { text },
		});
		return null;
	}

	await ctx.scheduler.runAfter(0, internal.ocr.processVoucherImage, {
		userId,
		imageStorageId,
	});

	return null;
}

export async function requestVoucherCore(
	ctx: MutationCtx,
	{ userId, type }: { userId: Id<"users">; type: "5" | "10" | "20" },
): Promise<ClaimResult> {
	const user = await ctx.db.get(userId);
	if (!user) {
		throw new Error("User not found");
	}

	// The bot pre-checks bans before dispatch (telegram.ts), but the app
	// calls this core directly, so the guard lives here for both paths.
	if (user.isBanned) {
		return {
			success: false,
			error: "You have been banned from this service.",
		};
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
}

export async function reportVoucherCore(
	ctx: MutationCtx,
	{ userId, voucherId }: { userId: Id<"users">; voucherId: Id<"vouchers"> },
): Promise<ReportResult> {
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
				`🚫 REPORTER FLAG: User ${user._id} flagged for excessive reporting. ` +
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

		await ctx.db.patch(user._id, { lastReportAt: now });
		await recalculateReportCounts(ctx, [user._id, voucher.uploaderId]);

		const uploader = await ctx.db.get(voucher.uploaderId);
		if (uploader && uploader.telegramChatId !== undefined) {
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
		} else if (uploader) {
			// Chatless uploader: the Telegram send has nowhere to go, so
			// the report lands in their outbox instead (decoupling proof).
			const suffix =
				voucher.barcodeNumber && voucher.barcodeNumber.length >= 4
					? voucher.barcodeNumber.slice(-4)
					: voucher.barcodeNumber;
			const text =
				"⚠️ <b>Someone has reported one of your vouchers as not working.</b>\n\n" +
				`€${voucher.type} voucher${suffix ? ` (ending in ${suffix})` : ""}\n\n` +
				"Did you use this voucher already?";
			await ctx.db.insert("notificationOutbox", {
				userId: uploader._id,
				kind: "uploader_reported",
				payload: {
					text,
					data: {
						voucherId: voucher._id,
						voucherType: voucher.type,
						barcodeNumber: voucher.barcodeNumber,
					},
				},
			});
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
}
