/**
 * Link-code lifecycle (contract section 5 state machine + conflict matrix):
 * creation, single-use redeem, the five conflict rows, attempt cap, expiry,
 * and the fork-merge path inside redeem.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { findGoogleIdentity } from "../../src/lib/authIdentities";
import { SIGNUP_BONUS } from "../../src/lib/constants";
import {
	LINK_CODE_MAX_ATTEMPTS,
	LINK_CODE_TTL_MS,
} from "../../src/lib/linkCode";
import {
	createBotToAppCode,
	type RedeemResult,
	redeemBotToAppCode,
} from "../../src/lib/linkCodes";
import { modules } from "../test.setup";
import { createUser } from "./fixtures/testHelpers";

function claims(sub: string) {
	return { sub, emailVerified: true, email: `${sub}@example.com` };
}

function expectConflict(result: RedeemResult, conflict: string) {
	expect(result).toEqual({ ok: false, conflict });
}

/** Inserts a link code row with full control over expiry/attempts. */
async function insertCode(
	t: ReturnType<typeof convexTest>,
	args: {
		userId: Id<"users">;
		code: string;
		expiresAt?: number;
		attempts?: number;
		usedAt?: number;
	},
): Promise<Id<"linkCodes">> {
	return await t.run(async (ctx) => {
		return await ctx.db.insert("linkCodes", {
			code: args.code,
			userId: args.userId,
			attempts: args.attempts ?? 0,
			expiresAt: args.expiresAt ?? Date.now() + LINK_CODE_TTL_MS,
			usedAt: args.usedAt,
		});
	});
}

describe("createBotToAppCode", () => {
	test("stores a code with ~10min expiry and zero attempts", async () => {
		const t = convexTest(schema, modules);
		const userId = await createUser(t, { telegramChatId: "200001" });
		const before = Date.now();

		const result = await t.run(async (ctx) =>
			createBotToAppCode(ctx, { userId, code: "ABCD2345" }),
		);
		expect(result.ok).toBe(true);

		const row = await t.run(async (ctx) =>
			ctx.db
				.query("linkCodes")
				.withIndex("by_code", (q) => q.eq("code", "ABCD2345"))
				.first(),
		);
		if (!row) throw new Error("code row missing after create");
		expect(row.userId).toBe(userId);
		expect(row.attempts).toBe(0);
		expect(row.expiresAt).toBeGreaterThanOrEqual(
			before + LINK_CODE_TTL_MS - 1000,
		);
		expect(row.expiresAt).toBeLessThanOrEqual(Date.now() + LINK_CODE_TTL_MS);
	});

	test("rejects a colliding code", async () => {
		const t = convexTest(schema, modules);
		const userId = await createUser(t, { telegramChatId: "200002" });
		await insertCode(t, { userId, code: "CRASH268" });

		const result = await t.run(async (ctx) =>
			createBotToAppCode(ctx, { userId, code: "CRASH268" }),
		);
		expect(result).toEqual({ ok: false, reason: "code_taken" });
	});
});

describe("redeemBotToAppCode", () => {
	test("happy path: valid code links an unlinked sub and is consumed", async () => {
		const t = convexTest(schema, modules);
		const target = await createUser(t, { telegramChatId: "200010" });
		await insertCode(t, { userId: target, code: "HAPPY234" });

		const result = await t.run(async (ctx) =>
			redeemBotToAppCode(ctx, {
				code: "HAPPY234",
				claims: claims("sub-redeem-1"),
			}),
		);

		if (!result.ok) throw new Error(`expected success, got ${result.conflict}`);
		expect(result.success).toEqual({
			userId: target,
			idempotent: false,
			merged: false,
		});

		const identity = await t.run(
			async (ctx) => await findGoogleIdentity(ctx, "sub-redeem-1"),
		);
		expect(identity?.userId).toBe(target);

		const row = await t.run(async (ctx) =>
			ctx.db
				.query("linkCodes")
				.withIndex("by_code", (q) => q.eq("code", "HAPPY234"))
				.first(),
		);
		expect(row?.usedAt).toBeDefined();
		expect(row?.attempts).toBe(1);
	});

	test("row: sub already linked to the code owner is idempotent, code stays usable", async () => {
		const t = convexTest(schema, modules);
		const target = await createUser(t, { telegramChatId: "200011" });
		await t.run(async (ctx) =>
			ctx.db.insert("authIdentities", {
				provider: "google",
				providerAccountId: "sub-redeem-2",
				userId: target,
			}),
		);
		await insertCode(t, { userId: target, code: "SAMESER9" });

		const result = await t.run(async (ctx) =>
			redeemBotToAppCode(ctx, {
				code: "SAMESER9",
				claims: claims("sub-redeem-2"),
			}),
		);

		if (!result.ok) throw new Error(`expected success, got ${result.conflict}`);
		expect(result.success.idempotent).toBe(true);
		expect(result.success.merged).toBe(false);

		const identities = await t.run(async (ctx) =>
			ctx.db.query("authIdentities").collect(),
		);
		expect(identities).toHaveLength(1);

		const row = await t.run(async (ctx) =>
			ctx.db
				.query("linkCodes")
				.withIndex("by_code", (q) => q.eq("code", "SAMESER9"))
				.first(),
		);
		expect(row?.usedAt).toBeUndefined();
	});

	test("row: sub linked to a different telegram user conflicts and the code stays usable", async () => {
		const t = convexTest(schema, modules);
		const owner = await createUser(t, { telegramChatId: "200012" });
		await t.run(async (ctx) =>
			ctx.db.insert("authIdentities", {
				provider: "google",
				providerAccountId: "sub-redeem-3",
				userId: owner,
			}),
		);
		const other = await createUser(t, { telegramChatId: "200013" });
		await insertCode(t, { userId: other, code: "ENEMY234" });

		const result = await t.run(async (ctx) =>
			redeemBotToAppCode(ctx, {
				code: "ENEMY234",
				claims: claims("sub-redeem-3"),
			}),
		);
		expectConflict(result, "google_linked_to_other_user");

		const row = await t.run(async (ctx) =>
			ctx.db
				.query("linkCodes")
				.withIndex("by_code", (q) => q.eq("code", "ENEMY234"))
				.first(),
		);
		// Attempts incremented while the code stays valid and unused.
		expect(row?.usedAt).toBeUndefined();
		expect(row?.attempts).toBe(1);

		// A different sub redeems the same code successfully.
		const retry = await t.run(async (ctx) =>
			redeemBotToAppCode(ctx, {
				code: "ENEMY234",
				claims: claims("sub-redeem-3b"),
			}),
		);
		if (!retry.ok) throw new Error(`expected success, got ${retry.conflict}`);
		expect(retry.success.userId).toBe(other);
	});

	test("row: target already holding a different sub conflicts as user_already_has_google", async () => {
		const t = convexTest(schema, modules);
		const target = await createUser(t, { telegramChatId: "200014" });
		await t.run(async (ctx) =>
			ctx.db.insert("authIdentities", {
				provider: "google",
				providerAccountId: "sub-redeem-4-existing",
				userId: target,
			}),
		);
		await insertCode(t, { userId: target, code: "TAKEN234" });

		const result = await t.run(async (ctx) =>
			redeemBotToAppCode(ctx, {
				code: "TAKEN234",
				claims: claims("sub-redeem-4-new"),
			}),
		);
		expectConflict(result, "user_already_has_google");
	});

	test("row: unknown, used, and expired codes all return code_invalid_or_expired", async () => {
		const t = convexTest(schema, modules);
		const target = await createUser(t, { telegramChatId: "200015" });

		const unknown = await t.run(async (ctx) =>
			redeemBotToAppCode(ctx, { code: "ABSENT23", claims: claims("sub-x1") }),
		);
		expectConflict(unknown, "code_invalid_or_expired");

		await insertCode(t, {
			userId: target,
			code: "SPENT234",
			usedAt: Date.now(),
		});
		const used = await t.run(async (ctx) =>
			redeemBotToAppCode(ctx, { code: "SPENT234", claims: claims("sub-x2") }),
		);
		expectConflict(used, "code_invalid_or_expired");

		await insertCode(t, {
			userId: target,
			code: "PAST2345",
			expiresAt: Date.now() - 1000,
		});
		const expired = await t.run(async (ctx) =>
			redeemBotToAppCode(ctx, { code: "PAST2345", claims: claims("sub-x3") }),
		);
		expectConflict(expired, "code_invalid_or_expired");
	});

	test("attempt cap: bumps while valid, then too_many_attempts", async () => {
		const t = convexTest(schema, modules);
		// Target already holds a google identity, so every redeem conflicts and
		// the code survives with its attempts counter bumped.
		const target = await createUser(t, { telegramChatId: "200016" });
		await t.run(async (ctx) =>
			ctx.db.insert("authIdentities", {
				provider: "google",
				providerAccountId: "sub-cap-existing",
				userId: target,
			}),
		);
		await insertCode(t, {
			userId: target,
			code: "CAP23456",
			attempts: LINK_CODE_MAX_ATTEMPTS - 1,
		});

		// Fifth attempt: allowed (attempts < cap), conflicts, bumps to the cap.
		const fifth = await t.run(async (ctx) =>
			redeemBotToAppCode(ctx, {
				code: "CAP23456",
				claims: claims("sub-cap-fifth"),
			}),
		);
		expectConflict(fifth, "user_already_has_google");

		const row = await t.run(async (ctx) =>
			ctx.db
				.query("linkCodes")
				.withIndex("by_code", (q) => q.eq("code", "CAP23456"))
				.first(),
		);
		expect(row?.attempts).toBe(LINK_CODE_MAX_ATTEMPTS);
		expect(row?.usedAt).toBeUndefined();

		// Sixth attempt: the code is dead.
		const sixth = await t.run(async (ctx) =>
			redeemBotToAppCode(ctx, {
				code: "CAP23456",
				claims: claims("sub-cap-sixth"),
			}),
		);
		expectConflict(sixth, "too_many_attempts");
	});

	test("fork merge: a chatless holder is absorbed into the code owner with clawback", async () => {
		const t = convexTest(schema, modules);
		// Telegram account that forked themselves via the choice screen.
		const target = await createUser(t, { telegramChatId: "200018" });

		// The stray chatless google-only holder.
		const stray = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				coins: SIGNUP_BONUS,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			}),
		);
		await t.run(async (ctx) =>
			ctx.db.insert("authIdentities", {
				provider: "google",
				providerAccountId: "sub-fork-1",
				userId: stray,
			}),
		);
		await insertCode(t, { userId: target, code: "MERGE234" });

		const result = await t.run(async (ctx) =>
			redeemBotToAppCode(ctx, {
				code: "MERGE234",
				claims: claims("sub-fork-1"),
			}),
		);

		if (!result.ok) throw new Error(`expected success, got ${result.conflict}`);
		expect(result.success.merged).toBe(true);
		expect(result.success.userId).toBe(target);
		// Stray held only the untouched bonus: clawed back, nothing to warn about.
		expect(result.success.warning).toBeUndefined();

		const strayAfter = await t.run(async (ctx) => await ctx.db.get(stray));
		expect(strayAfter?.coins).toBe(0);

		const identity = await t.run(
			async (ctx) => await findGoogleIdentity(ctx, "sub-fork-1"),
		);
		expect(identity?.userId).toBe(target);

		const row = await t.run(async (ctx) =>
			ctx.db
				.query("linkCodes")
				.withIndex("by_code", (q) => q.eq("code", "MERGE234"))
				.first(),
		);
		expect(row?.usedAt).toBeDefined();
	});

	test("fork merge is blocked when the target already holds a google identity", async () => {
		const t = convexTest(schema, modules);
		const target = await createUser(t, { telegramChatId: "200019" });
		await t.run(async (ctx) =>
			ctx.db.insert("authIdentities", {
				provider: "google",
				providerAccountId: "sub-fork-2-targets-own",
				userId: target,
			}),
		);

		const stray = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				coins: SIGNUP_BONUS,
				isBanned: false,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			}),
		);
		await t.run(async (ctx) =>
			ctx.db.insert("authIdentities", {
				provider: "google",
				providerAccountId: "sub-fork-2",
				userId: stray,
			}),
		);
		await insertCode(t, { userId: target, code: "MERGE235" });

		const result = await t.run(async (ctx) =>
			redeemBotToAppCode(ctx, {
				code: "MERGE235",
				claims: claims("sub-fork-2"),
			}),
		);
		expectConflict(result, "user_already_has_google");

		// Nothing moved.
		const identity = await t.run(
			async (ctx) => await findGoogleIdentity(ctx, "sub-fork-2"),
		);
		expect(identity?.userId).toBe(stray);
	});
});
