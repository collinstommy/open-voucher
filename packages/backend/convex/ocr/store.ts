import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";
import { UPLOAD_REWARDS, MAX_COINS } from "../constants";
import dayjs from "dayjs";

type VoucherOcrFailureReason =
	| "EXPIRED"
	| "COULD_NOT_READ_AMOUNT"
	| "COULD_NOT_READ_BARCODE"
	| "COULD_NOT_READ_EXPIRY_DATE"
	| "COULD_NOT_READ_VALID_FROM"
	| "INVALID_TYPE"
	| "DUPLICATE_BARCODE"
	| "UNKNOWN_ERROR";

/**
 * Check if a barcode already exists in the database.
 */
export const checkBarcodeExists = internalQuery({
	args: { barcodeNumber: v.string() },
	handler: async (ctx, { barcodeNumber }) => {
		return await ctx.db
			.query("vouchers")
			.withIndex("by_barcode", (q) => q.eq("barcodeNumber", barcodeNumber))
			.first();
	},
});

/**
 * Validate extracted OCR data and create voucher if valid.
 * Sends appropriate telegram message to user based on result.
 */
export const storeVoucherFromOcr = internalMutation({
	args: {
		userId: v.id("users"),
		imageStorageId: v.id("_storage"),
		type: v.union(v.number(), v.string()),
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

		// Validate type
		let voucherType: "5" | "10" | "20";
		const typeNum = typeof type === "string" ? parseInt(type, 10) : type;
		if (typeNum === 10) {
			voucherType = "10";
		} else if (typeNum === 20) {
			voucherType = "20";
		} else if (typeNum === 5) {
			voucherType = "5";
		} else {
			await sendErrorMessage(ctx, user.telegramChatId, "INVALID_TYPE");
			return { success: false, reason: "INVALID_TYPE" };
		}

		// Validate and parse validFrom
		let validFromMs: number | undefined;
		if (validFrom) {
			const dayjsValidFrom = dayjs(validFrom);
			if (!dayjsValidFrom.isValid() || dayjsValidFrom.valueOf() < Date.now() - 365 * 24 * 60 * 60 * 1000) {
				await sendErrorMessage(ctx, user.telegramChatId, "COULD_NOT_READ_VALID_FROM");
				return { success: false, reason: "COULD_NOT_READ_VALID_FROM" };
			}
			validFromMs = dayjsValidFrom.startOf("day").valueOf();
		}

		// Validate and parse expiry date
		let expiryDateMs: number;
		if (!expiryDate) {
			await sendErrorMessage(ctx, user.telegramChatId, "COULD_NOT_READ_EXPIRY_DATE");
			return { success: false, reason: "COULD_NOT_READ_EXPIRY_DATE" };
		}

		const dayjsExpiry = dayjs(expiryDate);
		const now = dayjs();

		if (!dayjsExpiry.isValid() || dayjsExpiry.valueOf() < Date.now() - 365 * 24 * 60 * 60 * 1000) {
			await sendErrorMessage(ctx, user.telegramChatId, "EXPIRED");
			return { success: false, reason: "EXPIRED" };
		}

		expiryDateMs = dayjsExpiry.endOf("day").valueOf();

		// Check if already expired (yesterday or older)
		if (dayjsExpiry.isBefore(now, "day")) {
			await sendErrorMessage(ctx, user.telegramChatId, "EXPIRED", expiryDateMs);
			return { success: false, reason: "EXPIRED", expiryDate: expiryDateMs };
		}

		// Check if expiring today and it's too late (after 9 PM)
		if (dayjsExpiry.isSame(now, "day") && now.hour() >= 21) {
			await sendErrorMessage(ctx, user.telegramChatId, "EXPIRED", expiryDateMs);
			return { success: false, reason: "EXPIRED", expiryDate: expiryDateMs };
		}

		// Validate barcode
		if (!barcode) {
			await sendErrorMessage(ctx, user.telegramChatId, "COULD_NOT_READ_BARCODE");
			return { success: false, reason: "COULD_NOT_READ_BARCODE" };
		}

		// Check for duplicate barcode
		const existing = await ctx.runQuery(internal.ocr.store.checkBarcodeExists, { barcodeNumber: barcode });
		if (existing) {
			await sendErrorMessage(ctx, user.telegramChatId, "DUPLICATE_BARCODE");
			return { success: false, reason: "DUPLICATE_BARCODE" };
		}

		// All validations passed - create voucher
		const nowMs = Date.now();
		const voucherId = await ctx.db.insert("vouchers", {
			type: voucherType,
			status: "available",
			imageStorageId,
			uploaderId: userId,
			expiryDate: expiryDateMs,
			validFrom: validFromMs,
			barcodeNumber: barcode,
			ocrRawResponse: rawResponse,
			createdAt: nowMs,
		});

		// Award coins
		const reward = UPLOAD_REWARDS[voucherType];
		const newCoins = Math.min(MAX_COINS, user.coins + reward);
		await ctx.db.patch(userId, { coins: newCoins });

		// Record transaction
		await ctx.db.insert("transactions", {
			userId,
			type: "upload_reward",
			amount: reward,
			voucherId,
			createdAt: nowMs,
		});

		// Send success message
		await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
			chatId: user.telegramChatId,
			text: `✅ <b>Voucher Accepted!</b>\n\nThanks for sharing a €${voucherType} voucher.\nCoins earned: +${reward}\nNew balance: ${newCoins}`,
		});

		console.log(`Voucher created: ${voucherId} (type=${voucherType}, barcode=${barcode})`);

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
