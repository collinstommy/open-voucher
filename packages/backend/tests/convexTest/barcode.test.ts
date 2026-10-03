import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { stripBarcodeSpaces } from "../../src/lib/barcode";
import { modules } from "../test.setup";
import { createUser } from "./fixtures/testHelpers";

describe("stripBarcodeSpaces", () => {
	test("removes spaces from a printed barcode", () => {
		expect(stripBarcodeSpaces("2707338 3268 78")).toBe("2707338326878");
	});

	test("leaves a digits-only barcode unchanged", () => {
		expect(stripBarcodeSpaces("2707338326878")).toBe("2707338326878");
	});
});

describe("storeVoucherFromOcr barcode spaces", () => {
	test("stores the barcode without spaces", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
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
});
