import dayjs from "dayjs";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { internalAction, internalQuery } from "./_generated/server";
import {
	TELEGRAM_SEND_BATCH_PAUSE_MS,
	TELEGRAM_SEND_BATCH_SIZE,
	TELEGRAM_SEND_MESSAGE_INTERVAL_MS,
} from "./constants";

const REMINDER_MESSAGE =
	"🛒 You saved on your shopping yesterday!\n\nUpload your new vouchers today to ensure no vouchers go to waste.";

function getStaggeredSendDelayMs(index: number): number {
	const batch = Math.floor(index / TELEGRAM_SEND_BATCH_SIZE);
	const withinBatch = index % TELEGRAM_SEND_BATCH_SIZE;
	const batchDuration =
		(TELEGRAM_SEND_BATCH_SIZE - 1) * TELEGRAM_SEND_MESSAGE_INTERVAL_MS;
	const batchStart = batch * (batchDuration + TELEGRAM_SEND_BATCH_PAUSE_MS);
	return batchStart + withinBatch * TELEGRAM_SEND_MESSAGE_INTERVAL_MS;
}

/**
 * Daily cron job that sends upload reminders to users who claimed vouchers yesterday.
 * Runs at 10am UTC.
 */
export const sendDailyUploadReminders = internalAction({
	args: {},
	handler: async (ctx) => {
		const telegramChatIds = await ctx.runQuery(
			internal.reminders.getUsersWhoClaimedYesterday,
		);

		for (const [index, chatId] of telegramChatIds.entries()) {
			await ctx.scheduler.runAfter(
				getStaggeredSendDelayMs(index),
				internal.telegram.sendMessageAction,
				{
					chatId,
					text: REMINDER_MESSAGE,
				},
			);
		}
	},
});

/**
 * Query users who claimed at least one voucher yesterday.
 * Returns deduplicated list of telegram chat IDs.
 */
export const getUsersWhoClaimedYesterday = internalQuery({
	args: {},
	handler: async (ctx) => {
		const startOfYesterday = dayjs()
			.subtract(1, "day")
			.startOf("day")
			.valueOf();
		const endOfYesterday = dayjs().startOf("day").valueOf();

		const vouchers = await ctx.db
			.query("vouchers")
			.withIndex("by_claimed_at", (q) =>
				q.gte("claimedAt", startOfYesterday).lt("claimedAt", endOfYesterday),
			)
			.collect();

		const claimerIds = [
			...new Set(
				vouchers
					.map((v) => v.claimerId)
					.filter((id): id is Id<"users"> => id !== undefined),
			),
		];

		const chatIds = (await Promise.all(claimerIds.map((id) => ctx.db.get(id))))
			.filter((user) => user !== null)
			.map((user) => user.telegramChatId);

		return [...new Set(chatIds)];
	},
});
