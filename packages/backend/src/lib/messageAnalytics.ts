import type { Doc } from "../../convex/_generated/dataModel";
import type { QueryCtx } from "../../convex/_generated/server";
import {
	DASHBOARD_INTENTS,
	emptyIntentCounts,
	resolveMessageIntent,
	type MessageIntent,
} from "./messageIntent";

export type InboundMessage = Doc<"messages">;

export function isInboundUserMessage(message: InboundMessage): boolean {
	return message.direction === "inbound" && message.isAdminMessage !== true;
}

export function filterBySince<T extends { createdAt: number }>(
	items: T[],
	since?: number,
): T[] {
	if (since === undefined) {
		return items;
	}
	return items.filter((item) => item.createdAt >= since);
}

export { resolveMessageIntent } from "./messageIntent";

export async function loadInboundMessages(ctx: QueryCtx) {
	const messages = await ctx.db
		.query("messages")
		.withIndex("by_direction", (q) => q.eq("direction", "inbound"))
		.collect();
	return messages.filter(isInboundUserMessage);
}

export function aggregateCounts(messages: InboundMessage[]) {
	const counts = emptyIntentCounts();
	for (const message of messages) {
		const intent = resolveMessageIntent(message);
		counts[intent]++;
	}
	return counts;
}

export async function enrichUnknownMessages(
	ctx: QueryCtx,
	messages: InboundMessage[],
) {
	const unknown = messages
		.filter((m) => resolveMessageIntent(m) === "unknown")
		.sort((a, b) => b.createdAt - a.createdAt);

	return Promise.all(
		unknown.map(async (message) => {
			const user = await ctx.db
				.query("users")
				.withIndex("by_chat_id", (q) =>
					q.eq("telegramChatId", message.telegramChatId),
				)
				.first();

			return {
				_id: message._id,
				text: message.text ?? "",
				telegramChatId: message.telegramChatId,
				createdAt: message.createdAt,
				classifiedIntent: message.classifiedIntent,
				classifiedConfidence: message.classifiedConfidence,
				user: user
					? {
							id: user._id,
							username: user.username,
							firstName: user.firstName,
						}
					: null,
			};
		}),
	);
}

export async function buildMessageAnalytics(
	ctx: QueryCtx,
	since: number | undefined,
) {
	const inbound = filterBySince(await loadInboundMessages(ctx), since);
	const counts = aggregateCounts(inbound);
	const unknownMessages = await enrichUnknownMessages(ctx, inbound);

	const dashboardCounts = Object.fromEntries(
		DASHBOARD_INTENTS.map((intent) => [intent, counts[intent]]),
	) as Record<(typeof DASHBOARD_INTENTS)[number], number>;

	return {
		dashboardCounts,
		unknownCount: counts.unknown,
		totalInbound: inbound.length,
		unknownMessages,
	};
}

export async function buildAnalyticsEventCounts(
	ctx: QueryCtx,
	since: number | undefined,
) {
	const events = await ctx.db.query("analytics").collect();
	const filtered = filterBySince(events, since);
	const counts: Record<string, number> = {};
	for (const event of filtered) {
		counts[event.action] = (counts[event.action] ?? 0) + 1;
	}
	return { counts, total: filtered.length };
}
