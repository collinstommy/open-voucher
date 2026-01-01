import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { CLAIM_COSTS } from "./constants";

import dayjs from "dayjs";

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

		await ctx.db.patch(userId, {
			uploadCount: (user.uploadCount || 0) + 1,
		});

		await ctx.scheduler.runAfter(0, internal.ocr.process.processVoucherImage, {
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
		const newCoins = user.coins - cost;

		const imageUrl = await ctx.storage.getUrl(voucher.imageStorageId);
		if (!imageUrl) {
			return {
				success: false,
				error:
					"Failed to retrieve voucher image. No coins used. Please try again.",
			};
		}

		await ctx.db.patch(userId, {
			coins: newCoins,
			claimCount: (user.claimCount || 0) + 1,
		});

		await ctx.db.patch(voucher._id, {
			status: "claimed",
			claimerId: userId,
			claimedAt: now,
		});

		await ctx.db.insert("transactions", {
			userId,
			type: "claim_spend",
			amount: -cost,
			voucherId: voucher._id,
			createdAt: now,
		});

		return {
			success: true,
			voucherId: voucher._id,
			imageUrl,
			remainingCoins: newCoins,
			expiryDate: voucher.expiryDate,
		};
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

		const now = Date.now();
		const startOfDay = dayjs(now).startOf("day").valueOf();

		if (user.lastReportAt && user.lastReportAt >= startOfDay) {
			return {
				status: "rate_limited",
				message:
					"You can only report 1 voucher per day. Please try again tomorrow.",
			};
		}

		const voucher = await ctx.db.get(voucherId);

		if (!voucher) throw new Error("Voucher not found");
		if (voucher.claimerId !== user._id) {
			throw new Error("You did not claim this voucher");
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

		// 3. Check Reporter Ban Conditions
		// Get last 5 claims by this reporter
		const last5Claims = await ctx.db
			.query("vouchers")
			.withIndex("by_claimer_claimed_at", (q) => q.eq("claimerId", user._id))
			.order("desc")
			.take(5);

		// Get all reports by this reporter
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
			if (last5Reported.length >= 3) {
				console.log(
					`🚫 REPORTER BAN: User ${user._id} (${user.telegramChatId}) banned for excessive reporting. ` +
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
					isBanned: true,
					bannedAt: Date.now(),
				});
				return {
					status: "banned",
					message:
						"You have been banned for reporting 3 or more of your last 5 claims.",
				};
			}
		}

		// 4. Mark as Reported
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
			if (uploader) {
				await ctx.db.patch(voucher.uploaderId, {
					uploadReportCount: (uploader.uploadReportCount || 0) + 1,
				});
			}
		}

		// 5. Check Uploader Ban Conditions
		// Get last 5 uploads by this uploader
		const last5Uploads = await ctx.db
			.query("vouchers")
			.withIndex("by_uploader_created", (q) =>
				q.eq("uploaderId", voucher.uploaderId),
			)
			.order("desc")
			.take(5);

		if (last5Uploads.length >= 5) {
			// Get all reports for this uploader
			const uploaderReports = await ctx.db
				.query("reports")
				.withIndex("by_uploader", (q) => q.eq("uploaderId", voucher.uploaderId))
				.collect();

			// Filter out reports from banned users
			const validReports = [];
			for (const report of uploaderReports) {
				const reporter = await ctx.db.get(report.reporterId);
				if (reporter && !reporter.isBanned) {
					validReports.push(report);
				}
			}

			// Check if 3+ of last 5 uploads were reported
			const last5UploadIds = last5Uploads.map((v) => v._id);
			const last5Reported = validReports.filter((r) =>
				last5UploadIds.includes(r.voucherId),
			);

			if (last5Reported.length >= 3) {
				console.log(
					`🚫 UPLOADER BAN: User ${voucher.uploaderId} banned for bad uploads. ` +
						`${last5Reported.length} of last 5 uploads reported. ` +
						`Total uploads: ${last5Uploads.length}, Valid reports (non-banned): ${validReports.length}`,
				);
				console.log(
					"Last 5 uploads:",
					last5Uploads.map((v) => ({
						voucherId: v._id,
						type: v.type,
						status: v.status,
						createdAt: new Date(v.createdAt).toISOString(),
						wasReported: last5Reported.some((r) => r.voucherId === v._id),
					})),
				);
				await ctx.db.patch(voucher.uploaderId, {
					isBanned: true,
					bannedAt: Date.now(),
				});

				const uploader = await ctx.db.get(voucher.uploaderId);
				if (uploader) {
					await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
						chatId: uploader.telegramChatId,
						text: "🚫 <b>Account Banned</b>\n\nYour account has been banned because 3 or more of your last 5 uploads were reported as not working.",
					});
				}
			}
		}

		// Find replacement of same type
		const replacement = await ctx.db
			.query("vouchers")
			.withIndex("by_status_type", (q) =>
				q.eq("status", "available").eq("type", voucher.type),
			)
			.filter((q) =>
				q.or(
					q.eq(q.field("validFrom"), undefined),
					q.lte(q.field("validFrom"), now),
				),
			)
			.first();

		if (replacement) {
			const imageUrl = await ctx.storage.getUrl(replacement.imageStorageId);
			if (!imageUrl) {
				// Edge case: image missing. Refund coins.
				await ctx.db.patch(user._id, {
					coins: user.coins + CLAIM_COSTS[voucher.type],
				});
				return {
					status: "refunded",
					message: "Replacement found but image missing. Coins refunded.",
				};
			}

			await ctx.db.patch(replacement._id, {
				status: "claimed",
				claimerId: user._id,
				claimedAt: Date.now(),
			});

			await ctx.db.patch(user._id, {
				claimCount: (user.claimCount || 0) + 1,
			});

			// Link replacement to report
			if (reportId) {
				await ctx.db.patch(reportId, { replacementVoucherId: replacement._id });
			}

			return {
				status: "replaced",
				voucher: {
					_id: replacement._id,
					type: replacement.type,
					imageUrl,
					expiryDate: replacement.expiryDate,
				},
			};
		} else {
			await ctx.db.patch(user._id, {
				coins: user.coins + CLAIM_COSTS[voucher.type],
			});
			return { status: "refunded" };
		}
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
