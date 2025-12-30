import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

/**
 * Process a voucher image through OCR and store if valid.
 * Orchestrates: extract data → validate → create voucher (or send error).
 */
export const processVoucherImage = internalAction({
	args: {
		userId: v.id("users"),
		imageStorageId: v.id("_storage"),
	},
	handler: async (ctx, args) => {
		const { userId, imageStorageId } = args;

		try {
			// Step 1: Extract OCR data from image
			const extracted = await ctx.runAction(internal.ocr.extractFromImage, {
				imageStorageId,
			});

			// Step 2: Validate and store voucher if valid
			const result = await ctx.runMutation(internal.ocr.storeVoucherFromOcr, {
				userId,
				imageStorageId,
				type: extracted.type,
				validFrom: extracted.validFrom,
				expiryDate: extracted.expiryDate,
				barcode: extracted.barcode,
				rawResponse: extracted.rawResponse,
			});

			if (result.success) {
				console.log(`Voucher created: ${result.voucherId}`);
			} else {
				console.log(`Voucher rejected: ${result.reason}`);
				// Error message is sent by storeVoucherFromOcr
			}
		} catch (error: any) {
			console.error("OCR processing failed:", error);

			// Send generic error message to user
			const user = await ctx.db.get(userId);
			if (user) {
				await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
					chatId: user.telegramChatId,
					text: `❌ <b>Voucher Processing Failed</b>\n\nWe encountered an error while processing your voucher. Please try again or contact support.`,
				});
			}
		}
	},
});
