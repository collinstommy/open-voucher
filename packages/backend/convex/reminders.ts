import dayjs from "dayjs";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalQuery } from "./_generated/server";

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

		for (const chatId of telegramChatIds) {
			await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
				chatId,
				text: `🛒 You saved on your shopping yesterday!\n\nUpload your new vouchers today to ensure no vouchers go to waste.`,
			});
		}
	},
});

/**
 * Query users who claimed at least one voucher yesterday and have not uploaded
 * since the start of yesterday. Returns deduplicated telegram chat IDs.
 */
export const getUsersWhoClaimedYesterday = internalQuery({
	args: {},
	handler: async (ctx) => {
		const startOfYesterday = dayjs()
			.subtract(1, "day")
			.startOf("day")
			.valueOf();
		const startOfToday = dayjs().startOf("day").valueOf();
		const startOfTomorrow = dayjs().add(1, "day").startOf("day").valueOf();

		const vouchers = await ctx.db
			.query("vouchers")
			.withIndex("by_claimed_at", (q) =>
				q.gte("claimedAt", startOfYesterday).lt("claimedAt", startOfToday),
			)
			.collect();

		const claimerIds = [
			...new Set(
				vouchers
					.map((v) => v.claimerId)
					.filter((id): id is Id<"users"> => id !== undefined),
			),
		];

		const claimerIdsNeedingReminder: Id<"users">[] = [];
		for (const claimerId of claimerIds) {
			const recentUpload = await ctx.db
				.query("vouchers")
				.withIndex("by_uploader_created", (q) =>
					q.eq("uploaderId", claimerId).gte("createdAt", startOfYesterday),
				)
				.first();

			const uploadedYesterdayOrToday =
				recentUpload !== null && recentUpload.createdAt < startOfTomorrow;

			if (!uploadedYesterdayOrToday) {
				claimerIdsNeedingReminder.push(claimerId);
			}
		}

		const chatIds = (
			await Promise.all(claimerIdsNeedingReminder.map((id) => ctx.db.get(id)))
		)
			.filter((user) => user !== null)
			.map((user) => user.telegramChatId);

		return chatIds;
	},
});
