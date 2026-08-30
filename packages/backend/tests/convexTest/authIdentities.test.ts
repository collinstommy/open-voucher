/**
 * Identity invariants for authIdentities (contract section 5/6): signup via
 * resolveGoogleUser, conflict ordering in linkGoogleIdentity, fork-merge
 * clawback, and the unlink stranding guard.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import {
	findGoogleIdentity,
	linkGoogleIdentity,
	mergeGoogleIdentity,
	resolveGoogleUser,
	unlinkGoogleIdentity,
} from "../../src/lib/authIdentities";
import { SIGNUP_BONUS } from "../../src/lib/constants";
import { modules } from "../test.setup";
import { createUser, createVoucher } from "./fixtures/testHelpers";

function claims(sub: string, extra?: { email?: string; displayName?: string }) {
	return { sub, emailVerified: true, ...extra };
}

async function insertChatlessUser(
	t: ReturnType<typeof convexTest>,
	coins: number,
): Promise<Id<"users">> {
	return await t.run(async (ctx) => {
		return await ctx.db.insert("users", {
			coins,
			isBanned: false,
			createdAt: Date.now(),
			lastActiveAt: Date.now(),
		});
	});
}

describe("resolveGoogleUser", () => {
	test("creates a chatless user with signup bonus and identity row", async () => {
		const t = convexTest(schema, modules);

		const result = await t.run(async (ctx) =>
			resolveGoogleUser(
				ctx,
				claims("sub-create-1", { email: "a@b.c", displayName: "Ann" }),
			),
		);

		expect(result.created).toBe(true);
		expect(result.isBanned).toBe(false);

		const user = await t.run(async (ctx) => await ctx.db.get(result.userId));
		expect(user?.telegramChatId).toBeUndefined();
		expect(user?.coins).toBe(SIGNUP_BONUS);

		const identity = await t.run(
			async (ctx) => await findGoogleIdentity(ctx, "sub-create-1"),
		);
		expect(identity?.userId).toBe(result.userId);
		expect(identity?.provider).toBe("google");
		expect(identity?.email).toBe("a@b.c");
		expect(identity?.displayName).toBe("Ann");

		const transactions = await t.run(async (ctx) =>
			ctx.db
				.query("transactions")
				.withIndex("by_user", (q) => q.eq("userId", result.userId))
				.collect(),
		);
		expect(transactions).toHaveLength(1);
		expect(transactions[0]?.type).toBe("signup_bonus");
	});

	test("an existing sub resolves to the same user without creating", async () => {
		const t = convexTest(schema, modules);
		const first = await t.run(async (ctx) =>
			resolveGoogleUser(ctx, claims("sub-create-2")),
		);
		const second = await t.run(async (ctx) =>
			resolveGoogleUser(ctx, claims("sub-create-2")),
		);
		expect(second.created).toBe(false);
		expect(second.userId).toBe(first.userId);
	});

	test("ban state passes through unchanged on known subs", async () => {
		const t = convexTest(schema, modules);
		const first = await t.run(async (ctx) =>
			resolveGoogleUser(ctx, claims("sub-banned")),
		);
		await t.run(async (ctx) => {
			await ctx.db.patch(first.userId, { isBanned: true });
		});
		const second = await t.run(async (ctx) =>
			resolveGoogleUser(ctx, claims("sub-banned")),
		);
		expect(second.isBanned).toBe(true);
	});
});

describe("linkGoogleIdentity", () => {
	test("links an unlinked sub to a user", async () => {
		const t = convexTest(schema, modules);
		const userId = await createUser(t, { telegramChatId: "100001" });

		const result = await t.run(async (ctx) =>
			linkGoogleIdentity(ctx, { userId, claims: claims("sub-link-1") }),
		);
		expect(result).toEqual({ ok: true, created: true });

		const identity = await t.run(
			async (ctx) => await findGoogleIdentity(ctx, "sub-link-1"),
		);
		expect(identity?.userId).toBe(userId);
	});

	test("linking the same sub to the same user is idempotent", async () => {
		const t = convexTest(schema, modules);
		const userId = await createUser(t, { telegramChatId: "100002" });
		await t.run(async (ctx) =>
			linkGoogleIdentity(ctx, { userId, claims: claims("sub-link-2") }),
		);
		const result = await t.run(async (ctx) =>
			linkGoogleIdentity(ctx, { userId, claims: claims("sub-link-2") }),
		);
		expect(result).toEqual({ ok: true, created: false });

		const identities = await t.run(async (ctx) =>
			ctx.db.query("authIdentities").collect(),
		);
		expect(identities).toHaveLength(1);
	});

	test("a sub held by another user conflicts as google_linked_to_other_user", async () => {
		const t = convexTest(schema, modules);
		const owner = await createUser(t, { telegramChatId: "100003" });
		const other = await createUser(t, { telegramChatId: "100004" });
		await t.run(async (ctx) =>
			linkGoogleIdentity(ctx, { userId: owner, claims: claims("sub-link-3") }),
		);

		const result = await t.run(async (ctx) =>
			linkGoogleIdentity(ctx, { userId: other, claims: claims("sub-link-3") }),
		);
		expect(result).toEqual({
			ok: false,
			conflict: "google_linked_to_other_user",
		});
	});

	test("a user holding a different sub conflicts as user_already_has_google", async () => {
		const t = convexTest(schema, modules);
		const userId = await createUser(t, { telegramChatId: "100005" });
		await t.run(async (ctx) =>
			linkGoogleIdentity(ctx, { userId, claims: claims("sub-link-4a") }),
		);

		const result = await t.run(async (ctx) =>
			linkGoogleIdentity(ctx, { userId, claims: claims("sub-link-4b") }),
		);
		expect(result).toEqual({ ok: false, conflict: "user_already_has_google" });
	});

	test("conflicts check google_linked_to_other_user before user_already_has_google", async () => {
		const t = convexTest(schema, modules);
		const owner = await createUser(t, { telegramChatId: "100006" });
		const target = await createUser(t, { telegramChatId: "100007" });
		await t.run(async (ctx) =>
			linkGoogleIdentity(ctx, { userId: owner, claims: claims("sub-link-5a") }),
		);
		await t.run(async (ctx) =>
			linkGoogleIdentity(ctx, {
				userId: target,
				claims: claims("sub-link-5b"),
			}),
		);

		// The sub is held by owner AND target already has a google identity.
		const result = await t.run(async (ctx) =>
			linkGoogleIdentity(ctx, {
				userId: target,
				claims: claims("sub-link-5a"),
			}),
		);
		expect(result).toEqual({
			ok: false,
			conflict: "google_linked_to_other_user",
		});
	});
});

describe("mergeGoogleIdentity", () => {
	test("repoints the identity, claws back the bonus, and reports the warning", async () => {
		const t = convexTest(schema, modules);
		const stray = await insertChatlessUser(t, 25);
		await createVoucher(t, {
			type: "10",
			uploaderId: stray,
			status: "available",
		});
		await createVoucher(t, {
			type: "5",
			uploaderId: stray,
			status: "expired",
		});
		const target = await createUser(t, { telegramChatId: "100008" });
		await t.run(async (ctx) =>
			ctx.db.insert("authIdentities", {
				provider: "google",
				providerAccountId: "sub-merge-1",
				userId: stray,
			}),
		);
		const identity = await t.run(
			async (ctx) => await findGoogleIdentity(ctx, "sub-merge-1"),
		);

		if (!identity) throw new Error("identity row missing after insert");
		const warning = await t.run(async (ctx) =>
			mergeGoogleIdentity(ctx, {
				identity,
				toUserId: target,
				claims: claims("sub-merge-1"),
			}),
		);

		// Clawback took 10 of 25 coins; 15 remain but are not carried over.
		expect(warning).toEqual({ coinsLost: 15, activeVouchers: 1 });

		const strayAfter = await t.run(async (ctx) => await ctx.db.get(stray));
		expect(strayAfter?.coins).toBe(15);

		const repointed = await t.run(
			async (ctx) => await findGoogleIdentity(ctx, "sub-merge-1"),
		);
		expect(repointed?.userId).toBe(target);
	});
});

describe("unlinkGoogleIdentity", () => {
	test("refuses for a chatless user", async () => {
		const t = convexTest(schema, modules);
		const chatless = await insertChatlessUser(t, 0);
		await t.run(async (ctx) =>
			ctx.db.insert("authIdentities", {
				provider: "google",
				providerAccountId: "sub-unlink-1",
				userId: chatless,
			}),
		);

		const result = await t.run(async (ctx) =>
			unlinkGoogleIdentity(ctx, { userId: chatless }),
		);
		expect(result).toEqual({ ok: false, reason: "would_strand_account" });

		const identity = await t.run(
			async (ctx) => await findGoogleIdentity(ctx, "sub-unlink-1"),
		);
		expect(identity).not.toBeNull();
	});

	test("deletes the identity for a telegram user", async () => {
		const t = convexTest(schema, modules);
		const userId = await createUser(t, { telegramChatId: "100009" });
		await t.run(async (ctx) =>
			ctx.db.insert("authIdentities", {
				provider: "google",
				providerAccountId: "sub-unlink-2",
				userId,
			}),
		);

		const result = await t.run(async (ctx) =>
			unlinkGoogleIdentity(ctx, { userId }),
		);
		expect(result).toEqual({ ok: true });

		const identity = await t.run(
			async (ctx) => await findGoogleIdentity(ctx, "sub-unlink-2"),
		);
		expect(identity).toBeNull();
	});

	test("unlink wrapper is exposed as an authenticated userMutation", async () => {
		// userMutation is public (JWT identity): it lives under api, not
		// internal. Behavior is covered above at the model layer.
		expect(api.auth.unlinkGoogle).toBeDefined();
	});
});
