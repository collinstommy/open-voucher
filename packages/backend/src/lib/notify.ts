// Telegram notification guard for the optional-chatId world: users created via
// Google sign-in have no telegramChatId and must never be sent Bot API
// messages. Call sites schedule through this helper instead of checking the
// chatId themselves; chatless users get a notificationOutbox row instead, so
// no notification is ever silently lost (stage 4 decoupling proof). Linked
// users get the Telegram send and no outbox row.

import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { ActionCtx, MutationCtx } from "../../convex/_generated/server";
import type { OutboxKind, OutboxPayload } from "./outbox";

export async function notifyUser(
	ctx: MutationCtx | ActionCtx,
	user: { _id: Id<"users">; telegramChatId?: string },
	text: string,
	opts?: { kind?: OutboxKind; payload?: OutboxPayload },
): Promise<void> {
	if (user.telegramChatId !== undefined) {
		await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
			chatId: user.telegramChatId,
			text,
		});
		return;
	}
	const row = {
		userId: user._id,
		kind: opts?.kind ?? ("generic" as const),
		payload: opts?.payload ?? { text },
	};
	if ("db" in ctx) {
		await ctx.db.insert("notificationOutbox", row);
		return;
	}
	await ctx.runMutation(internal.notifications.insertOutboxRow, row);
}
