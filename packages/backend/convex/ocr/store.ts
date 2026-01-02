import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, MutationCtx } from "../_generated/server";
import { UPLOAD_REWARDS, MAX_COINS } from "../constants";
import dayjs from "dayjs";
import type { Id } from "../_generated/dataModel";

type VoucherOcrFailureReason =
	| "EXPIRED"
	| "TOO_LATE_TODAY"
	| "COULD_NOT_READ_AMOUNT"
	| "COULD_NOT_READ_BARCODE"
	| "COULD_NOT_READ_EXPIRY_DATE"
	| "COULD_NOT_READ_VALID_FROM"
	| "INVALID_TYPE"
	| "DUPLICATE_BARCODE"
	| "UNKNOWN_ERROR";

async function recordFailedUpload(
	ctx: MutationCtx,
	userId: Id<"users">,
	imageStorageId: Id<"_storage">,
	reason: VoucherOcrFailureReason,
	ocrData: { rawResponse: string; type?: string; barcode?: string; expiryDate?: string; validFrom?: string }
) {
	await ctx.db.insert("failedUploads", {
		userId,
		imageStorageId,
		failureType: "validation" as const,
		failureReason: reason,
		rawOcrResponse: ocrData.rawResponse,
		extractedType: ocrData.type,
		extractedBarcode: ocrData.barcode,
		extractedExpiryDate: ocrData.expiryDate,
		extractedValidFrom: ocrData.validFrom,
	});
}

export const storeVoucherFromOcr = internalMutation({
	args: {
		userId: v.id("users"),
		imageStorageId: v.id("_storage"),
		type: v.string(),
		validFrom: v.optional(v.string()),
		expiryDate: v.optional(v.string()),
		barcode: v.optional(v.string()),
		rawResponse: v.string(),
	},
	handler: async (ctx, args) => {
		const { userId, imageStorageId, type, validFrom, expiryDate, barcode, rawResponse } = args;

		const user = await ctx.db.get(userId);
		if (!user) {
			throw new Error("User not found");
		}

		const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
		const now = dayjs();

		// Parse and validate type
		const isValidType = type === "5" || type === "10" || type === "20";

		// Parse and validate expiry date
		const dayjsExpiry = dayjs(expiryDate!);
		const isExpiryDateValid = expiryDate && dayjsExpiry.isValid() && dayjsExpiry.valueOf() > oneYearAgo;
		const isAlreadyExpired = dayjsExpiry.isBefore(now, "day");
		const isTooLateToday = dayjsExpiry.isSame(now, "day") && now.hour() >= 21;
		const expiryDateMs = dayjsExpiry.endOf("day").valueOf();

		if (!validFrom) {
			await recordFailedUpload(ctx, userId, imageStorageId, "COULD_NOT_READ_VALID_FROM", {
				rawResponse, type, barcode, expiryDate, validFrom
			});
			await sendErrorMessage(ctx, user.telegramChatId, "COULD_NOT_READ_VALID_FROM");
			return { success: false, reason: "COULD_NOT_READ_VALID_FROM" };
		}

		const dayjsValidFrom =  dayjs(validFrom);
		const isValidFromValid = dayjsValidFrom.isValid() && dayjsValidFrom.valueOf() > oneYearAgo;

		if (!isValidType) {
			await recordFailedUpload(ctx, userId, imageStorageId, "INVALID_TYPE", {
				rawResponse, type, barcode, expiryDate, validFrom
			});
			await sendErrorMessage(ctx, user.telegramChatId, "INVALID_TYPE");
			return { success: false, reason: "INVALID_TYPE" };
		}

		if (!isValidFromValid) {
			await recordFailedUpload(ctx, userId, imageStorageId, "COULD_NOT_READ_VALID_FROM", {
				rawResponse, type, barcode, expiryDate, validFrom
			});
			await sendErrorMessage(ctx, user.telegramChatId, "COULD_NOT_READ_VALID_FROM");
			return { success: false, reason: "COULD_NOT_READ_VALID_FROM" };
		}

		if (!isExpiryDateValid) {
			await recordFailedUpload(ctx, userId, imageStorageId, "COULD_NOT_READ_EXPIRY_DATE", {
				rawResponse, type, barcode, expiryDate, validFrom
			});
			await sendErrorMessage(ctx, user.telegramChatId, "COULD_NOT_READ_EXPIRY_DATE");
			return { success: false, reason: "COULD_NOT_READ_EXPIRY_DATE" };
		}

		if (isAlreadyExpired) {
			await recordFailedUpload(ctx, userId, imageStorageId, "EXPIRED", {
				rawResponse, type, barcode, expiryDate, validFrom
			});
			await sendErrorMessage(ctx, user.telegramChatId, "EXPIRED", expiryDateMs);
			return { success: false, reason: "EXPIRED", expiryDate: expiryDateMs };
		}

		if (isTooLateToday) {
			await recordFailedUpload(ctx, userId, imageStorageId, "TOO_LATE_TODAY", {
				rawResponse, type, barcode, expiryDate, validFrom
			});
			await sendErrorMessage(ctx, user.telegramChatId, "TOO_LATE_TODAY", expiryDateMs);
			return { success: false, reason: "TOO_LATE_TODAY", expiryDate: expiryDateMs };
		}

		if (!barcode) {
			await recordFailedUpload(ctx, userId, imageStorageId, "COULD_NOT_READ_BARCODE", {
				rawResponse, type, barcode, expiryDate, validFrom
			});
			await sendErrorMessage(ctx, user.telegramChatId, "COULD_NOT_READ_BARCODE");
			return { success: false, reason: "COULD_NOT_READ_BARCODE" };
		}

		const existing = await ctx.db
		.query("vouchers")
		.withIndex("by_barcode", (q) => q.eq("barcodeNumber", barcode))
		.first();

		if (existing) {
			await recordFailedUpload(ctx, userId, imageStorageId, "DUPLICATE_BARCODE", {
				rawResponse, type, barcode, expiryDate, validFrom
			});
			await sendErrorMessage(ctx, user.telegramChatId, "DUPLICATE_BARCODE");
			return { success: false, reason: "DUPLICATE_BARCODE" };
		}

		const nowMs = Date.now();
		const voucherId = await ctx.db.insert("vouchers", {
			type,
			status: "available",
			imageStorageId,
			uploaderId: userId,
			expiryDate: expiryDateMs,
			validFrom: dayjsValidFrom?.startOf("day").valueOf(),
			barcodeNumber: barcode,
			ocrRawResponse: rawResponse,
			createdAt: nowMs,
		});

		const reward = UPLOAD_REWARDS[type];
		const newCoins = Math.min(MAX_COINS, user.coins + reward);
		await ctx.db.patch(userId, { coins: newCoins });

		await ctx.db.insert("transactions", {
			userId,
			type: "upload_reward",
			amount: reward,
			voucherId,
			createdAt: nowMs,
		});

		await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
			chatId: user.telegramChatId,
			text: `✅ <b>Voucher Accepted!</b>\n\nThanks for sharing a €${type} voucher.\nCoins earned: +${reward}\nNew balance: ${newCoins}`,
		});

		console.log(`Voucher created: ${voucherId} (type=${type}, barcode=${barcode})`);

		return { success: true, voucherId };
	},
});

async function sendErrorMessage(
	ctx: any,
	chatId: string | number,
	reason: VoucherOcrFailureReason,
	expiryDate?: number,
) {
	let message = `❌ <b>Voucher Processing Failed</b>\n\n`;

	switch (reason) {
		case "COULD_NOT_READ_AMOUNT":
			message += `We couldn't determine the voucher amount (e.g., €5, €10, €20). Please make sure the value is clear in the photo.`;
			break;
		case "COULD_NOT_READ_EXPIRY_DATE":
			message += `We couldn't determine the expiry date. Please make sure it's clear in the photo.`;
			break;
		case "COULD_NOT_READ_VALID_FROM":
			message += `We couldn't determine the valid from date. Please make sure the validity dates are clear in the photo.`;
			break;
		case "COULD_NOT_READ_BARCODE":
			message += `We couldn't read the barcode. Please ensure it's fully visible and clear.`;
			break;
		case "EXPIRED":
			const dateStr = expiryDate ? dayjs(expiryDate).format("DD-MM-YYYY") : "unknown";
			message += `This voucher expired on ${dateStr}.`;
			break;
		case "TOO_LATE_TODAY":
			const todayDateStr = expiryDate ? dayjs(expiryDate).format("DD-MM-YYYY") : "today";
			message += `This voucher expires ${todayDateStr}, but it's after 9 PM. Vouchers expiring today can only be uploaded before 9 PM.`;
			break;
		case "INVALID_TYPE":
			message += `This voucher does not appear to be a valid €5, €10, or €20 Dunnes voucher. We only accept these specific general spend vouchers.`;
			break;
		case "DUPLICATE_BARCODE":
			message += `This voucher has already been uploaded by someone. Each voucher can only be uploaded once.`;
			break;
		default:
			message += `We encountered an unknown error while processing your voucher. Please try again or contact support.`;
	}

	await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
		chatId,
		text: message,
	});
}

export const recordSystemError = internalMutation({
	args: {
		userId: v.id("users"),
		imageStorageId: v.id("_storage"),
		errorMessage: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.db.insert("failedUploads", {
			userId: args.userId,
			imageStorageId: args.imageStorageId,
			failureType: "system",
			failureReason: "SYSTEM_ERROR",
			errorMessage: args.errorMessage,
		});
	},
});
