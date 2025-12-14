import dayjs from "dayjs";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { internalAction, internalQuery } from "./_generated/server";

/**
 * Daily cron job that sends upload reminders to users who claimed vouchers yesterday.
 * Runs at 10am UTC.
 */
export const sendDailyUploadReminders = internalAction({
  args: {},
  handler: async (ctx) => {
    // Get users who claimed vouchers yesterday
    const telegramChatIds = await ctx.runQuery(
      internal.reminders.getUsersWhoClaimedYesterday
    );

    // Send reminder to each user
    for (const chatId of telegramChatIds) {
      await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
        chatId,
        text: `🛒 You saved on your shopping yesterday!\n\nUpload your new vouchers today to ensure no vouchers go to waste.`,
      });
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
    // Calculate yesterday's date range
    const startOfYesterday = dayjs().subtract(1, 'day').startOf('day').valueOf();
    const endOfYesterday = dayjs().startOf('day').valueOf();

    // Query vouchers claimed yesterday
    // Uses index to efficiently filter by claimedAt timestamp
    const vouchers = await ctx.db
      .query("vouchers")
      .withIndex("by_claimed_at", (q) =>
        q.gte("claimedAt", startOfYesterday).lt("claimedAt", endOfYesterday)
      )
      .collect();

    const claimerIds = [...new Set(
      vouchers.map((v) => v.claimerId).filter((id): id is Id<"users"> => id !== undefined)
    )];

    // Fetch users and extract their telegram chat IDs
    const chatIds = (
      await Promise.all(claimerIds.map((id) => ctx.db.get(id)))
    )
      .filter((user) => user !== null)
      .map((user) => user.telegramChatId);

    return chatIds;
  },
});
