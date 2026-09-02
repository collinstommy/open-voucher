/**
 * Rate-limit counter (src/lib/rateLimit.ts): fixed-window keyed counting with
 * lazy window expiry. This backs the 429 on POST /api/google-auth (per
 * verified sub); the endpoint mapping is asserted in tests/e2e/authFlow.test.ts.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../../convex/schema";
import { consumeRateLimit } from "../../src/lib/rateLimit";
import { modules } from "../test.setup";

const WINDOW_MS = 10 * 60 * 1000;

describe("consumeRateLimit", () => {
	test("allows up to the limit, then denies with retryAfterMs", async () => {
		const t = convexTest(schema, modules);

		for (let i = 0; i < 5; i++) {
			const result = await t.run(async (ctx) =>
				consumeRateLimit(ctx, {
					key: "k-limit",
					limit: 5,
					windowMs: WINDOW_MS,
				}),
			);
			expect(result).toEqual({ allowed: true, remaining: 4 - i });
		}

		const denied = await t.run(async (ctx) =>
			consumeRateLimit(ctx, { key: "k-limit", limit: 5, windowMs: WINDOW_MS }),
		);
		expect(denied.allowed).toBe(false);
		if (!denied.allowed) {
			expect(denied.retryAfterMs).toBeGreaterThan(0);
			expect(denied.retryAfterMs).toBeLessThanOrEqual(WINDOW_MS);
		}
	});

	test("windows expire lazily: a stale windowStart restarts the count", async () => {
		const t = convexTest(schema, modules);

		// Burn the window.
		for (let i = 0; i < 2; i++) {
			await t.run(async (ctx) =>
				consumeRateLimit(ctx, {
					key: "k-expire",
					limit: 2,
					windowMs: WINDOW_MS,
				}),
			);
		}
		const denied = await t.run(async (ctx) =>
			consumeRateLimit(ctx, { key: "k-expire", limit: 2, windowMs: WINDOW_MS }),
		);
		expect(denied.allowed).toBe(false);

		// Age the window past its end: the next request starts fresh.
		await t.run(async (ctx) => {
			const row = await ctx.db
				.query("rateLimits")
				.withIndex("by_key", (q) => q.eq("key", "k-expire"))
				.first();
			if (!row) throw new Error("rate limit row missing");
			await ctx.db.patch(row._id, {
				windowStart: Date.now() - WINDOW_MS - 1,
			});
		});

		const fresh = await t.run(async (ctx) =>
			consumeRateLimit(ctx, { key: "k-expire", limit: 2, windowMs: WINDOW_MS }),
		);
		expect(fresh).toEqual({ allowed: true, remaining: 1 });
	});

	test("keys are independent", async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) =>
			consumeRateLimit(ctx, { key: "k-a", limit: 1, windowMs: WINDOW_MS }),
		);
		const deniedA = await t.run(async (ctx) =>
			consumeRateLimit(ctx, { key: "k-a", limit: 1, windowMs: WINDOW_MS }),
		);
		expect(deniedA.allowed).toBe(false);

		const okB = await t.run(async (ctx) =>
			consumeRateLimit(ctx, { key: "k-b", limit: 1, windowMs: WINDOW_MS }),
		);
		expect(okB.allowed).toBe(true);
	});
});
