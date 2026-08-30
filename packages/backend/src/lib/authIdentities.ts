// Identity invariants for authIdentities (Google now, Apple later):
// - at most one identity row per (provider, providerAccountId)
// - at most one google identity per user
// - unlink refuses when it would strand a chatless account
// - fork merge: a chatless Google-only holder is absorbed into the Telegram
//   account that proved ownership via a bot /link code; its signup bonus is
//   clawed back so forking never nets extra coins.
//
// Telegram identity intentionally stays on users.telegramChatId; this table
// never holds "telegram" rows. All functions expect MutationCtx and run inside
// the caller's transaction.

import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../convex/_generated/server";
import { applyCoinDelta } from "./coinLedger";
import { SIGNUP_BONUS } from "./constants";
import type { GoogleClaims } from "./googleAuth";
import { createUserRecord } from "./users";

export type LinkConflict =
	| "google_linked_to_other_user"
	| "user_already_has_google";

/** Voucher statuses that keep a voucher live for its owner or a claimer. */
const ACTIVE_VOUCHER_STATUSES = new Set([
	"processing",
	"available",
	"claimed",
	"reported",
]);

export async function findGoogleIdentity(
	ctx: QueryCtx | MutationCtx,
	sub: string,
): Promise<Doc<"authIdentities"> | null> {
	return await ctx.db
		.query("authIdentities")
		.withIndex("by_provider_account", (q) =>
			q.eq("provider", "google").eq("providerAccountId", sub),
		)
		.first();
}

export async function getGoogleIdentityForUser(
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">,
): Promise<Doc<"authIdentities"> | null> {
	return await ctx.db
		.query("authIdentities")
		.withIndex("by_user_provider", (q) =>
			q.eq("userId", userId).eq("provider", "google"),
		)
		.first();
}

/**
 * Resolve a verified Google sub to a user. Existing identity wins (created:
 * false, ban state passed through unchanged). On a miss, creates a chatless
 * user with the signup bonus and links the identity — only call this when
 * creation is allowed (explicit intent:create, never a bare lookup).
 */
export async function resolveGoogleUser(
	ctx: MutationCtx,
	claims: GoogleClaims,
): Promise<{ userId: Id<"users">; created: boolean; isBanned: boolean }> {
	const existing = await findGoogleIdentity(ctx, claims.sub);
	if (existing) {
		const user = await ctx.db.get(existing.userId);
		if (!user) {
			throw new Error(
				`authIdentity ${existing._id} references missing user ${existing.userId}`,
			);
		}
		return { userId: user._id, created: false, isBanned: user.isBanned };
	}

	const record = await createUserRecord(ctx, { firstName: claims.displayName });
	await ctx.db.insert("authIdentities", {
		provider: "google",
		providerAccountId: claims.sub,
		userId: record.userId,
		email: claims.email,
		displayName: claims.displayName,
	});
	return { userId: record.userId, created: true, isBanned: false };
}

/**
 * Link a verified Google sub to an existing user. Conflict checks run in the
 * contract's order: google_linked_to_other_user, then
 * user_already_has_google. Linking the sub the user already holds is
 * idempotent (no new row).
 */
export async function linkGoogleIdentity(
	ctx: MutationCtx,
	args: { userId: Id<"users">; claims: GoogleClaims },
): Promise<
	{ ok: true; created: boolean } | { ok: false; conflict: LinkConflict }
> {
	const existing = await findGoogleIdentity(ctx, args.claims.sub);
	if (existing) {
		if (existing.userId === args.userId) {
			// Same sub, same user: refresh last-seen fields, insert nothing.
			await ctx.db.patch(existing._id, {
				email: args.claims.email ?? existing.email,
				displayName: args.claims.displayName ?? existing.displayName,
			});
			return { ok: true, created: false };
		}
		return { ok: false, conflict: "google_linked_to_other_user" };
	}

	const usersGoogle = await getGoogleIdentityForUser(ctx, args.userId);
	if (usersGoogle) {
		return { ok: false, conflict: "user_already_has_google" };
	}

	await ctx.db.insert("authIdentities", {
		provider: "google",
		providerAccountId: args.claims.sub,
		userId: args.userId,
		email: args.claims.email,
		displayName: args.claims.displayName,
	});
	return { ok: true, created: true };
}

export type ForkMergeWarning = {
	/** Coins on the stray account beyond the clawed-back signup bonus. */
	coinsLost: number;
	/** Live vouchers the stray account owns; they stay with it, not carried over. */
	activeVouchers: number;
};

/**
 * Self-serve fork merge: repoint the identity from the chatless Google-only
 * holder to the Telegram account that proved ownership, clawing back the
 * signup bonus. The stray row itself stays in place — after the repoint it
 * has no chatId and no identities, so it is unreachable. Returns what the
 * app should warn about (nothing carried over beyond the clawback).
 *
 * Caller must have verified the holder is chatless.
 */
export async function mergeGoogleIdentity(
	ctx: MutationCtx,
	args: {
		identity: Doc<"authIdentities">;
		toUserId: Id<"users">;
		claims: GoogleClaims;
	},
): Promise<ForkMergeWarning> {
	const stray = await ctx.db.get(args.identity.userId);

	if (stray) {
		const clawback = Math.min(SIGNUP_BONUS, stray.coins);
		if (clawback > 0) {
			await applyCoinDelta(ctx, {
				userId: stray._id,
				delta: -clawback,
				type: "fork_merge_clawback",
			});
		}
	}

	const strayVouchers = stray
		? await ctx.db
				.query("vouchers")
				.withIndex("by_uploader", (q) => q.eq("uploaderId", stray._id))
				.collect()
		: [];
	const activeVouchers = strayVouchers.filter((voucher) =>
		ACTIVE_VOUCHER_STATUSES.has(voucher.status),
	).length;
	const coinsLost = stray ? Math.max(0, stray.coins - SIGNUP_BONUS) : 0;

	await ctx.db.patch(args.identity._id, {
		userId: args.toUserId,
		email: args.claims.email ?? args.identity.email,
		displayName: args.claims.displayName ?? args.identity.displayName,
	});

	return { coinsLost, activeVouchers };
}

/**
 * Remove the user's google identity. Refuses for chatless users — Google
 * would be their only way back in.
 */
export async function unlinkGoogleIdentity(
	ctx: MutationCtx,
	args: { userId: Id<"users"> },
): Promise<{ ok: true } | { ok: false; reason: "would_strand_account" }> {
	const user = await ctx.db.get(args.userId);
	if (!user) {
		throw new Error(`User not found: ${args.userId}`);
	}
	if (user.telegramChatId === undefined) {
		return { ok: false, reason: "would_strand_account" };
	}

	const identity = await getGoogleIdentityForUser(ctx, args.userId);
	if (identity) {
		await ctx.db.delete(identity._id);
	}
	return { ok: true };
}
