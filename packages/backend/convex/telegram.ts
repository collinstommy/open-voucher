import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/**
 * Handle incoming Telegram message.
 */
export const handleTelegramMessage = internalAction({
  args: {
    message: v.any(),
  },
  handler: async (ctx, { message }) => {
    const chatId = String(message.chat.id);
    const messageId = message.message_id;
    const text = message.text || message.caption || "";
    const username = message.from.username;
    const firstName = message.from.first_name;
    const isImage = !!message.photo;

    // 1. Idempotency Check & Storage
    // Store message immediately. If it exists, this returns null.
    // For now, we ignore images content, just storing the fact that it was an image
    const messageDbId = await ctx.runMutation(internal.users.storeMessage, {
      telegramMessageId: messageId,
      telegramChatId: chatId,
      direction: "inbound",
      messageType: isImage ? "image" : "text",
      text: text,
      imageStorageId: undefined, // Ignoring image storage for this step
    });

    if (!messageDbId) {
      console.log(`Duplicate message ${messageId} from ${chatId}, ignoring.`);
      return;
    }

    // 2. Get User
    // Note: We are using the 'users' file now, so it's api.users...
    const user = await ctx.runQuery(api.users.getUserByTelegramChatId, {
      telegramChatId: chatId,
    });

    // 3. Handle New User (Invite Code)
    if (!user) {
      if(text.startsWith('/start')){
        await sendTelegramMessage(chatId, "👋 Welcome! You need an invite code to join. Respond with 'code YOUR_INVITE_CODE_HERE' ");
        return;
      }

      if (text.startsWith("code") || text.startsWith("Code")) {
        const parts = text.split(" ");
        const code = parts.length > 1 ? parts[1] : null;

        if (code) {
           const result = await ctx.runMutation(internal.users.validateAndUseInviteCode, { code });

           if (result.valid) {
             const newUser = await ctx.runMutation(internal.users.createUserWithInvite, {
               telegramChatId: chatId,
               username,
               firstName,
               inviteCode: code
             });
             await sendTelegramMessage(chatId, `Welcome to the Dunnes Voucher Bot. You can request Dunnes vouchers and upload unused vouchers
You will earn coins when you upload a Voucher.
When you upload a voucher, you get coins
When you request a voucher, you spend coins
€5 voucher → 15 coins
€10 voucher → 10 coins
€20 voucher → 5 coins

📤 <b>Got a voucher to share?</b> Upload a screenshot from the Dunnes app or a receipt photo
🙏 <b>Want a voucher?</b> Reply with just <b>5, 10, or 20</b>
❓ Send <b>help</b> for more info`);
             return;
           } else {
             await sendTelegramMessage(chatId, `❌ ${result.reason}`);
             return;
           }
        }
      }
      await sendTelegramMessage(chatId, "👋 Welcome! You need an invite code to join. Respond with 'code YOUR_INVITE_CODE_HERE' ");
      return;
    }

    if (user.isBanned) {
      return;
    }

    // 4. Temporary: Reply to confirm storage
    if (text) {
        await sendTelegramMessage(chatId, `Received and stored: "${text}"`);
    } else if (isImage) {
        await sendTelegramMessage(chatId, "Received image (storage pending implementation).");
    }
  },
});

async function sendTelegramMessage(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
      console.error("TELEGRAM_BOT_TOKEN is not set");
      return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML"  }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to send Telegram message:", errorText);
    }
  } catch (error) {
      console.error("Network error sending Telegram message:", error);
  }
}
