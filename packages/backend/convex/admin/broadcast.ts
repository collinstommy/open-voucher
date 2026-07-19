import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
	ADMIN_TEST_TELEGRAM_CHAT_ID,
	MAX_BROADCAST_RECIPIENTS,
	resolveBroadcastAudience,
} from "../lib/broadcastAudience";
import { adminMutation, adminQuery } from "./auth";

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 1000;

export const previewBroadcastAudience = adminQuery({
	args: {
		minClaims: v.number(),
		withinDays: v.number(),
	},
	handler: async (ctx, { minClaims, withinDays }) => {
		if (minClaims < 1) {
			throw new Error("minClaims must be at least 1");
		}
		if (withinDays < 1) {
			throw new Error("withinDays must be at least 1");
		}

		const recipients = await resolveBroadcastAudience(
			ctx,
			minClaims,
			withinDays,
		);

		return {
			count: recipients.length,
			sample: recipients.slice(0, 10),
			exceedsLimit: recipients.length > MAX_BROADCAST_RECIPIENTS,
		};
	},
});

export const sendBroadcast = adminMutation({
	args: {
		messageText: v.string(),
		minClaims: v.number(),
		withinDays: v.number(),
		testMode: v.boolean(),
	},
	handler: async (ctx, { messageText, minClaims, withinDays, testMode }) => {
		const trimmedMessage = messageText.trim();
		if (!trimmedMessage) {
			throw new Error("Message cannot be empty");
		}
		if (minClaims < 1) {
			throw new Error("minClaims must be at least 1");
		}
		if (withinDays < 1) {
			throw new Error("withinDays must be at least 1");
		}

		let chatIds: string[];
		let recipientCount: number;

		if (testMode) {
			chatIds = [ADMIN_TEST_TELEGRAM_CHAT_ID];
			recipientCount = 1;
		} else {
			const recipients = await resolveBroadcastAudience(
				ctx,
				minClaims,
				withinDays,
			);
			if (recipients.length === 0) {
				throw new Error("No users match the selected criteria");
			}
			if (recipients.length > MAX_BROADCAST_RECIPIENTS) {
				throw new Error(
					`Audience too large (${recipients.length}). Maximum is ${MAX_BROADCAST_RECIPIENTS}. Narrow your criteria.`,
				);
			}
			chatIds = recipients.map((recipient) => recipient.telegramChatId);
			recipientCount = recipients.length;
		}

		const now = Date.now();
		for (const chatId of chatIds) {
			await ctx.db.insert("messages", {
				telegramMessageId: 0,
				telegramChatId: chatId,
				direction: "outbound",
				messageType: "text",
				text: trimmedMessage,
				isAdminMessage: true,
				createdAt: now,
			});
		}

		await ctx.scheduler.runAfter(0, internal.admin.broadcast.sendBroadcastBatch, {
			chatIds,
			messageText: trimmedMessage,
			startIndex: 0,
		});

		return {
			recipientCount,
			testMode,
		};
	},
});

export const sendBroadcastBatch = internalAction({
	args: {
		chatIds: v.array(v.string()),
		messageText: v.string(),
		startIndex: v.number(),
	},
	handler: async (ctx, { chatIds, messageText, startIndex }) => {
		const batch = chatIds.slice(startIndex, startIndex + BATCH_SIZE);

		for (const chatId of batch) {
			await ctx.runAction(internal.telegram.sendAdminMessageAction, {
				chatId,
				text: messageText,
			});
		}

		const nextIndex = startIndex + BATCH_SIZE;
		if (nextIndex < chatIds.length) {
			await ctx.scheduler.runAfter(
				BATCH_DELAY_MS,
				internal.admin.broadcast.sendBroadcastBatch,
				{
					chatIds,
					messageText,
					startIndex: nextIndex,
				},
			);
		}
	},
});
