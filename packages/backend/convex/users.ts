import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { SIGNUP_BONUS } from "./constants";

/**
 * Create a new user.
 * Internal mutation.
 */
export const createUser = internalMutation({
	args: {
		telegramChatId: v.string(),
		username: v.optional(v.string()),
		firstName: v.optional(v.string()),
	},
	handler: async (ctx, { telegramChatId, username, firstName }) => {
		const existing = await ctx.db
			.query("users")
			.withIndex("by_chat_id", (q) => q.eq("telegramChatId", telegramChatId))
			.first();

		if (existing) {
			return {
				_id: existing._id,
				coins: existing.coins,
				isBanned: existing.isBanned,
			};
		}

		const now = Date.now();
		const userId = await ctx.db.insert("users", {
			telegramChatId,
			username,
			firstName,
			coins: SIGNUP_BONUS,
			isBanned: false,
			createdAt: now,
			lastActiveAt: now,
		});

		await ctx.db.insert("transactions", {
			userId,
			type: "signup_bonus",
			amount: SIGNUP_BONUS,
			createdAt: now,
		});

		return {
			_id: userId,
			coins: SIGNUP_BONUS,
			isBanned: false,
		};
	},
});

/**
 * Get user by Telegram Chat ID.
 */
export const getUserByTelegramChatId = internalQuery({
	args: { telegramChatId: v.string() },
	handler: async (ctx, { telegramChatId }) => {
		return await ctx.db
			.query("users")
			.withIndex("by_chat_id", (q) => q.eq("telegramChatId", telegramChatId))
			.first();
	},
});

/**
 * Get user by ID.
 */
export const getUserById = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		return await ctx.db.get(userId);
	},
});

/**
 * Get all users.
 * Internal query.
 */
export const getAllUsers = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("users").collect();
	},
});

export const storeMessage = internalMutation({
	args: {
		telegramMessageId: v.number(),
		telegramChatId: v.string(),
		direction: v.union(v.literal("inbound"), v.literal("outbound")),
		messageType: v.union(v.literal("text"), v.literal("image")),
		text: v.optional(v.string()),
		mediaGroupId: v.optional(v.string()),
		imageStorageId: v.optional(v.id("_storage")),
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("messages", {
			...args,
			isAdminMessage: false, // User messages are not admin messages
			createdAt: Date.now(),
		});
	},
});

export const patchMessageImage = internalMutation({
	args: {
		messageId: v.id("messages"),
		imageStorageId: v.id("_storage"),
	},
	handler: async (ctx, { messageId, imageStorageId }) => {
		await ctx.db.patch(messageId, { imageStorageId });
	},
});

export const submitFeedback = internalMutation({
	args: {
		userId: v.id("users"),
		text: v.string(),
		type: v.optional(v.string()),
	},
	handler: async (ctx, { userId, text, type }) => {
		await ctx.db.insert("feedback", {
			userId,
			text,
			status: "new",
			type: type || "feedback",
			createdAt: Date.now(),
		});
	},
});

export const setUserTelegramState = internalMutation({
	args: {
		userId: v.id("users"),
		state: v.optional(
			v.union(
				v.literal("waiting_for_support_message"),
				v.literal("waiting_for_feedback_message"),
				v.literal("waiting_for_ban_appeal"),
				v.literal("onboarding_tutorial"),
			),
		),
	},
	handler: async (ctx, { userId, state }) => {
		await ctx.db.patch(userId, { telegramState: state });
	},
});

export const clearUserTelegramState = internalMutation({
	args: {
		userId: v.id("users"),
	},
	handler: async (ctx, { userId }) => {
		await ctx.db.patch(userId, { telegramState: undefined });
	},
});

export const setUserOnboardingStep = internalMutation({
	args: {
		userId: v.id("users"),
		step: v.number(),
	},
	handler: async (ctx, { userId, step }) => {
		await ctx.db.patch(userId, {
			telegramState: "onboarding_tutorial",
			onboardingStep: step,
		});
	},
});

export const clearOnboardingTutorial = internalMutation({
	args: {
		userId: v.id("users"),
	},
	handler: async (ctx, { userId }) => {
		await ctx.db.patch(userId, {
			telegramState: undefined,
			onboardingStep: undefined,
		});
	},
});
