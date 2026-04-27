/**
 * Voucher Image Cleanup Tests
 *
 * Ensures only old expired voucher images get deleted, with proper
 * retention periods (90 days before marking, 30 days grace before deleting).
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "../test.setup";
import { createUser, createVoucher } from "./fixtures/testHelpers";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe("Voucher Image Cleanup", () => {
	describe("Marking phase - only marks vouchers expired 90+ days", () => {
		test("marks voucher expired 91 days ago", async () => {
			const t = convexTest(schema, modules);
			const userId = await createUser(t, { telegramChatId: "111" });
			const now = Date.now();

			await createVoucher(t, {
				type: "10",
				uploaderId: userId,
				status: "expired",
				expiryDate: now - 91 * MS_PER_DAY,
			});

			const result = await t.query(
				internal.admin.getExpiredVouchersForCleanup,
				{ mode: "mark" },
			);

			expect(result).toHaveLength(1);
			expect(result[0].status).toBe("expired");
		});

		test("does NOT mark voucher expired 89 days ago", async () => {
			const t = convexTest(schema, modules);
			const userId = await createUser(t, { telegramChatId: "222" });
			const now = Date.now();

			await createVoucher(t, {
				type: "10",
				uploaderId: userId,
				status: "expired",
				expiryDate: now - 89 * MS_PER_DAY,
			});

			const result = await t.query(
				internal.admin.getExpiredVouchersForCleanup,
				{ mode: "mark" },
			);

			expect(result).toHaveLength(0);
		});

		test("does NOT mark voucher expired 90 days ago (boundary)", async () => {
			const t = convexTest(schema, modules);
			const userId = await createUser(t, { telegramChatId: "223" });
			const now = Date.now();

			await createVoucher(t, {
				type: "10",
				uploaderId: userId,
				status: "expired",
				expiryDate: now - 90 * MS_PER_DAY + 60_000, // 1 min buffer for timing
			});

			const result = await t.query(
				internal.admin.getExpiredVouchersForCleanup,
				{ mode: "mark" },
			);

			expect(result).toHaveLength(0);
		});

		test("does NOT mark available voucher expired 100 days ago", async () => {
			const t = convexTest(schema, modules);
			const userId = await createUser(t, { telegramChatId: "333" });
			const now = Date.now();

			await createVoucher(t, {
				type: "10",
				uploaderId: userId,
				status: "available",
				expiryDate: now - 100 * MS_PER_DAY,
			});

			const result = await t.query(
				internal.admin.getExpiredVouchersForCleanup,
				{ mode: "mark" },
			);

			expect(result).toHaveLength(0);
		});

		test("does NOT mark claimed voucher", async () => {
			const t = convexTest(schema, modules);
			const userId = await createUser(t, { telegramChatId: "444" });
			const now = Date.now();

			await createVoucher(t, {
				type: "10",
				uploaderId: userId,
				status: "claimed",
				expiryDate: now - 100 * MS_PER_DAY,
			});

			const result = await t.query(
				internal.admin.getExpiredVouchersForCleanup,
				{ mode: "mark" },
			);

			expect(result).toHaveLength(0);
		});

		test("does NOT mark voucher already marked for deletion", async () => {
			const t = convexTest(schema, modules);
			const userId = await createUser(t, { telegramChatId: "555" });
			const now = Date.now();

			const voucherId = await createVoucher(t, {
				type: "10",
				uploaderId: userId,
				status: "expired",
				expiryDate: now - 100 * MS_PER_DAY,
			});

			await t.run(async (ctx) => {
				await ctx.db.patch(voucherId, {
					imageMarkedForDeletionAt: now - 10 * MS_PER_DAY,
				});
			});

			const result = await t.query(
				internal.admin.getExpiredVouchersForCleanup,
				{ mode: "mark" },
			);

			expect(result).toHaveLength(0);
		});

		test("does NOT mark voucher with image already deleted", async () => {
			const t = convexTest(schema, modules);
			const userId = await createUser(t, { telegramChatId: "666" });
			const now = Date.now();

			const voucherId = await createVoucher(t, {
				type: "10",
				uploaderId: userId,
				status: "expired",
				expiryDate: now - 100 * MS_PER_DAY,
			});

			await t.run(async (ctx) => {
				await ctx.db.patch(voucherId, {
					imageDeletedAt: now - 5 * MS_PER_DAY,
				});
			});

			const result = await t.query(
				internal.admin.getExpiredVouchersForCleanup,
				{ mode: "mark" },
			);

			expect(result).toHaveLength(0);
		});

		test("respects batch size limit of 100", async () => {
			const t = convexTest(schema, modules);
			const userId = await createUser(t, { telegramChatId: "777" });
			const now = Date.now();

			for (let i = 0; i < 105; i++) {
				await createVoucher(t, {
					type: "10",
					uploaderId: userId,
					status: "expired",
					expiryDate: now - (91 + i) * MS_PER_DAY,
				});
			}

			const result = await t.query(
				internal.admin.getExpiredVouchersForCleanup,
				{ mode: "mark" },
			);

			expect(result).toHaveLength(100);
		});
	});

	describe("Deletion phase - only deletes images marked 30+ days ago", () => {
		test("deletes image marked 31 days ago", async () => {
			const t = convexTest(schema, modules);
			const userId = await createUser(t, { telegramChatId: "888" });
			const now = Date.now();

			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["test-image"]));
			});

			const voucherId = await createVoucher(t, {
				type: "10",
				uploaderId: userId,
				status: "expired",
				expiryDate: now - 100 * MS_PER_DAY,
				imageStorageId,
			});

			await t.run(async (ctx) => {
				await ctx.db.patch(voucherId, {
					imageMarkedForDeletionAt: now - 31 * MS_PER_DAY,
				});
			});

			const result = await t.query(
				internal.admin.getExpiredVouchersForCleanup,
				{ mode: "delete" },
			);

			expect(result).toHaveLength(1);
			expect(result[0]._id).toBe(voucherId);
		});

		test("does NOT delete image marked 29 days ago", async () => {
			const t = convexTest(schema, modules);
			const userId = await createUser(t, { telegramChatId: "999" });
			const now = Date.now();

			const voucherId = await createVoucher(t, {
				type: "10",
				uploaderId: userId,
				status: "expired",
				expiryDate: now - 100 * MS_PER_DAY,
			});

			await t.run(async (ctx) => {
				await ctx.db.patch(voucherId, {
					imageMarkedForDeletionAt: now - 29 * MS_PER_DAY,
				});
			});

			const result = await t.query(
				internal.admin.getExpiredVouchersForCleanup,
				{ mode: "delete" },
			);

			expect(result).toHaveLength(0);
		});

		test("does NOT delete image marked 30 days ago (boundary)", async () => {
			const t = convexTest(schema, modules);
			const userId = await createUser(t, { telegramChatId: "990" });
			const now = Date.now();

			const voucherId = await createVoucher(t, {
				type: "10",
				uploaderId: userId,
				status: "expired",
				expiryDate: now - 100 * MS_PER_DAY,
			});

			await t.run(async (ctx) => {
				await ctx.db.patch(voucherId, {
					imageMarkedForDeletionAt: now - 30 * MS_PER_DAY + 60_000, // 1 min buffer
				});
			});

			const result = await t.query(
				internal.admin.getExpiredVouchersForCleanup,
				{ mode: "delete" },
			);

			expect(result).toHaveLength(0);
		});

		test("does NOT delete image already deleted", async () => {
			const t = convexTest(schema, modules);
			const userId = await createUser(t, { telegramChatId: "991" });
			const now = Date.now();

			const voucherId = await createVoucher(t, {
				type: "10",
				uploaderId: userId,
				status: "expired",
				expiryDate: now - 100 * MS_PER_DAY,
			});

			await t.run(async (ctx) => {
				await ctx.db.patch(voucherId, {
					imageMarkedForDeletionAt: now - 40 * MS_PER_DAY,
					imageDeletedAt: now - 5 * MS_PER_DAY,
				});
			});

			const result = await t.query(
				internal.admin.getExpiredVouchersForCleanup,
				{ mode: "delete" },
			);

			expect(result).toHaveLength(0);
		});

		test("does NOT delete unmarked voucher", async () => {
			const t = convexTest(schema, modules);
			const userId = await createUser(t, { telegramChatId: "992" });
			const now = Date.now();

			await createVoucher(t, {
				type: "10",
				uploaderId: userId,
				status: "expired",
				expiryDate: now - 100 * MS_PER_DAY,
			});

			const result = await t.query(
				internal.admin.getExpiredVouchersForCleanup,
				{ mode: "delete" },
			);

			expect(result).toHaveLength(0);
		});
	});

	describe("Cross-reference checks prevent deletion", () => {
		test("skips deletion when another voucher uses same image", async () => {
			const t = convexTest(schema, modules);
			const userId = await createUser(t, { telegramChatId: "993" });
			const now = Date.now();

			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["shared-image"]));
			});

			const voucherId1 = await createVoucher(t, {
				type: "10",
				uploaderId: userId,
				status: "expired",
				expiryDate: now - 100 * MS_PER_DAY,
				imageStorageId,
			});

			await createVoucher(t, {
				type: "5",
				uploaderId: userId,
				status: "available",
				expiryDate: now + 30 * MS_PER_DAY,
				imageStorageId,
			});

			await t.run(async (ctx) => {
				await ctx.db.patch(voucherId1, {
					imageMarkedForDeletionAt: now - 40 * MS_PER_DAY,
				});
			});

			const deleteResult = await t.mutation(
				internal.admin.deleteVoucherImages,
				{
					vouchers: [{ voucherId: voucherId1, imageStorageId }],
				},
			);

			expect(deleteResult.deleted).toBe(0);
			expect(deleteResult.skipped).toBe(1);

			const url = await t.run(async (ctx) => {
				return await ctx.storage.getUrl(imageStorageId);
			});
			expect(url).not.toBeNull();
		});

		test("skips deletion when failed upload uses same image", async () => {
			const t = convexTest(schema, modules);
			const userId = await createUser(t, { telegramChatId: "994" });
			const now = Date.now();

			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["shared-failed-image"]));
			});

			const voucherId = await createVoucher(t, {
				type: "10",
				uploaderId: userId,
				status: "expired",
				expiryDate: now - 100 * MS_PER_DAY,
				imageStorageId,
			});

			await t.run(async (ctx) => {
				await ctx.db.insert("failedUploads", {
					userId,
					imageStorageId,
					failureType: "validation",
					failureReason: "EXPIRED",
				});
			});

			await t.run(async (ctx) => {
				await ctx.db.patch(voucherId, {
					imageMarkedForDeletionAt: now - 40 * MS_PER_DAY,
				});
			});

			const deleteResult = await t.mutation(
				internal.admin.deleteVoucherImages,
				{
					vouchers: [{ voucherId, imageStorageId }],
				},
			);

			expect(deleteResult.deleted).toBe(0);
			expect(deleteResult.skipped).toBe(1);
		});
	});

	describe("Actual deletion removes image from storage", () => {
		test("deletes image and sets imageDeletedAt", async () => {
			const t = convexTest(schema, modules);
			const userId = await createUser(t, { telegramChatId: "995" });
			const now = Date.now();

			const imageStorageId = await t.run(async (ctx) => {
				return await ctx.storage.store(new Blob(["delete-me"]));
			});

			const voucherId = await createVoucher(t, {
				type: "10",
				uploaderId: userId,
				status: "expired",
				expiryDate: now - 100 * MS_PER_DAY,
				imageStorageId,
			});

			await t.run(async (ctx) => {
				await ctx.db.patch(voucherId, {
					imageMarkedForDeletionAt: now - 40 * MS_PER_DAY,
				});
			});

			const deleteResult = await t.mutation(
				internal.admin.deleteVoucherImages,
				{
					vouchers: [{ voucherId, imageStorageId }],
				},
			);

			expect(deleteResult.deleted).toBe(1);
			expect(deleteResult.skipped).toBe(0);

			const voucher = await t.run(async (ctx) => {
				return await ctx.db.get(voucherId);
			});
			expect(voucher?.imageDeletedAt).toBeDefined();

			const url = await t.run(async (ctx) => {
				return await ctx.storage.getUrl(imageStorageId);
			});
			expect(url).toBeNull();
		});
	});

	describe("Marking mutation sets imageMarkedForDeletionAt", () => {
		test("marks multiple vouchers at once", async () => {
			const t = convexTest(schema, modules);
			const userId = await createUser(t, { telegramChatId: "996" });
			const now = Date.now();

			const id1 = await createVoucher(t, {
				type: "10",
				uploaderId: userId,
				status: "expired",
				expiryDate: now - 100 * MS_PER_DAY,
			});
			const id2 = await createVoucher(t, {
				type: "5",
				uploaderId: userId,
				status: "expired",
				expiryDate: now - 100 * MS_PER_DAY,
			});

			await t.mutation(internal.admin.markVoucherImagesForDeletion, {
				voucherIds: [id1, id2],
			});

			const v1 = await t.run(async (ctx) => ctx.db.get(id1));
			const v2 = await t.run(async (ctx) => ctx.db.get(id2));

			expect(v1?.imageMarkedForDeletionAt).toBeDefined();
			expect(v2?.imageMarkedForDeletionAt).toBeDefined();
		});
	});
});
