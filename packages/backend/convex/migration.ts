import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";

/**
 * Broadcast a migration message to all users using the OLD bot token.
 * This ensures users know where to go before we switch the server to the new token.
 */
export const broadcastMigrationMessage = internalAction({
  args: {
    oldBotToken: v.string(),
    newBotLink: v.string(),
    dryRun: v.boolean(),
  },
  handler: async (ctx, { oldBotToken, newBotLink, dryRun }) => {
    console.log(`Starting migration broadcast... DryRun: ${dryRun}`);

    // 1. Get all users
    const users: Doc<"users">[] = await ctx.runQuery(internal.users.getAllUsers);

    let successCount = 0;
    let failCount = 0;

    const message = `🚀 <b>We are moving!</b>\n\nPlease use our new and bot here:\n${newBotLink}\n\nThis bot will stop working soon. See you there! 👋`;

    for (const user of users) {
      if (!user.telegramChatId) continue;

      console.log(`Processing user ${user.username || user._id} (${user.telegramChatId})...`);

      if (!dryRun) {
        try {
          await sendMigrationMessage(oldBotToken, user.telegramChatId, message);
          successCount++;
        } catch (e) {
          console.error(`Failed to message ${user.telegramChatId}:`, e);
          failCount++;
        }
        // Small delay to avoid hitting Telegram rate limits too hard
        await new Promise(resolve => setTimeout(resolve, 50));
      } else {
        successCount++;
      }
    }

    return {
      total: users.length,
      success: successCount,
      failed: failCount,
      message: dryRun ? "Dry run complete" : "Broadcast complete"
    };
  },
});

async function sendMigrationMessage(token: string, chatId: string, text: string) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });

  if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram API Error: ${errorText}`);
  }
}
