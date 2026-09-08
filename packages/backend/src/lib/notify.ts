// Delivery gate for interactive action feedback. Call sites always notify;
// this helper routes (or silences) based on the request-scoped client.
// Telegram Bot API messages fire only when the action ran on the bot and
// the account has a chatId. App clients (android/ios/web) observe Convex
// queries for the same outcome — including linked accounts that also have
// telegramChatId.

import { internal } from "../../convex/_generated/api";
import type { ActionCtx, MutationCtx } from "../../convex/_generated/server";
import type { Client } from "./client";
import { deliversViaTelegram } from "./client";

export async function notifyUser(
	ctx: MutationCtx | ActionCtx,
	user: { telegramChatId?: string },
	text: string,
	client: Client,
): Promise<void> {
	if (!deliversViaTelegram(client) || user.telegramChatId === undefined) {
		return;
	}
	await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
		chatId: user.telegramChatId,
		text,
	});
}
