import {
	RETURN_VOUCHER_REPLY_TEXT,
	returnVoucherReplyKeyboard,
} from "../inboundReplies";
import { helpMenuKeyboard } from "../keyboards";
import { on } from "../router";

on("faq", async (c, event, bot) => {
	await bot.answerCallback(c.callbackId);

	switch (event.action) {
		case "back": {
			await bot.sendMessage(
				c.chatId,
				"Choose an option below",
				helpMenuKeyboard(),
			);
			break;
		}
		case "return_cancel": {
			await bot.sendMessage(
				c.chatId,
				RETURN_VOUCHER_REPLY_TEXT,
				returnVoucherReplyKeyboard(),
			);
			break;
		}
		case "processing_failed": {
			await bot.sendMessage(
				c.chatId,
				"If uploading a paper voucher, retake the photo with clear lighting, the full voucher visible, and no blur.",
			);
			break;
		}
	}
});
