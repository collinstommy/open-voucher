import { v } from "convex/values";
import {
	buildAnalyticsEventCounts,
	enrichUnknownMessages,
	filterBySince,
	isInboundUserMessage,
	loadInboundMessages,
	resolveMessageIntent,
} from "../src/lib/messageAnalytics";
import { classifiedIntentValidator } from "../src/lib/intentClassifier";
import { internal } from "./_generated/api";
import { adminMutation } from "./adminGuards";
import { internalMutation, internalQuery } from "./_generated/server";

export const getMessageById = internalQuery({
	args: {
		messageId: v.id("messages"),
	},
	handler: async (ctx, { messageId }) => {
		return await ctx.db.get(messageId);
	},
});

/**
 * Recent inbound user messages with non-empty text, newest first.
 * Used by the classifier probe to test the current classifier against
 * real production traffic. `limit` caps how many messages are returned.
 */
export const getRecentInboundMessages = internalQuery({
	args: {
		limit: v.number(),
	},
	handler: async (ctx, { limit }) => {
		const capped = Math.max(0, Math.min(Math.floor(limit), 500));
		if (capped === 0) return { messages: [] };

		const inbound = await ctx.db
			.query("messages")
			.withIndex("by_direction", (q) => q.eq("direction", "inbound"))
			.collect();

		const messages = inbound
			.filter(isInboundUserMessage)
			.filter((m) => (m.text ?? "").trim().length > 0)
			.sort((a, b) => b.createdAt - a.createdAt)
			.slice(0, capped)
			.map((m) => ({
				text: m.text ?? "",
				previousIntent: m.classifiedIntent ?? null,
				previousConfidence: m.classifiedConfidence ?? null,
				createdAt: m.createdAt,
			}));

		return { messages };
	},
});

export const getUnknownInboundMessages = internalQuery({
	args: {
		since: v.optional(v.number()),
	},
	handler: async (ctx, { since }) => {
		const inbound = filterBySince(await loadInboundMessages(ctx), since);
		const messages = await enrichUnknownMessages(ctx, inbound);
		return { messages };
	},
});

export const backfillMessageIntents = internalMutation({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, { limit }) => {
		const batchLimit = limit ?? 500;
		const allMessages = await ctx.db.query("messages").collect();
		const toBackfill = allMessages
			.filter(
				(message) =>
					isInboundUserMessage(message) && message.intent === undefined,
			)
			.slice(0, batchLimit);

		let updated = 0;
		for (const message of toBackfill) {
			const intent = resolveMessageIntent(message);
			await ctx.db.patch(message._id, { intent });
			updated++;
		}

		const remaining = allMessages.filter(
			(message) =>
				isInboundUserMessage(message) && message.intent === undefined,
		).length;

		return { updated, remaining: remaining - updated };
	},
});

export const recordClassification = internalMutation({
	args: {
		messageId: v.id("messages"),
		classifiedIntent: classifiedIntentValidator,
		classifiedConfidence: v.number(),
	},
	handler: async (
		ctx,
		{ messageId, classifiedIntent, classifiedConfidence },
	) => {
		const message = await ctx.db.get(messageId);
		if (!message) throw new Error("Message not found");
		if (message.direction !== "inbound") {
			throw new Error("Only inbound messages can be classified");
		}

		if (message.classifiedIntent) {
			return { success: true, alreadyRecorded: true };
		}

		await ctx.db.patch(messageId, {
			classifiedIntent,
			classifiedConfidence,
		});
		return { success: true, alreadyRecorded: false };
	},
});

export const getAnalyticsEventCounts = internalQuery({
	args: {
		since: v.optional(v.number()),
	},
	handler: async (ctx, { since }) => {
		return await buildAnalyticsEventCounts(ctx, since);
	},
});

export const sendMessageToUser = adminMutation({
	args: {
		token: v.string(),
		userId: v.id("users"),
		messageText: v.string(),
	},
	handler: async (ctx, { userId, messageText }) => {
		const user = await ctx.db.get(userId);
		if (!user) {
			throw new Error("User not found");
		}

		await ctx.db.insert("messages", {
			telegramMessageId: 0,
			telegramChatId: user.telegramChatId,
			direction: "outbound",
			messageType: "text",
			text: messageText,
			isAdminMessage: true,
			createdAt: Date.now(),
		});

		await ctx.scheduler.runAfter(0, internal.telegram.sendAdminMessageAction, {
			chatId: user.telegramChatId,
			text: messageText,
		});

		return { success: true };
	},
});
