import { internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { UPLOAD_REWARDS } from "../../lib/constants";
import { on } from "../router";

on("uploader_admitted", async (c, event, bot) => {
	await bot.answerCallback(c.callbackId);

	await bot.editMessageText(c.chatId, c.messageId, c.messageText, {
		isPhoto: c.isPhotoMessage,
	});

	const voucher = await c.ctx.runQuery(
		internal.vouchers.getVoucherForUploaderConfirm,
		{
			voucherId: event.voucherId as Id<"vouchers">,
		},
	);

	if (!voucher) {
		await bot.sendMessage(c.chatId, "Voucher not found.");
		return;
	}

	const uploader = await c.ctx.runQuery(internal.users.getUserById, {
		userId: voucher.uploaderId,
	});
	if (!uploader || uploader.telegramChatId !== c.telegramUserId) {
		return;
	}

	const reward = UPLOAD_REWARDS[voucher.type];

	await c.ctx.runMutation(internal.vouchers.confirmUploaderUsedVoucher, {
		uploaderId: voucher.uploaderId,
		voucherId: voucher._id,
		amount: reward,
	});

	await bot.sendMessage(
		c.chatId,
		"Thanks for letting us know. We've updated your coin balance",
	);
});

on("uploader_denied", async (c, event, bot) => {
	await bot.answerCallback(c.callbackId);

	await bot.editMessageText(c.chatId, c.messageId, c.messageText, {
		isPhoto: c.isPhotoMessage,
	});

	const uploadedVoucher = await c.ctx.runQuery(
		internal.vouchers.getVoucherForUploaderConfirm,
		{
			voucherId: event.voucherId as Id<"vouchers">,
		},
	);

	if (!uploadedVoucher) {
		return;
	}

	const uploader = await c.ctx.runQuery(internal.users.getUserById, {
		userId: uploadedVoucher.uploaderId,
	});
	if (!uploader || uploader.telegramChatId !== c.telegramUserId) {
		return;
	}

	await c.ctx.runMutation(internal.vouchers.recordUploaderDenied, {
		uploaderId: uploadedVoucher.uploaderId,
		voucherId: uploadedVoucher._id,
	});

	await bot.sendMessage(
		c.chatId,
		"Thanks for the info. We've recorded this in the system",
	);
});
