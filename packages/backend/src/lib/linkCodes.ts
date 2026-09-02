// Link-code lifecycle: creation from the bot /link command and the
// single-transaction redeem inside POST /api/google-auth. One transaction
// covers: code checks, attempt bump, conflict checks, identity insert/repoint,
// usedAt. Codes are generated in the calling action (see src/lib/linkCode.ts).

import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { MutationCtx } from "../../convex/_generated/server";
import {
	findGoogleIdentity,
	getGoogleIdentityForUser,
	type LinkConflict,
	linkGoogleIdentity,
	mergeGoogleIdentity,
} from "./authIdentities";
import type { GoogleClaims } from "./googleAuth";
import {
	LINK_CODE_MAX_ATTEMPTS,
	LINK_CODE_TTL_MS,
	normalizeLinkCode,
} from "./linkCode";

export type RedeemConflict =
	| "code_invalid_or_expired"
	| "too_many_attempts"
	| LinkConflict;

export type RedeemSuccess = {
	userId: Id<"users">;
	/** The sub was already linked to this same user — idempotent, no new row. */
	idempotent: boolean;
	/** A chatless fork account was absorbed into the code owner's account. */
	merged: boolean;
	/** Present when the merged stray had coins/vouchers that will not carry over. */
	warning?: { coinsLost: number; activeVouchers: number };
};

export type RedeemResult =
	| { ok: true; success: RedeemSuccess }
	| { ok: false; conflict: RedeemConflict };

/**
 * Persist a bot-issued code. The caller generates the code in an action
 * context and retries on the rare collision (ok: false).
 */
export async function createBotToAppCode(
	ctx: MutationCtx,
	args: { userId: Id<"users">; code: string },
): Promise<{ ok: true } | { ok: false; reason: "code_taken" }> {
	const code = normalizeLinkCode(args.code);
	const existing = await ctx.db
		.query("linkCodes")
		.withIndex("by_code", (q) => q.eq("code", code))
		.first();
	if (existing) {
		return { ok: false, reason: "code_taken" };
	}

	await ctx.db.insert("linkCodes", {
		code,
		userId: args.userId,
		attempts: 0,
		expiresAt: Date.now() + LINK_CODE_TTL_MS,
	});
	return { ok: true };
}

/**
 * Redeem a link code for a verified Google sub. Attempts are bumped on every
 * attempt against a live (unused, unexpired, under-cap) code; conflicts leave
 * the code usable (usedAt stays unset).
 */
export async function redeemBotToAppCode(
	ctx: MutationCtx,
	args: { code: string; claims: GoogleClaims },
): Promise<RedeemResult> {
	const code = normalizeLinkCode(args.code);
	const row: Doc<"linkCodes"> | null = await ctx.db
		.query("linkCodes")
		.withIndex("by_code", (q) => q.eq("code", code))
		.first();

	if (!row || row.usedAt !== undefined) {
		return { ok: false, conflict: "code_invalid_or_expired" };
	}
	const now = Date.now();
	if (now > row.expiresAt) {
		return { ok: false, conflict: "code_invalid_or_expired" };
	}
	if (row.attempts >= LINK_CODE_MAX_ATTEMPTS) {
		return { ok: false, conflict: "too_many_attempts" };
	}
	await ctx.db.patch(row._id, { attempts: row.attempts + 1 });

	const existing = await findGoogleIdentity(ctx, args.claims.sub);
	if (existing) {
		if (existing.userId === row.userId) {
			// Already linked to the code owner: idempotent, code stays usable.
			await ctx.db.patch(existing._id, {
				email: args.claims.email ?? existing.email,
				displayName: args.claims.displayName ?? existing.displayName,
			});
			return {
				ok: true,
				success: { userId: row.userId, idempotent: true, merged: false },
			};
		}

		const holder = await ctx.db.get(existing.userId);
		if (holder && holder.telegramChatId === undefined) {
			// The sub belongs to a chatless fork of the code owner. The code
			// proved ownership, so absorb the fork instead of conflicting.
			const usersGoogle = await getGoogleIdentityForUser(ctx, row.userId);
			if (usersGoogle) {
				return { ok: false, conflict: "user_already_has_google" };
			}
			const warning = await mergeGoogleIdentity(ctx, {
				identity: existing,
				toUserId: row.userId,
				claims: args.claims,
			});
			await ctx.db.patch(row._id, { usedAt: now });
			return {
				ok: true,
				success: {
					userId: row.userId,
					idempotent: false,
					merged: true,
					warning:
						warning.coinsLost > 0 || warning.activeVouchers > 0
							? warning
							: undefined,
				},
			};
		}

		return { ok: false, conflict: "google_linked_to_other_user" };
	}

	const link = await linkGoogleIdentity(ctx, {
		userId: row.userId,
		claims: args.claims,
	});
	if (!link.ok) {
		return { ok: false, conflict: link.conflict };
	}

	await ctx.db.patch(row._id, { usedAt: now });
	return {
		ok: true,
		success: { userId: row.userId, idempotent: false, merged: false },
	};
}
