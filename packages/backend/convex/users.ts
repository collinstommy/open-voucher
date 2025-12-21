import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { SIGNUP_BONUS } from "./constants";

/**
 * Generate a short random code (6 chars, alphanumeric uppercase).
 */
function generateShortCode(): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let code = "";
	for (let i = 0; i < 6; i++) {
		code += chars[Math.floor(Math.random() * chars.length)];
	}
	return code;
}

/**
 * Create a new invite code.
 */
export const createInviteCode = internalMutation({
	args: {
		code: v.optional(v.string()),
		label: v.optional(v.string()),
		maxUses: v.optional(v.number()),
		expiresInDays: v.optional(v.number()),
	},
	handler: async (ctx, { code, label, maxUses = 50, expiresInDays }) => {
		const finalCode = code?.toUpperCase() || generateShortCode();

		const existing = await ctx.db
			.query("inviteCodes")
			.withIndex("by_code", (q) => q.eq("code", finalCode))
			.first();

		if (existing) {
			throw new Error(`Code "${finalCode}" already exists`);
		}

		const now = Date.now();
		const expiresAt = expiresInDays
			? now + expiresInDays * 24 * 60 * 60 * 1000
			: undefined;

		await ctx.db.insert("inviteCodes", {
			code: finalCode,
			label,
			maxUses,
			usedCount: 0,
			expiresAt,
			createdAt: now,
		});

		const tgLink = `https://t.me/DunnesVoucherBot?start=${finalCode}`;

		return { code: finalCode, tgLink };
	},
});

/**
 * Validate an invite code and increment usage if valid.
 * Internal mutation.
 */
export const validateAndUseInviteCode = internalMutation({
	args: { code: v.string() },
	handler: async (ctx, { code }) => {
		const inviteCode = await ctx.db
			.query("inviteCodes")
			.withIndex("by_code", (q) => q.eq("code", code.toUpperCase()))
			.first();

		if (!inviteCode) {
			return { valid: false, reason: "Invalid invite code" };
		}

		if (inviteCode.usedCount >= inviteCode.maxUses) {
			return { valid: false, reason: "This invite code has reached its limit" };
		}

		if (inviteCode.expiresAt && inviteCode.expiresAt < Date.now()) {
			return { valid: false, reason: "This invite code has expired" };
		}

		await ctx.db.patch(inviteCode._id, {
			usedCount: inviteCode.usedCount + 1,
		});

		return { valid: true };
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
 * Create a new user with a validated invite code.
 * Internal mutation.
 */
export const getAllUsers = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("users").collect();
	},
});

export const createUserWithInvite = internalMutation({
	args: {
		telegramChatId: v.string(),
		username: v.optional(v.string()),
		firstName: v.optional(v.string()),
		inviteCode: v.string(),
	},
	handler: async (ctx, { telegramChatId, username, firstName, inviteCode }) => {
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
			inviteCode: inviteCode.toUpperCase(),
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
 * Store a new message in the messages table.
 * Returns null if message already exists (deduplication).
 * Internal mutation.
 */
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
			createdAt: Date.now(),
		});
	},
});

/**
 * Update a message with the image storage ID after upload.
 * Internal mutation.
 */
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
	},
	handler: async (ctx, { userId, text }) => {
		await ctx.db.insert("feedback", {
			userId,
			text,
			status: "new",
			createdAt: Date.now(),
		});
	},
});
