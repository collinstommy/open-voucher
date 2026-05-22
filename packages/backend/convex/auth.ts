import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { USER_SESSION_DURATION_MS, USER_SESSION_CLEANUP_BATCH_SIZE } from "./constants";

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

		// Clean up existing sessions for this user before creating a new one
		const existingSessions = await ctx.db
			.query("userSessions")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect();
		for (const session of existingSessions) {
			await ctx.db.delete(session._id);
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

/**
 * Atomic mutation: look up user by telegramChatId and create a session in one call.
 * Used by the HTTP action for Telegram Mini App auth to avoid
 * non-atomic runQuery + runMutation.
 */
export const createSessionForTelegramUser = internalMutation({
	args: { telegramChatId: v.string() },
	handler: async (ctx, { telegramChatId }) => {
		const user = await ctx.db
			.query("users")
			.withIndex("by_chat_id", (q) =>
				q.eq("telegramChatId", telegramChatId),
			)
			.first();

		if (!user) {
			return null;
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

export const cleanupExpiredUserSessions = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		let deletedCount = 0;

		// Process in batches to avoid hitting document limits
		while (true) {
			const expired = await ctx.db
				.query("userSessions")
				.withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
				.take(USER_SESSION_CLEANUP_BATCH_SIZE);

			if (expired.length === 0) break;

			for (const session of expired) {
				await ctx.db.delete(session._id);
			}
			deletedCount += expired.length;

			if (expired.length < USER_SESSION_CLEANUP_BATCH_SIZE) break;
		}

		return { deletedCount };
	},
});
