/**
 * Admin User Coin Deduction Tests
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "../test.setup";
import { adminLogin, createUser } from "./fixtures/testHelpers";

describe("deductUserCoins", () => {
	beforeEach(() => {
		vi.stubEnv("ADMIN_PASSWORD", "test-admin-password");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("deducts coins and records a ledger transaction atomically", async () => {
		const t = convexTest(schema, modules);
		const userId = await createUser(t, {
			telegramChatId: "deduct1",
			coins: 50,
		});
		const loginResult = await adminLogin(t);

		const result = await t.mutation(api.adminUsers.deductUserCoins, {
			token: loginResult.token,
			userId,
			amount: 10,
			deductionType: "admin_manual_deduction",
		});

		expect(result).toEqual({
			success: true,
			deductedAmount: 10,
			newBalance: 40,
		});

		// Balance patch and ledger insert happen in the same mutation.
		await t.run(async (ctx) => {
			const user = await ctx.db.get(userId);
			expect(user?.coins).toBe(40);

			const transactions = await ctx.db
				.query("transactions")
				.withIndex("by_user", (q) => q.eq("userId", userId))
				.collect();
			expect(transactions).toHaveLength(1);
			expect(transactions[0]).toMatchObject({
				userId,
				type: "admin_manual_deduction",
				amount: -10,
			});
		});
	});

	test("clamps the balance at MIN_COINS and records the effective deduction", async () => {
		const t = convexTest(schema, modules);
		const userId = await createUser(t, {
			telegramChatId: "deduct2",
			coins: 5,
		});
		const loginResult = await adminLogin(t);

		const result = await t.mutation(api.adminUsers.deductUserCoins, {
			token: loginResult.token,
			userId,
			amount: 20,
			deductionType: "admin_manual_deduction",
		});

		expect(result.newBalance).toBe(0);

		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId);
		});
		expect(user?.coins).toBe(0);

		// The ledger records what the balance actually changed by (-5),
		// not the requested amount (-20), so it always sums to the balance.
		const transactions = await t.run(async (ctx) => {
			return await ctx.db
				.query("transactions")
				.withIndex("by_user", (q) => q.eq("userId", userId))
				.collect();
		});
		expect(transactions).toHaveLength(1);
		expect(transactions[0]?.amount).toBe(-5);
	});

	test("rejects zero or negative amounts", async () => {
		const t = convexTest(schema, modules);
		const userId = await createUser(t, {
			telegramChatId: "deduct3",
			coins: 10,
		});
		const loginResult = await adminLogin(t);

		await expect(
			t.mutation(api.adminUsers.deductUserCoins, {
				token: loginResult.token,
				userId,
				amount: 0,
				deductionType: "admin_manual_deduction",
			}),
		).rejects.toThrow("Amount must be a positive integer");

		await expect(
			t.mutation(api.adminUsers.deductUserCoins, {
				token: loginResult.token,
				userId,
				amount: -5,
				deductionType: "admin_manual_deduction",
			}),
		).rejects.toThrow("Amount must be a positive integer");
	});

	test("rejects non-integer amounts without changing balance", async () => {
		const t = convexTest(schema, modules);
		const userId = await createUser(t, {
			telegramChatId: "deduct4",
			coins: 10,
		});
		const loginResult = await adminLogin(t);

		await expect(
			t.mutation(api.adminUsers.deductUserCoins, {
				token: loginResult.token,
				userId,
				amount: 2.5,
				deductionType: "admin_manual_deduction",
			}),
		).rejects.toThrow("Amount must be a positive integer");

		const user = await t.run(async (ctx) => {
			return await ctx.db.get(userId);
		});
		expect(user?.coins).toBe(10);
	});

	test("throws when the user does not exist", async () => {
		const t = convexTest(schema, modules);
		const userId = await createUser(t, {
			telegramChatId: "deduct5",
			coins: 10,
		});
		const loginResult = await adminLogin(t);

		// Remove the user so the ID is no longer resolvable.
		await t.run(async (ctx) => {
			await ctx.db.delete(userId);
		});

		await expect(
			t.mutation(api.adminUsers.deductUserCoins, {
				token: loginResult.token,
				userId,
				amount: 5,
				deductionType: "admin_manual_deduction",
			}),
		).rejects.toThrow("User not found");
	});

	test("requires a valid admin session", async () => {
		const t = convexTest(schema, modules);
		const userId = await createUser(t, {
			telegramChatId: "deduct6",
			coins: 10,
		});

		await expect(
			t.mutation(api.adminUsers.deductUserCoins, {
				token: "invalid-token",
				userId,
				amount: 5,
				deductionType: "admin_manual_deduction",
			}),
		).rejects.toThrow("Unauthorized");
	});

	test("records a reports deduction with the admin_report_deduction type", async () => {
		const t = convexTest(schema, modules);
		const userId = await createUser(t, {
			telegramChatId: "deduct7",
			coins: 30,
		});
		const loginResult = await adminLogin(t);

		const result = await t.mutation(api.adminUsers.deductUserCoins, {
			token: loginResult.token,
			userId,
			amount: 12,
			deductionType: "admin_report_deduction",
		});

		expect(result).toEqual({
			success: true,
			deductedAmount: 12,
			newBalance: 18,
		});

		const transactions = await t.run(async (ctx) => {
			return await ctx.db
				.query("transactions")
				.withIndex("by_user", (q) => q.eq("userId", userId))
				.collect();
		});
		expect(transactions).toHaveLength(1);
		expect(transactions[0]).toMatchObject({
			userId,
			type: "admin_report_deduction",
			amount: -12,
		});
	});

	test("rejects an unknown deduction type", async () => {
		const t = convexTest(schema, modules);
		const userId = await createUser(t, {
			telegramChatId: "deduct8",
			coins: 10,
		});
		const loginResult = await adminLogin(t);

		await expect(
			t.mutation(api.adminUsers.deductUserCoins, {
				token: loginResult.token,
				userId,
				amount: 5,
				// biome-ignore lint/suspicious/noExplicitAny: intentionally invalid value
				deductionType: "admin_expiry_deduction" as any,
			}),
		).rejects.toThrow();
	});
});