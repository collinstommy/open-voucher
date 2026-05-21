import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const USER_SESSION_DURATION_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

export const createUserSession = internalMutation({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		const token = crypto.randomUUID();
		const now = Date.now();
		await ctx.db.insert("userSessions", {
			token,
			userId,
			createdAt: now,
			expiresAt: now + USER_SESSION_DURATION_MS,
		});
		return { token, expiresAt: now + USER_SESSION_DURATION_MS };
	},
});

export const getUserByTelegramChatId = internalQuery({
	args: { telegramChatId: v.string() },
	handler: async (ctx, { telegramChatId }) => {
		return await ctx.db
			.query("users")
			.withIndex("by_chat_id", (q) =>
				q.eq("telegramChatId", telegramChatId),
			)
			.first();
	},
});
