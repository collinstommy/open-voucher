import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import {
	isInboundClassification,
	type InboundClassification,
} from "../lib/intentClassifier";
import { classifyMessageText } from "../lib/intentClassifier";
import { replyForClassification } from "./inboundReplies";

async function sendClassifiedReplyForMessage(
	ctx: ActionCtx,
	messageId: Id<"messages">,
): Promise<void> {
	const message = await ctx.runQuery(internal.messages.getMessageById, {
		messageId,
	});
	if (!message || message.direction !== "inbound") return;

	const classifiedIntent = message.classifiedIntent;
	if (!classifiedIntent || !isInboundClassification(classifiedIntent)) return;

	const user = await ctx.runQuery(internal.users.getUserByTelegramChatId, {
		telegramChatId: message.telegramChatId,
	});

	if (classifiedIntent === "balance" && user) {
		await ctx.runAction(internal.telegram.sendMessageAction, {
			chatId: message.telegramChatId,
			text: `💰 You have ${user.coins} coins.`,
		});
		await ctx.runMutation(internal.analytics.recordServerEvent, {
			action: `classified_reply:${classifiedIntent}`,
			userId: user._id,
		});
		return;
	}

	const reply = replyForClassification(classifiedIntent);
	if (!reply) return;

	if (reply.kind === "text") {
		await ctx.runAction(internal.telegram.sendMessageAction, {
			chatId: message.telegramChatId,
			text: reply.text,
		});
	} else {
		await ctx.runAction(internal.telegram.sendWebAppMessageAction, {
			chatId: message.telegramChatId,
			text: reply.text,
			webAppUrl: reply.webAppUrl,
			buttonText: reply.buttonText,
		});
	}

	await ctx.runMutation(internal.analytics.recordServerEvent, {
		action: `classified_reply:${classifiedIntent}`,
		userId: user?._id,
	});
}

export const classifyUnknownMessage = internalAction({
	args: {
		messageId: v.id("messages"),
	},
	handler: async (ctx, { messageId }) => {
		const message = await ctx.runQuery(internal.messages.getMessageById, {
			messageId,
		});
		if (!message || message.direction !== "inbound") return;

		const existingIntent = message.classifiedIntent;
		if (existingIntent && isInboundClassification(existingIntent)) {
			if (
				existingIntent === "balance" ||
				replyForClassification(existingIntent)
			) {
				await sendClassifiedReplyForMessage(ctx, messageId);
			}
			return;
		}

		const userText = message.text ?? "";
		if (!userText.trim()) {
			await ctx.runMutation(internal.messages.recordClassification, {
				messageId,
				classifiedIntent: "unknown",
				classifiedConfidence: 0,
			});
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

		const recordResult = await ctx.runMutation(
			internal.messages.recordClassification,
			{
				messageId,
				classifiedIntent: intent,
				classifiedConfidence: confidence,
			},
		);

		if (recordResult.alreadyRecorded) {
			return;
		}

		if (replyForClassification(intent) || intent === "balance") {
			await sendClassifiedReplyForMessage(ctx, messageId);
		}
	},
});

export const sendClassifiedReply = internalAction({
	args: {
		messageId: v.id("messages"),
	},
	handler: async (ctx, { messageId }) => {
		await sendClassifiedReplyForMessage(ctx, messageId);
	},
});
