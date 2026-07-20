import { v } from "convex/values";
import {
	buildAnalyticsEventCounts,
	enrichUnknownMessages,
	filterBySince,
	isInboundUserMessage,
	loadInboundMessages,
	resolveMessageIntent,
} from "./lib/messageAnalytics";
import { classifiedIntentValidator } from "./lib/messageIntent";
import { internalMutation, internalQuery } from "./_generated/server";

export const getMessageById = internalQuery({
	args: {
		messageId: v.id("messages"),
	},
	handler: async (ctx, { messageId }) => {
		return await ctx.db.get(messageId);
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
