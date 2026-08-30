import { v } from "convex/values";
import {
	internalMutation,
	internalQuery,
	mutation,
	query,
	type MutationCtx,
	type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
	customMutation,
	customQuery,
} from "convex-helpers/server/customFunctions";
import type { GoogleClaims } from "../src/lib/googleAuth";
import {
	findGoogleIdentity,
	getGoogleIdentityForUser,
	resolveGoogleUser,
	unlinkGoogleIdentity,
} from "../src/lib/authIdentities";
import {
	createBotToAppCode,
	redeemBotToAppCode,
	type RedeemConflict,
} from "../src/lib/linkCodes";
import {
	GOOGLE_AUTH_RATE_LIMIT,
	GOOGLE_AUTH_RATE_WINDOW_MS,
	consumeRateLimit,
} from "../src/lib/rateLimit";

export async function getCurrentUserId(
	ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new Error("Unauthorized: not authenticated");
	}
	return identity.subject as Id<"users">;
}

/**
 * The user shape returned by the auth endpoints. telegramChatId is null (not
 * absent) for chatless users so clients can rely on the key existing.
 */
function userAuthResponse(user: Doc<"users">) {
	return {
		_id: user._id,
		telegramChatId: user.telegramChatId,
		firstName: user.firstName,
		username: user.username,
		coins: user.coins,
		isBanned: user.isBanned,
	};
}

export const getUserForTelegramAuth = internalMutation({
	args: { telegramChatId: v.string() },
	handler: async (ctx, { telegramChatId }) => {
		const user = await ctx.db
			.query("users")
			.withIndex("by_chat_id", (q) => q.eq("telegramChatId", telegramChatId))
			.first();

		if (!user) return null;

		return userAuthResponse(user);
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

		return userAuthResponse(user);
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

// --- Google auth (POST /api/google-auth) and bot /link ---

export type GoogleAuthUser = ReturnType<typeof userAuthResponse>;

export type ResolveGoogleResult =
	| { status: "found"; user: GoogleAuthUser }
	| { status: "created"; user: GoogleAuthUser }
	| { status: "unknown" };

/**
 * Resolve a verified Google sub. With allowCreate=false this is lookup-only:
 * an unknown sub returns { status: "unknown" } and nothing is written (the
 * choice-screen contract). Creation happens only on the explicit re-POST.
 * Ban behavior is unchanged: the row is returned regardless of isBanned.
 */
export const resolveGoogleIdentity = internalMutation({
	args: {
		sub: v.string(),
		email: v.optional(v.string()),
		name: v.optional(v.string()),
		allowCreate: v.boolean(),
	},
	handler: async (ctx, { sub, email, name, allowCreate }) => {
		const claims: GoogleClaims = {
			sub,
			email,
			emailVerified: false,
			displayName: name,
		};

		if (!allowCreate) {
			const identity = await findGoogleIdentity(ctx, sub);
			if (!identity) {
				return { status: "unknown" as const };
			}
			const user = await ctx.db.get(identity.userId);
			if (!user) {
				throw new Error(
					`authIdentity references missing user ${identity.userId}`,
				);
			}
			return { status: "found" as const, user: userAuthResponse(user) };
		}

		const { userId, created } = await resolveGoogleUser(ctx, claims);
		const user = await ctx.db.get(userId);
		if (!user) {
			throw new Error(`User not found after resolve: ${userId}`);
		}
		return {
			status: created ? ("created" as const) : ("found" as const),
			user: userAuthResponse(user),
		};
	},
});

export type RedeemLinkCodeResult =
	| {
			ok: true;
			idempotent: boolean;
			merged: boolean;
			warning?: { coinsLost: number; activeVouchers: number };
			user: GoogleAuthUser;
	  }
	| { ok: false; conflict: RedeemConflict };

/**
 * Redeem a bot /link code for a verified Google sub. One transaction inside
 * redeemBotToAppCode: code checks, attempt bump, conflict checks, identity
 * insert or fork merge, usedAt.
 */
export const redeemLinkCode = internalMutation({
	args: {
		code: v.string(),
		sub: v.string(),
		email: v.optional(v.string()),
		name: v.optional(v.string()),
	},
	handler: async (ctx, { code, sub, email, name }) => {
		const result = await redeemBotToAppCode(ctx, {
			code,
			claims: { sub, email, emailVerified: false, displayName: name },
		});
		if (!result.ok) {
			return { ok: false as const, conflict: result.conflict };
		}
		const user = await ctx.db.get(result.success.userId);
		if (!user) {
			throw new Error(`User not found after redeem: ${result.success.userId}`);
		}
		return {
			ok: true as const,
			idempotent: result.success.idempotent,
			merged: result.success.merged,
			warning: result.success.warning,
			user: userAuthResponse(user),
		};
	},
});

/**
 * Rate-limit consume for /api/google-auth, keyed per verified Google sub.
 * Runs after token verification so only verified subs consume budget.
 */
export const checkGoogleAuthRateLimit = internalMutation({
	args: { sub: v.string() },
	handler: async (ctx, { sub }) => {
		return await consumeRateLimit(ctx, {
			key: `google-auth:sub:${sub}`,
			limit: GOOGLE_AUTH_RATE_LIMIT,
			windowMs: GOOGLE_AUTH_RATE_WINDOW_MS,
		});
	},
});

/** Whether the user already holds a google identity (bot /link guard). */
export const hasGoogleIdentity = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		return (await getGoogleIdentityForUser(ctx, userId)) !== null;
	},
});

/**
 * Persist a bot-issued link code. The code is generated in the calling action
 * (crypto.getRandomValues is unavailable in the mutation runtime); collisions
 * are near-impossible but retried by the caller on ok: false.
 */
export const createLinkCode = internalMutation({
	args: { userId: v.id("users"), code: v.string() },
	handler: async (ctx, { userId, code }) => {
		return await createBotToAppCode(ctx, { userId, code });
	},
});

/** Unlink the caller's google identity (app, authenticated via JWT). */
export const unlinkGoogle = userMutation({
	args: {},
	handler: async (ctx, { userId }) => {
		return await unlinkGoogleIdentity(ctx, { userId });
	},
});
