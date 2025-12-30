import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
	internalMutation,
	internalQuery,
	internalAction,
} from "./_generated/server";
import { CLAIM_COSTS, MAX_COINS, UPLOAD_REWARDS } from "./constants";

import dayjs from "dayjs";
import { Id } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";
import { OCR_ERROR, type OcrError } from "./ocr";

export const getVoucherByBarcode = internalQuery({
	args: { barcodeNumber: v.string() },
	handler: async (ctx, { barcodeNumber }) => {
		return await ctx.db
			.query("vouchers")
			.withIndex("by_barcode", (q) => q.eq("barcodeNumber", barcodeNumber))
			.first();
	},
});

export const getTelegramChatId = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		const user = await ctx.db.get(userId);
		return user?.telegramChatId ?? null;
	},
});

export const createFailedUpload = internalMutation({
	args: {
		userId: v.id("users"),
		imageStorageId: v.id("_storage"),
		errorReason: v.string(),
		createdAt: v.number(),
	},
	handler: async (ctx, { userId, imageStorageId, errorReason, createdAt }) => {
		await ctx.db.insert("failedUploads", {
			userId,
			imageStorageId,
			errorReason,
			createdAt,
		});
	},
});

export const sendErrorMessageAction = internalMutation({
	args: {
		telegramChatId: v.string(),
		errorReason: v.string(),
		detectedExpiryDate: v.optional(v.number()),
	},
	handler: async (ctx, { telegramChatId, errorReason, detectedExpiryDate }) => {
		let userMessage = "❌ <b>Voucher Processing Failed</b>\n\n";

		if (errorReason === OCR_ERROR.COULD_NOT_READ_AMOUNT) {
			userMessage += "We couldn't determine the voucher amount (e.g., €5, €10, €20). Please make sure the value is clear in the photo.";
		} else if (errorReason === OCR_ERROR.COULD_NOT_READ_EXPIRY_DATE) {
			userMessage += "We couldn't determine the expiry date. Please make sure it's clear in the photo.";
		} else if (errorReason === OCR_ERROR.COULD_NOT_READ_VALID_FROM) {
			userMessage += "We couldn't determine the valid from date. Please make sure the validity dates are clear in the photo.";
		} else if (errorReason === OCR_ERROR.COULD_NOT_READ_BARCODE) {
			userMessage += "We couldn't read the barcode. Please ensure it's fully visible and clear.";
		} else if (errorReason === OCR_ERROR.EXPIRED) {
			const dateToUse = detectedExpiryDate ?? Date.now();
			userMessage += "This voucher expired on " + dayjs(dateToUse).format("DD-MM-YYYY") + ".";
		} else if (errorReason === OCR_ERROR.INVALID_TYPE) {
			userMessage += "This voucher does not appear to be a valid €5, €10, or €20 Dunnes voucher. We only accept these specific general spend vouchers.";
		} else if (errorReason === OCR_ERROR.DUPLICATE_BARCODE) {
			userMessage += "This voucher has already been uploaded by someone. Each voucher can only be uploaded once.";
		} else {
			userMessage += "We encountered an unknown error while processing your voucher. Please try again or contact support.";
		}

		await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
			chatId: telegramChatId,
			text: userMessage,
		});
	},
});

export const sendSuccessMessageAction = internalMutation({
	args: {
		telegramChatId: v.string(),
		voucherType: v.union(v.literal("5"), v.literal("10"), v.literal("20")),
		reward: v.number(),
		newCoins: v.number(),
	},
	handler: async (ctx, { telegramChatId, voucherType, reward, newCoins }) => {
		await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
			chatId: telegramChatId,
			text: "✅ <b>Voucher Accepted!</b>\n\nThanks for sharing a €" + voucherType + " voucher.\nCoins earned: +" + reward + "\nNew balance: " + newCoins,
		});
	},
});

export const createVoucherFromOcr = internalMutation({
	args: {
		userId: v.id("users"),
		imageStorageId: v.id("_storage"),
		voucherType: v.union(v.literal("5"), v.literal("10"), v.literal("20")),
		expiryDate: v.number(),
		validFrom: v.number(),
		barcodeNumber: v.string(),
		ocrRawResponse: v.string(),
		createdAt: v.number(),
	},
	handler: async (
		ctx,
		{ userId, imageStorageId, voucherType, expiryDate, validFrom, barcodeNumber, ocrRawResponse, createdAt },
	) => {
		const user = await ctx.db.get(userId);
		if (!user) {
			return { success: false };
		}

		const voucherId = await ctx.db.insert("vouchers", {
			type: voucherType,
			status: "available",
			imageStorageId,
			barcodeNumber,
			expiryDate,
			validFrom,
			uploaderId: userId,
			createdAt,
			ocrRawResponse,
		});

		const reward = UPLOAD_REWARDS[voucherType];
		const newCoins = Math.min(MAX_COINS, user.coins + reward);
		await ctx.db.patch(userId, { coins: newCoins });

		await ctx.db.insert("transactions", {
			userId,
			type: "upload_reward",
			amount: reward,
			voucherId,
			createdAt,
		});

		return { success: true, reward, newCoins };
	},
});

function parseExpiryDate(expiryDate: string | null): number | OcrError {
	if (!expiryDate) {
		return OCR_ERROR.COULD_NOT_READ_EXPIRY_DATE;
	}

	const dayjsDate = dayjs(expiryDate);
	const now = dayjs();

	if (!dayjsDate.isValid() || dayjsDate.valueOf() < Date.now() - 365 * 24 * 60 * 60 * 1000) {
		return OCR_ERROR.EXPIRED;
	}

	const expiryTimestamp = dayjsDate.endOf("day").valueOf();

	if (dayjsDate.isBefore(now, "day")) {
		return OCR_ERROR.EXPIRED;
	}

	if (dayjsDate.isSame(now, "day") && now.hour() >= 21) {
		return OCR_ERROR.EXPIRED;
	}

	return expiryTimestamp;
}

function parseValidFrom(validFrom: string | null): number | OcrError {
	if (!validFrom) {
		return OCR_ERROR.COULD_NOT_READ_VALID_FROM;
	}

	const dayjsValidFrom = dayjs(validFrom);

	if (!dayjsValidFrom.isValid() || dayjsValidFrom.valueOf() < Date.now() - 365 * 24 * 60 * 60 * 1000) {
		return OCR_ERROR.COULD_NOT_READ_VALID_FROM;
	}

	return dayjsValidFrom.startOf("day").valueOf();
}

function parseVoucherType(type: string | number): "5" | "10" | "20" | OcrError {
	if (type === "10" || type === 10) {
		return "10";
	}
	if (type === "20" || type === 20) {
		return "20";
	}
	if (type === "5" || type === 5) {
		return "5";
	}
	return OCR_ERROR.INVALID_TYPE;
}

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

		const recentUploads = await ctx.db
			.query("vouchers")
			.withIndex("by_uploader_created", (q) =>
				q.eq("uploaderId", userId).gt("createdAt", oneDayAgo),
			)
			.collect();

		if (recentUploads.length >= 10) {
			await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
				chatId: user.telegramChatId,
				text: "🚫 <b>Daily Upload Limit Reached</b>\n\nYou can only upload 10 vouchers per 24 hours. Please try again later.",
			});
			return null;
		}

		await ctx.scheduler.runAfter(0, internal.vouchers.processAndValidateVoucher, {
			userId,
			imageStorageId,
		});

		return null;
	},
});

export const processAndValidateVoucher = internalAction({
	args: {
		userId: v.id("users"),
		imageStorageId: v.id("_storage"),
	},
	handler: async (ctx, { userId, imageStorageId }) => {
		const now = Date.now();

		const ocrResult = await ctx.runAction(internal.ocr.extractVoucherData, {
			imageStorageId,
		});

		if (!ocrResult.success) {
			await ctx.runMutation(internal.vouchers.createFailedUpload, {
				userId,
				imageStorageId,
				errorReason: ocrResult.error,
				createdAt: now,
			});

			const telegramChatId = await ctx.runQuery(
				internal.vouchers.getTelegramChatId,
				{ userId },
			);
			if (telegramChatId) {
				await ctx.runMutation(internal.vouchers.sendErrorMessageAction, {
					telegramChatId,
					errorReason: ocrResult.error,
				});
			}
			return;
		}

		const { data: extracted } = ocrResult;

		const voucherType = parseVoucherType(extracted.type);
		if (typeof voucherType === "string" && voucherType.startsWith("O")) {
			await ctx.runMutation(internal.vouchers.createFailedUpload, {
				userId,
				imageStorageId,
				errorReason: voucherType,
				createdAt: now,
			});

			const telegramChatId = await ctx.runQuery(
				internal.vouchers.getTelegramChatId,
				{ userId },
			);
			if (telegramChatId) {
				await ctx.runMutation(internal.vouchers.sendErrorMessageAction, {
					telegramChatId,
					errorReason: voucherType,
				});
			}
			return;
		}

		const validFrom = parseValidFrom(extracted.validFrom);
		if (typeof validFrom === "string" && validFrom.startsWith("O")) {
			await ctx.runMutation(internal.vouchers.createFailedUpload, {
				userId,
				imageStorageId,
				errorReason: validFrom,
				createdAt: now,
			});

			const telegramChatId = await ctx.runQuery(
				internal.vouchers.getTelegramChatId,
				{ userId },
			);
			if (telegramChatId) {
				await ctx.runMutation(internal.vouchers.sendErrorMessageAction, {
					telegramChatId,
					errorReason: validFrom,
				});
			}
			return;
		}

		const expiryDate = parseExpiryDate(extracted.expiryDate);
		if (typeof expiryDate === "string" && expiryDate.startsWith("O")) {
			const detectedExpiryDate =
				typeof expiryDate === "number" ? expiryDate : undefined;
			await ctx.runMutation(internal.vouchers.createFailedUpload, {
				userId,
				imageStorageId,
				errorReason: expiryDate,
				createdAt: now,
			});

			const telegramChatId = await ctx.runQuery(
				internal.vouchers.getTelegramChatId,
				{ userId },
			);
			if (telegramChatId) {
				await ctx.runMutation(internal.vouchers.sendErrorMessageAction, {
					telegramChatId,
					errorReason: expiryDate,
					detectedExpiryDate,
				});
			}
			return;
		}

		if (!extracted.barcode) {
			await ctx.runMutation(internal.vouchers.createFailedUpload, {
				userId,
				imageStorageId,
				errorReason: OCR_ERROR.COULD_NOT_READ_BARCODE,
				createdAt: now,
			});

			const telegramChatId = await ctx.runQuery(
				internal.vouchers.getTelegramChatId,
				{ userId },
			);
			if (telegramChatId) {
				await ctx.runMutation(internal.vouchers.sendErrorMessageAction, {
					telegramChatId,
					errorReason: OCR_ERROR.COULD_NOT_READ_BARCODE,
				});
			}
			return;
		}

		const existingVoucher = await ctx.runQuery(internal.vouchers.getVoucherByBarcode, {
			barcodeNumber: extracted.barcode,
		});
		if (existingVoucher) {
			await ctx.runMutation(internal.vouchers.createFailedUpload, {
				userId,
				imageStorageId,
				errorReason: OCR_ERROR.DUPLICATE_BARCODE,
				createdAt: now,
			});

			const telegramChatId = await ctx.runQuery(
				internal.vouchers.getTelegramChatId,
				{ userId },
			);
			if (telegramChatId) {
				await ctx.runMutation(internal.vouchers.sendErrorMessageAction, {
					telegramChatId,
					errorReason: OCR_ERROR.DUPLICATE_BARCODE,
				});
			}
			return;
		}

		const result = await ctx.runMutation(internal.vouchers.createVoucherFromOcr, {
			userId,
			imageStorageId,
			voucherType,
			expiryDate,
			validFrom,
			barcodeNumber: extracted.barcode,
			ocrRawResponse: ocrResult.rawResponse,
			createdAt: now,
		});

		const telegramChatId = await ctx.runQuery(internal.vouchers.getTelegramChatId, {
			userId,
		});
		if (telegramChatId && result.success) {
			await ctx.runMutation(internal.vouchers.sendSuccessMessageAction, {
				telegramChatId,
				voucherType,
				reward: result.reward,
				newCoins: result.newCoins,
			});
		}
	},
});

export const cleanupFailedUploads = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

		const oldFailedUploads = await ctx.db
			.query("failedUploads")
			.withIndex("by_created", (q) => q.lt("createdAt", sevenDaysAgo))
			.collect();

		let deletedCount = 0;
		for (const failedUpload of oldFailedUploads) {
			await ctx.storage.delete(failedUpload.imageStorageId);
			await ctx.db.delete(failedUpload._id);
			deletedCount++;
		}

		if (deletedCount > 0) {
			console.log("Cleaned up " + deletedCount + " failed uploads.");
		}

		return deletedCount;
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

		// Check claim limit (5 per 24h)
		const recentClaims = await ctx.db
			.query("vouchers")
			.withIndex("by_claimer_claimed_at", (q) =>
				q.eq("claimerId", userId).gt("claimedAt", oneDayAgo),
			)
			.collect();

		if (recentClaims.length >= 5) {
			return {
				success: false,
				error:
					"🚫 <b>Daily Claim Limit Reached</b>\n\nYou can only claim 5 vouchers per 24 hours. Please try again later.",
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

		// Sort by expiry date ascending (soonest first)
		const voucher = vouchers.sort((a, b) => a.expiryDate - b.expiryDate)[0];

		// Deduct coins and increment claim counter
		const newCoins = user.coins - cost;
		await ctx.db.patch(userId, {
			coins: newCoins,
			claimCount: (user.claimCount || 0) + 1,
		});

		// Mark voucher as claimed

		// Attempt to get image URL - if this fails, revert and error
		const imageUrl = await ctx.storage.getUrl(voucher.imageStorageId);
		if (!imageUrl) {
			// Revert voucher status
			await ctx.db.patch(voucher._id, {
				status: "available",
				claimerId: undefined,
				claimedAt: undefined,
			});
			// Revert user coins
			await ctx.db.patch(userId, { coins: user.coins });
			return {
				success: false,
				error:
					"Failed to retrieve voucher image. No coins used. Please try again.",
			return;
		}

		// Check if voucher is already expired
		const isExpired = expiryDate < Date.now();

		if (isExpired) {
			await failVoucherHelper(
				ctx,
				voucherId,
				`Voucher expired on ${dayjs(expiryDate).format("DD-MM-YYYY")}`,
				"EXPIRED",
				expiryDate,
			);
			return;
		}

		const status = "available";

		// Update voucher with OCR data
		await ctx.db.patch(voucherId, {
			type,
			expiryDate,
			validFrom,
			barcodeNumber,
			ocrRawResponse,
			status,
		});

		// Award coins to uploader (only if not expired)
		if (status === "available") {
			const reward = UPLOAD_REWARDS[type];
			const newCoins = Math.min(MAX_COINS, uploader.coins + reward);
			await ctx.db.patch(voucher.uploaderId, { coins: newCoins });

			// Record transaction
			await ctx.db.insert("transactions", {
				userId: voucher.uploaderId,
				type: "upload_reward",
				amount: reward,
				voucherId,
				createdAt: Date.now(),
			});

			// Notify user
			await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
				chatId: uploader.telegramChatId,
				text: `✅ <b>Voucher Accepted!</b>\n\nThanks for sharing a €${type} voucher.\nCoins earned: +${reward}\nNew balance: ${newCoins}`,
			});
		}
	},
});

/**
 * Mark a voucher as failed OCR processing.
 * Called internally when OCR fails.
 */
export const markVoucherOcrFailed = internalMutation({
	args: {
		voucherId: v.id("vouchers"),
		error: v.string(),
		reason: v.union(
			v.literal("EXPIRED"),
			v.literal("COULD_NOT_READ_AMOUNT"),
			v.literal("COULD_NOT_READ_BARCODE"),
			v.literal("COULD_NOT_READ_EXPIRY_DATE"),
			v.literal("COULD_NOT_READ_VALID_FROM"),
			v.literal("INVALID_TYPE"),
			v.literal("DUPLICATE_BARCODE"),
			v.literal("UNKNOWN_ERROR"),
		),
		expiryDate: v.optional(v.number()),
	},
	handler: async (ctx, { voucherId, error, reason, expiryDate }) => {
		await failVoucherHelper(ctx, voucherId, error, reason, expiryDate);
	},
});

/**
 * Report a voucher as not working
 * Marks as reported, checks ban threshold, and tries to send a replacement.
 */
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

		// 5. Replacement Logic (No charge)
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
			// Refund coins
			await ctx.db.patch(user._id, {
				coins: user.coins + CLAIM_COSTS[voucher.type],
			});
			return { status: "refunded" };
		}
	},
});

export const expireOldVouchers = internalMutation({
