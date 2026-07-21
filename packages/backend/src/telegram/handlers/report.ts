import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import { internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BotAdapter } from "../botAdapter";
import { on, reportData } from "../router";

dayjs.extend(advancedFormat);

on("report_init", async (c, event, bot) => {
	await bot.answerCallback(c.callbackId);

	const user = await c.ctx.runQuery(internal.users.getUserByTelegramChatId, {
		telegramChatId: c.telegramUserId,
	});

	if (!user) {
		return;
	}

	if (user.isBanned) {
		await c.ctx.runMutation(internal.users.setUserTelegramState, {
			userId: user._id,
			state: "waiting_for_ban_appeal",
		});
		await bot.sendMessage(
			c.chatId,
			"🚫 Your account has been banned for misuse.\n\nPlease reply with a message describing if you think this is an error.",
		);
		return;
	}

	const existingReport = await c.ctx.runQuery(
		internal.vouchers.checkExistingReport,
		{
			userId: user._id,
			voucherId: event.voucherId as Id<"vouchers">,
		},
	);
	if (existingReport) {
		await bot.sendMessage(
			c.chatId,
			"⚠️ You have already reported this voucher.",
		);
		return;
	}

	await bot.sendMessage(
		c.chatId,
		"⚠️ <b>Report this voucher as not working?</b>\n\nYou can request a replacement voucher if you need one.",
		{
			inline_keyboard: [
				[
					{
						text: "✅ Yes",
						callback_data: reportData("report_confirm", event.voucherId),
					},
				],
				[
					{
						text: "❌ No",
						callback_data: reportData("report_cancel", event.voucherId),
					},
				],
			],
		},
	);
});

on("report_confirm", async (c, event, bot) => {
	await bot.answerCallback(c.callbackId);

	const user = await c.ctx.runQuery(internal.users.getUserByTelegramChatId, {
		telegramChatId: c.telegramUserId,
	});

	if (!user) {
		return;
	}

	const result = await c.ctx.runMutation(internal.vouchers.reportVoucher, {
		userId: user._id,
		voucherId: event.voucherId as Id<"vouchers">,
	});

	if (!result) {
		return;
	}

	await bot.editMessageText(c.chatId, c.messageId, c.messageText);

	if (result.status === "rate_limited") {
		await bot.sendMessage(c.chatId, `⏰ ${result.message}`);
	} else if (result.status === "expired") {
		await bot.sendMessage(c.chatId, `⚠️ ${result.message}`);
	} else if (result.status === "already_reported") {
		await bot.sendMessage(c.chatId, `⚠️ ${result.message}`);
	} else if (result.status === "reported") {
		await bot.sendMessage(
			c.chatId,
			"✅ Report received.\n\nDo you want a replacement voucher?",
			{
				inline_keyboard: [
					[
						{
							text: "✅ Yes, send a replacement",
							callback_data: reportData(
								"report_replacement_yes",
								event.voucherId,
							),
						},
					],
					[
						{
							text: "❌ No thanks",
							callback_data: reportData(
								"report_replacement_no",
								event.voucherId,
							),
						},
					],
				],
			},
		);
	}
});

on("report_replacement_yes", async (c, event, bot) => {
	await bot.answerCallback(c.callbackId);
	await bot.editMessageText(c.chatId, c.messageId, c.messageText);

	const user = await c.ctx.runQuery(internal.users.getUserByTelegramChatId, {
		telegramChatId: c.telegramUserId,
	});
	if (!user) {
		return;
	}

	const result = await c.ctx.runMutation(
		internal.vouchers.requestReplacement,
		{
			userId: user._id,
			originalVoucherId: event.voucherId as Id<"vouchers">,
		},
	);

	if (result.status === "replaced" && result.voucher) {
		await bot.sendPhoto(
			c.chatId,
			result.voucher.imageUrl,
			`🔄 <b>Here is a replacement €${result.voucher.type} voucher.</b>\n\nExpires: ${dayjs(result.voucher.expiryDate).format("MMM Do")}`,
			{
				inline_keyboard: [
					[
						{
							text: "⚠️ Its not working",
							callback_data: reportData(
								"report_init",
								result.voucher._id,
							),
						},
					],
				],
			},
		);
	} else {
		await bot.sendMessage(
			c.chatId,
			"⚠️ No replacement vouchers available. Your coins have been refunded.",
		);
	}
});

on("report_replacement_no", async (c, event, bot) => {
	await bot.answerCallback(c.callbackId);
	await bot.editMessageText(c.chatId, c.messageId, c.messageText);

	const user = await c.ctx.runQuery(internal.users.getUserByTelegramChatId, {
		telegramChatId: c.telegramUserId,
	});
	if (!user) {
		return;
	}

	const refundResult = await c.ctx.runMutation(
		internal.vouchers.refundReportedVoucher,
		{
			userId: user._id,
			voucherId: event.voucherId as Id<"vouchers">,
		},
	);
	if (refundResult.status === "refunded") {
		await bot.sendMessage(
			c.chatId,
			"✅ Your coins have been refunded. Thank you for reporting!",
		);
	} else {
		await bot.sendMessage(
			c.chatId,
			"⚠️ Unable to process refund. Please contact support.",
		);
	}
});

on("report_cancel", async (c, _event, bot) => {
	await bot.answerCallback(c.callbackId);
	await bot.editMessageText(c.chatId, c.messageId, c.messageText);
	await bot.sendMessage(c.chatId, "✅ Cancelled. No action taken.");
});
