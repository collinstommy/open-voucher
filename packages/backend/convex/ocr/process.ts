import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

export const processVoucherImage = internalAction({
	args: {
		userId: v.id("users"),
		imageStorageId: v.id("_storage"),
	},
	handler: async (ctx, args) => {
		const { userId, imageStorageId } = args;

		try {
			const extracted = await ctx.runAction(internal.ocr.extract.extractFromImage, {
				imageStorageId,
			});

			const result = await ctx.runMutation(internal.ocr.store.storeVoucherFromOcr, {
				userId,
				imageStorageId,
				type: String(extracted.type),
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
			const user = await ctx.runQuery(internal.users.getUserById, { userId });
			if (user) {
				await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
					chatId: user.telegramChatId,
					text: `❌ <b>Voucher Processing Failed</b>\n\nWe encountered an error while processing your voucher. Please try again or contact support.`,
				});
			}
		}
	},
});
