// Notification fan-out for the optional-chatId world: users created via
// Google sign-in have no telegramChatId and must never be sent Bot API
// messages. Linked users get the Telegram send and no outbox row; chatless
// users get a notificationOutbox row instead, so no notification is lost.

import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { ActionCtx, MutationCtx } from "../../convex/_generated/server";
import type { OutboxKind, OutboxPayload } from "./outbox";

type NotifyUser = { _id: Id<"users">; telegramChatId?: string };

type OutboxRow = {
	userId: Id<"users">;
	kind: OutboxKind;
	payload: OutboxPayload;
};

function buildOutboxRow(
	user: NotifyUser,
	text: string,
	opts?: { kind?: OutboxKind; payload?: OutboxPayload },
): OutboxRow {
	// payload defaults to { text }: pass an explicit payload only when the
	// row needs machine-readable data (e.g. voucherId for deep-linking).
	// The bare-kind default exists for one-line fire-and-forget notifies.
	return {
		userId: user._id,
		kind: opts?.kind ?? "generic",
		payload: opts?.payload ?? { text },
	};
}

async function scheduleTelegramSend(
	ctx: MutationCtx | ActionCtx,
	chatId: string,
	text: string,
): Promise<void> {
	await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
		chatId,
		text,
	});
}

/** Mutation context: Telegram schedule for linked users, direct insert otherwise. */
export async function notifyUser(
	ctx: MutationCtx,
	user: NotifyUser,
	text: string,
	opts?: { kind?: OutboxKind; payload?: OutboxPayload },
): Promise<void> {
	if (user.telegramChatId !== undefined) {
		await scheduleTelegramSend(ctx, user.telegramChatId, text);
		return;
	}
	await ctx.db.insert("notificationOutbox", buildOutboxRow(user, text, opts));
}

/**
 * Action context: actions have no ctx.db, so the outbox write goes through
 * the insertOutboxRow mutation. Same routing as notifyUser otherwise.
 */
export async function notifyUserFromAction(
	ctx: ActionCtx,
	user: NotifyUser,
	text: string,
	opts?: { kind?: OutboxKind; payload?: OutboxPayload },
): Promise<void> {
	if (user.telegramChatId !== undefined) {
		await scheduleTelegramSend(ctx, user.telegramChatId, text);
		return;
	}
	await ctx.runMutation(
		internal.notifications.insertOutboxRow,
		buildOutboxRow(user, text, opts),
	);
}
