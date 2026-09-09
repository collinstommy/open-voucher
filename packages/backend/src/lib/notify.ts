import { internal } from "../../convex/_generated/api";
import type { ActionCtx, MutationCtx } from "../../convex/_generated/server";

export async function notifyUser(
	ctx: MutationCtx | ActionCtx,
	user: { telegramChatId?: string },
	text: string,
): Promise<void> {
	if (user.telegramChatId === undefined) {
		return;
	}
	await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
		chatId: user.telegramChatId,
		text,
	});
}
