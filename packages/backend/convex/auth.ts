import { v } from "convex/values";
import {
	internalMutation,
	mutation,
	query,
	type MutationCtx,
	type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
	customMutation,
	customQuery,
} from "convex-helpers/server/customFunctions";

export async function getCurrentUserId(
	ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new Error("Unauthorized: not authenticated");
	}
	return identity.subject as Id<"users">;
}

export const getUserForTelegramAuth = internalMutation({
	args: { telegramChatId: v.string() },
	handler: async (ctx, { telegramChatId }) => {
		const user = await ctx.db
			.query("users")
			.withIndex("by_chat_id", (q) => q.eq("telegramChatId", telegramChatId))
			.first();

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

export const getUserForDevAuth = internalMutation({
	args: {},
	handler: async (ctx) => {
		const isDevelopment = process.env.ENVIRONMENT === "development";
		if (!isDevelopment) {
			throw new Error("Dev auth is only available in development");
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
			return null;
		}

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

export const userQuery = customQuery(query, {
	args: {},
	input: async (ctx) => {
		const userId = await getCurrentUserId(ctx);
		return { ctx: {}, args: { userId } };
	},
});

export const userMutation = customMutation(mutation, {
	args: {},
	input: async (ctx) => {
		const userId = await getCurrentUserId(ctx);
		return { ctx: {}, args: { userId } };
	},
});
