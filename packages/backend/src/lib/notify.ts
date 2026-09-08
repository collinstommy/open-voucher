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
