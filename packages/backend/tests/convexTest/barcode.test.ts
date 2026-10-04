import { convexTest } from "convex-test";
import aggregateTest from "@convex-dev/aggregate/test";
import { describe, expect, test, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import {
	barcodeLookupKeys,
	firstMatchingBarcode,
	stripBarcodeSpaces,
} from "../../src/lib/barcode";
import { modules } from "../test.setup";
import { createUser, createVoucher } from "./fixtures/testHelpers";

describe("stripBarcodeSpaces", () => {
	test("removes spaces from a printed barcode", () => {
		expect(stripBarcodeSpaces("2707338 3268 78")).toBe("2707338326878");
	});

	test("leaves a digits-only barcode unchanged", () => {
		expect(stripBarcodeSpaces("2707338326878")).toBe("2707338326878");
	});
});

describe("barcodeLookupKeys", () => {
	test("includes the spacings already stored for a 13-digit barcode", () => {
		expect(barcodeLookupKeys("2707338326878")).toEqual([
			"2707338326878",
			"2707338 3268 78",
			"2 707338 32687 8",
			"2 707338 326878",
		]);
	});

	test("includes the 12-digit spacing already stored", () => {
		expect(barcodeLookupKeys("123456789012")).toEqual([
			"123456789012",
			"123456 789012",
		]);
	});

	test("finds a voucher stored with spaces", async () => {
		const stored = new Map<string, string>([["2707338 3268 78", "existing"]]);
		const match = await firstMatchingBarcode("2707338326878", async (key) => {
			return stored.get(key) ?? null;
		});
		expect(match).toBe("existing");
	});
});

describe("storeVoucherFromOcr barcode spaces", () => {
	test("stores the barcode without spaces", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		aggregateTest.register(t, "voucherAgg");
		const userId = await createUser(t, { telegramChatId: "123456", coins: 0 });
		const imageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["fake-image"]));
		});

		await t.mutation(internal.ocr.storeVoucherFromOcr, {
			userId,
			imageStorageId,
			type: "10",
			expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
			validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
			barcode: "2707338 3268 78",
			rawResponse: "{}",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const vouchers = await t.run(async (ctx) => {
			return await ctx.db.query("vouchers").collect();
		});
		expect(vouchers).toHaveLength(1);
		expect(vouchers[0]?.barcodeNumber).toBe("2707338326878");
		vi.useRealTimers();
	});

	test("rejects a spaced barcode when the digits-only value is already stored", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		aggregateTest.register(t, "voucherAgg");
		const userId = await createUser(t, { telegramChatId: "123456", coins: 0 });
		const firstImage = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["first"]));
		});
		const secondImage = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["second"]));
		});
		const expiryDate = new Date(
			Date.now() + 14 * 24 * 60 * 60 * 1000,
		).toISOString();
		const validFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

		await t.mutation(internal.ocr.storeVoucherFromOcr, {
			userId,
			imageStorageId: firstImage,
			type: "10",
			expiryDate,
			validFrom,
			barcode: "2707338326878",
			rawResponse: "{}",
		});
		const duplicate = await t.mutation(internal.ocr.storeVoucherFromOcr, {
			userId,
			imageStorageId: secondImage,
			type: "10",
			expiryDate,
			validFrom,
			barcode: "2707338 3268 78",
			rawResponse: "{}",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(duplicate).toMatchObject({
			success: false,
			reason: "DUPLICATE_BARCODE",
		});
		const vouchers = await t.run(async (ctx) => {
			return await ctx.db.query("vouchers").collect();
		});
		expect(vouchers).toHaveLength(1);
		expect(vouchers[0]?.barcodeNumber).toBe("2707338326878");
		vi.useRealTimers();
	});

	test.each([
		["2707338326878", "2707338 3268 78"],
		["2707338326878", "2 707338 32687 8"],
		["2707338326878", "2 707338 326878"],
		["123456789012", "123456 789012"],
	])("rejects %s when %s is already stored", async (uploadBarcode, storedBarcode) => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		aggregateTest.register(t, "voucherAgg");
		const userId = await createUser(t, {
			telegramChatId: "123456",
			coins: 0,
		});
		const imageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["second"]));
		});
		await createVoucher(t, {
			type: "10",
			uploaderId: userId,
			barcodeNumber: storedBarcode,
		});
		const expiryDate = new Date(
			Date.now() + 14 * 24 * 60 * 60 * 1000,
		).toISOString();
		const validFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

		const duplicate = await t.mutation(internal.ocr.storeVoucherFromOcr, {
			userId,
			imageStorageId,
			type: "10",
			expiryDate,
			validFrom,
			barcode: uploadBarcode,
			rawResponse: "{}",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(duplicate).toMatchObject({
			success: false,
			reason: "DUPLICATE_BARCODE",
		});
		const vouchers = await t.run(async (ctx) => {
			return await ctx.db.query("vouchers").collect();
		});
		expect(vouchers).toHaveLength(1);
		expect(vouchers[0]?.barcodeNumber).toBe(storedBarcode);
		vi.useRealTimers();
	});
});
