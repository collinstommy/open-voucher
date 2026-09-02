// Small keyed rate-limit counter, backed by the rateLimits table. Windows are
// fixed (not sliding): the first request in a window stamps windowStart, the
// window expires lazily on the next request after windowMs.
//
// Used by POST /api/google-auth, keyed per verified Google sub — httpActions
// have no trustworthy client IP behind the CDN.

import type { MutationCtx } from "../../convex/_generated/server";

// /api/google-auth: per verified Google sub.
export const GOOGLE_AUTH_RATE_LIMIT = 20;
export const GOOGLE_AUTH_RATE_WINDOW_MS = 10 * 60 * 1000;

export type RateLimitResult =
	| { allowed: true; remaining: number }
	| { allowed: false; retryAfterMs: number };

export async function consumeRateLimit(
	ctx: MutationCtx,
	args: { key: string; limit: number; windowMs: number },
): Promise<RateLimitResult> {
	const now = Date.now();
	const row = await ctx.db
		.query("rateLimits")
		.withIndex("by_key", (q) => q.eq("key", args.key))
		.first();

	if (!row || now - row.windowStart >= args.windowMs) {
		if (row) {
			await ctx.db.patch(row._id, { count: 1, windowStart: now });
		} else {
			await ctx.db.insert("rateLimits", {
				key: args.key,
				count: 1,
				windowStart: now,
			});
		}
		return { allowed: true, remaining: args.limit - 1 };
	}

	if (row.count >= args.limit) {
		return {
			allowed: false,
			retryAfterMs: Math.max(0, row.windowStart + args.windowMs - now),
		};
	}

	await ctx.db.patch(row._id, { count: row.count + 1 });
	return { allowed: true, remaining: args.limit - row.count - 1 };
}
