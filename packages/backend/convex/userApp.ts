import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

const USER_SESSION_DURATION_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

export const devAuth = mutation({
	args: {},
	handler: async (ctx) => {
		const isDevelopment = process.env.ENVIRONMENT === "development";
		if (!isDevelopment) {
			throw new Error("devAuth is only available in development");
		}

		const telegramChatId = process.env.DEV_TELEGRAM_CHAT_ID;
		if (!telegramChatId) {
			throw new Error("DEV_TELEGRAM_CHAT_ID not configured");
		}

		const user = await ctx.db
			.query("users")
			.withIndex("by_chat_id", (q) =>
				q.eq("telegramChatId", telegramChatId),
			)
			.first();

		if (!user) {
			throw new Error("User not found. Please start the bot first.");
		}

		const token = crypto.randomUUID();
		const now = Date.now();
		const expiresAt = now + USER_SESSION_DURATION_MS;
		await ctx.db.insert("userSessions", {
			token,
			userId: user._id,
			createdAt: now,
			expiresAt,
		});

		return {
			user: {
				_id: user._id,
				telegramChatId: user.telegramChatId,
				firstName: user.firstName,
				username: user.username,
				coins: user.coins,
				isBanned: user.isBanned,
			},
			sessionToken: token,
			expiresAt,
		};
	},
});

export const validateSession = query({
	args: { sessionToken: v.string() },
	handler: async (ctx, { sessionToken }) => {
		const session = await ctx.db
			.query("userSessions")
			.withIndex("by_token", (q) => q.eq("token", sessionToken))
			.first();

		if (!session) return null;
		if (session.expiresAt < Date.now()) return null;

		const user = await ctx.db.get(session.userId);
		if (!user) return null;

		return {
			_id: user._id,
			telegramChatId: user.telegramChatId,
			firstName: user.firstName,
			username: user.username,
			coins: user.coins,
			isBanned: user.isBanned,
		};
	},
});

export const logoutUser = mutation({
	args: { sessionToken: v.string() },
	handler: async (ctx, { sessionToken }) => {
		const session = await ctx.db
			.query("userSessions")
			.withIndex("by_token", (q) => q.eq("token", sessionToken))
			.first();

		if (session) {
			await ctx.db.delete(session._id);
		}

		return { success: true };
	},
});

export const cleanupExpiredUserSessions = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const expired = await ctx.db
			.query("userSessions")
			.filter((q) => q.lt(q.field("expiresAt"), now))
			.collect();

		for (const session of expired) {
			await ctx.db.delete(session._id);
		}

		return { deletedCount: expired.length };
	},
});
