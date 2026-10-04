import { convexTest } from "convex-test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "../test.setup";
import { adminLogin, createUser, createVoucher } from "./fixtures/testHelpers";

async function credit(
	t: ReturnType<typeof convexTest>,
	userId: Id<"users">,
	voucherId: Id<"vouchers">,
	amount: number,
	type: "upload_reward" | "claim_spend" | "admin_expiry_deduction",
) {
	await t.run(async (ctx) => {
		await ctx.db.insert("transactions", {
			userId,
			type,
			amount,
			voucherId,
			createdAt: Date.now(),
		});
	});
}

describe("removeVoucherAndReverseCoins", () => {
	beforeEach(() => {
		vi.stubEnv("ADMIN_PASSWORD", "test-admin-password");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("reverses the upload reward and hides the voucher from the uploader", async () => {
		const t = convexTest(schema, modules);
		aggregateTest.register(t, "voucherAgg");
		const uploaderId = await createUser(t, {
			telegramChatId: "uploader",
			coins: 10,
		});
		await t.run(async (ctx) => {
			await ctx.db.patch(uploaderId, { uploadCount: 1 });
		});
		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "available",
			barcodeNumber: "2707013 1247 44",
		});
		const keptId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "available",
			barcodeNumber: "2707013124744",
		});
		await credit(t, uploaderId, voucherId, 10, "upload_reward");
		const login = await adminLogin(t);

		const result = await t.mutation(
			api.adminVouchers.removeVoucherAndReverseCoins,
			{ token: login.token, voucherId },
		);

		expect(result.reversals).toEqual([
			{ userId: uploaderId, amount: -10, newBalance: 0 },
		]);

		const uploads = await t
			.withIdentity({ subject: uploaderId })
			.query(api.vouchers.getMyAvailableUploads, {});
		expect(uploads.map((v) => v._id)).toEqual([keptId]);

		await t.run(async (ctx) => {
			const removed = await ctx.db.get(voucherId);
			const kept = await ctx.db.get(keptId);
			const uploader = await ctx.db.get(uploaderId);
			expect(removed?.status).toBe("removed");
			expect(removed?.barcodeNumber).toBe("2707013 1247 44");
			expect(kept?.status).toBe("available");
			expect(uploader?.coins).toBe(0);
			expect(uploader?.uploadCount).toBe(0);
		});
	});

	test("puts the claimer's spend back as well", async () => {
		const t = convexTest(schema, modules);
		aggregateTest.register(t, "voucherAgg");
		const uploaderId = await createUser(t, {
			telegramChatId: "uploader",
			coins: 10,
		});
		const claimerId = await createUser(t, {
			telegramChatId: "claimer",
			coins: 0,
		});
		await t.run(async (ctx) => {
			await ctx.db.patch(uploaderId, { uploadCount: 1 });
			await ctx.db.patch(claimerId, { claimCount: 1 });
		});
		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId,
			claimedAt: Date.now(),
			barcodeNumber: "2707325840981",
		});
		await credit(t, uploaderId, voucherId, 10, "upload_reward");
		await credit(t, claimerId, voucherId, -10, "claim_spend");
		const login = await adminLogin(t);

		await t.mutation(api.adminVouchers.removeVoucherAndReverseCoins, {
			token: login.token,
			voucherId,
		});

		const claims = await t
			.withIdentity({ subject: claimerId })
			.query(api.vouchers.getMyClaimedVouchers, {});
		expect(claims).toEqual([]);

		await t.run(async (ctx) => {
			const uploader = await ctx.db.get(uploaderId);
			const claimer = await ctx.db.get(claimerId);
			expect(uploader?.coins).toBe(0);
			expect(claimer?.coins).toBe(10);
			expect(claimer?.claimCount).toBe(0);
			const reversals = await ctx.db
				.query("transactions")
				.withIndex("by_voucher", (q) => q.eq("voucherId", voucherId))
				.collect();
			expect(reversals.filter((tx) => tx.type === "admin_removed")).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ userId: uploaderId, amount: -10 }),
					expect.objectContaining({ userId: claimerId, amount: 10 }),
				]),
			);
		});
	});

	test("does not deduct the uploader again when expiry already took the reward", async () => {
		const t = convexTest(schema, modules);
		aggregateTest.register(t, "voucherAgg");
		const uploaderId = await createUser(t, {
			telegramChatId: "uploader",
			coins: 0,
		});
		const claimerId = await createUser(t, {
			telegramChatId: "claimer",
			coins: 0,
		});
		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "expired",
			claimerId,
			barcodeNumber: "2707111066267",
		});
		await credit(t, uploaderId, voucherId, 10, "upload_reward");
		await credit(t, uploaderId, voucherId, -10, "admin_expiry_deduction");
		await credit(t, claimerId, voucherId, -10, "claim_spend");
		const login = await adminLogin(t);

		const result = await t.mutation(
			api.adminVouchers.removeVoucherAndReverseCoins,
			{ token: login.token, voucherId },
		);

		expect(result.reversals).toEqual([
			{ userId: claimerId, amount: 10, newBalance: 10 },
		]);
		const uploader = await t.run(async (ctx) => ctx.db.get(uploaderId));
		expect(uploader?.coins).toBe(0);
	});

	test("rejects a second removal", async () => {
		const t = convexTest(schema, modules);
		aggregateTest.register(t, "voucherAgg");
		const uploaderId = await createUser(t, {
			telegramChatId: "uploader",
			coins: 0,
		});
		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "available",
		});
		const login = await adminLogin(t);
		await t.mutation(api.adminVouchers.removeVoucherAndReverseCoins, {
			token: login.token,
			voucherId,
		});

		await expect(
			t.mutation(api.adminVouchers.removeVoucherAndReverseCoins, {
				token: login.token,
				voucherId,
			}),
		).rejects.toThrow("Voucher is already removed");
	});
});
