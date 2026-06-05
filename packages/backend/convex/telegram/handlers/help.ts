import { internal } from "../../_generated/api";
import type { BotAdapter } from "../botAdapter";
import { faqMenuKeyboard, appWebAppKeyboard } from "../keyboards";
import { on } from "../router";

on("help", async (c, event, bot) => {
	await bot.answerCallback(c.callbackId);

	const user = await c.ctx.runQuery(internal.users.getUserByTelegramChatId, {
		telegramChatId: c.chatId,
	});

	if (!user) {
		return;
	}

	switch (event.action) {
		case "balance": {
			await bot.sendMessage(c.chatId, `💰 You have ${user.coins} coins.`);
			break;
		}
		case "faq": {
			await bot.sendMessage(
				c.chatId,
				"Choose a FAQ question below",
				faqMenuKeyboard(),
			);
			break;
		}
		case "app": {
			await bot.sendMessage(
				c.chatId,
				"📱 <b>My Account</b>\n\nView your balance, transactions, and voucher availability.",
				appWebAppKeyboard(),
			);
			break;
		}
		case "upload": {
			await bot.sendMessage(
				c.chatId,
				"📸 To upload a voucher, simply send a screenshot of your voucher. Make sure the screenshot shows the barcode clearly.",
			);
			break;
		}
		case "claim": {
			await bot.sendMessage(
				c.chatId,
				"💳 To claim a voucher, send <b>5</b>, <b>10</b>, or <b>20</b> depending on the voucher value you want.",
			);
			break;
		}
		case "donate": {
			await bot.sendMessage(
				c.chatId,
				"☕ <b>Support Open Vouchers</b>\n\nThe service is free, but servers and AI-powered OCR aren't. Your support helps keep the lights on!\n\nhttps://buymeacoffee.com/openvouchers",
			);
			break;
		}
		case "share": {
			await bot.sendMessage(
				c.chatId,
				"🔗 Swap and share Dunnes Stores vouchers:\nhttps://openvouchers.org/telegram\n\nNew users get a <b>10-coin welcome bonus</b>!",
			);
			break;
		}
		// "balance" is handled above, remaining cases have no action:
		default:
			break;
	}
});
