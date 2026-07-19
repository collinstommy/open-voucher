import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { isClassifiedIntent, type InboundClassification } from "../lib/messageIntent";
import { classifyMessageText } from "../lib/intentClassifier";
import { replyForClassification } from "./inboundReplies";

export const classifyUnknownMessage = internalAction({
	args: {
		messageId: v.id("messages"),
	},
	handler: async (ctx, { messageId }) => {
		const message = await ctx.runQuery(internal.messages.getMessageById, {
			messageId,
		});

		// Already classified (e.g. retry) — reply only if the label is actionable.
		const existingIntent = message?.classifiedIntent;
		if (existingIntent && isClassifiedIntent(existingIntent)) {
			if (replyForClassification(existingIntent)) {
				await ctx.scheduler.runAfter(
					0,
					internal.telegram.classifyUnknown.sendClassifiedReply,
					{
						messageId,
					},
				);
			}
			return;
		}

		const userText = message?.text ?? "";
		if (!userText.trim()) {
			await ctx.scheduler.runAfter(
				0,
				internal.messages.recordClassification,
				{
					messageId,
					classifiedIntent: "unknown",
					classifiedConfidence: 0,
				},
			);
			return;
		}

		const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
		let intent: InboundClassification;
		let confidence: number;

		if (!apiKey) {
			console.error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
			intent = "unknown";
			confidence = 0;
		} else {
			try {
				const result = await classifyMessageText(userText, apiKey);
				intent = result.intent;
				confidence = result.confidence;
			} catch (error) {
				console.error("Failed to classify message:", error);
				intent = "unknown";
				confidence = 0;
			}
		}

		await ctx.scheduler.runAfter(
			0,
			internal.messages.recordClassification,
			{
				messageId,
				classifiedIntent: intent,
				classifiedConfidence: confidence,
			},
		);

		if (replyForClassification(intent)) {
			await ctx.scheduler.runAfter(
				0,
				internal.telegram.classifyUnknown.sendClassifiedReply,
				{
					messageId,
				},
			);
		}
	},
});

export const sendClassifiedReply = internalAction({
	args: {
		messageId: v.id("messages"),
	},
	handler: async (ctx, { messageId }) => {
		const message = await ctx.runQuery(internal.messages.getMessageById, {
			messageId,
		});
		if (!message || message.direction !== "inbound") return;

		const classifiedIntent = message.classifiedIntent;
		if (!classifiedIntent || !isClassifiedIntent(classifiedIntent)) return;

		let reply = replyForClassification(classifiedIntent);
		if (!reply) return;

		const user = await ctx.runQuery(internal.users.getUserByTelegramChatId, {
			telegramChatId: message.telegramChatId,
		});

		if (classifiedIntent === "balance" && user) {
			await ctx.scheduler.runAfter(
				0,
				internal.telegram.sendMessageAction,
				{
					chatId: message.telegramChatId,
					text: `💰 You have ${user.coins} coins.`,
				},
			);
		} else {
			await ctx.scheduler.runAfter(
				0,
				internal.telegram.sendWebAppMessageAction,
				{
					chatId: message.telegramChatId,
					text: reply.text,
					webAppUrl: reply.webAppUrl,
				},
			);
		}

		await ctx.scheduler.runAfter(
			0,
			internal.analytics.recordServerEvent,
			{
				action: `classified_reply:${classifiedIntent}`,
				userId: user?._id,
			},
		);
	},
});
