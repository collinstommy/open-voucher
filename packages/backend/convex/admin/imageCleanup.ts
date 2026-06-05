import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";
import { adminAction, verifyAdminSession } from "./auth";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MARK_DELAY_DAYS = 90;
const DELETE_DELAY_DAYS = 30;
const BATCH_SIZE = 100;

export const getExpiredVouchersForCleanup = internalQuery({
	args: {
		mode: v.union(v.literal("mark"), v.literal("delete")),
	},
	handler: async (ctx, { mode }) => {
		const now = Date.now();

		if (mode === "mark") {
			const cutoff = now - MARK_DELAY_DAYS * MS_PER_DAY;
			const vouchers = await ctx.db
				.query("vouchers")
				.filter((q) =>
					q.and(
						q.or(
							q.eq(q.field("status"), "expired"),
							q.eq(q.field("status"), "claimed"),
							q.eq(q.field("status"), "uploader_admitted_used"),
						),
						q.lt(q.field("expiryDate"), cutoff),
						q.eq(q.field("imageMarkedForDeletionAt"), undefined),
						q.eq(q.field("imageDeletedAt"), undefined),
					),
				)
				.collect();

			return vouchers.map((v) => ({
				_id: v._id,
				imageStorageId: v.imageStorageId,
				expiryDate: v.expiryDate,
				status: v.status,
			}));
		}

		const cutoff = now - DELETE_DELAY_DAYS * MS_PER_DAY;
		const vouchers = await ctx.db
			.query("vouchers")
			.filter((q) =>
				q.and(
					q.neq(q.field("imageMarkedForDeletionAt"), undefined),
					q.lt(q.field("imageMarkedForDeletionAt"), cutoff),
					q.eq(q.field("imageDeletedAt"), undefined),
				),
			)
			.take(BATCH_SIZE);

		return vouchers.map((v) => ({
			_id: v._id,
			imageStorageId: v.imageStorageId,
			expiryDate: v.expiryDate,
			status: v.status,
			imageMarkedForDeletionAt: v.imageMarkedForDeletionAt,
		}));
	},
});

export const markVoucherImagesForDeletion = internalMutation({
	args: {
		voucherIds: v.array(v.id("vouchers")),
	},
	handler: async (ctx, { voucherIds }) => {
		const now = Date.now();
		for (const id of voucherIds) {
			await ctx.db.patch(id, { imageMarkedForDeletionAt: now });
		}
		return { marked: voucherIds.length };
	},
});

export const deleteVoucherImages = internalMutation({
	args: {
		vouchers: v.array(
			v.object({
				voucherId: v.id("vouchers"),
				imageStorageId: v.id("_storage"),
			}),
		),
	},
	handler: async (ctx, { vouchers }) => {
		const now = Date.now();
		let deleted = 0;
		let skipped = 0;

		for (const { voucherId, imageStorageId } of vouchers) {
			const otherVoucher = await ctx.db
				.query("vouchers")
				.filter((q) =>
					q.and(
						q.eq(q.field("imageStorageId"), imageStorageId),
						q.neq(q.field("_id"), voucherId),
					),
				)
				.first();

			if (otherVoucher) {
				console.log(
					`Skipping image ${imageStorageId}: still referenced by voucher ${otherVoucher._id}`,
				);
				skipped++;
				continue;
			}

			const failedUpload = await ctx.db
				.query("failedUploads")
				.filter((q) => q.eq(q.field("imageStorageId"), imageStorageId))
				.first();

			if (failedUpload) {
				console.log(
					`Skipping image ${imageStorageId}: still referenced by failed upload ${failedUpload._id}`,
				);
				skipped++;
				continue;
			}

			await ctx.storage.delete(imageStorageId);
			await ctx.db.patch(voucherId, { imageDeletedAt: now });
			deleted++;
		}

		return { deleted, skipped };
	},
});

export const cleanupExpiredVoucherImages = adminAction({
	args: {
		token: v.string(),
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, { token, dryRun }) => {
		await verifyAdminSession(ctx, token);
		const isDryRun = dryRun !== false;

		const result: {
			dryRun: boolean;
			marked: number;
			deleted: number;
			skipped: number;
			toMark: Array<{ id: string; expiryDate: number }>;
			toDelete: Array<{ id: string; imageStorageId: string }>;
		} = {
			dryRun: isDryRun,
			marked: 0,
			deleted: 0,
			skipped: 0,
			toMark: [],
			toDelete: [],
		};

		const toMark = await ctx.runQuery(
			internal.admin.imageCleanup.getExpiredVouchersForCleanup,
			{ mode: "mark" },
		);

		result.toMark = (toMark as Array<{ _id: Id<"vouchers">; expiryDate: number }>).map((v) => ({
			id: v._id,
			expiryDate: v.expiryDate,
		}));

		if (!isDryRun && toMark.length > 0) {
			await ctx.runMutation(
				internal.admin.imageCleanup.markVoucherImagesForDeletion,
				{
					voucherIds: (toMark as Array<{ _id: Id<"vouchers"> }>).map((v) => v._id),
				},
			);
			result.marked = toMark.length;
		}

		const toDelete = await ctx.runQuery(
			internal.admin.imageCleanup.getExpiredVouchersForCleanup,
			{ mode: "delete" },
		);

		result.toDelete = (toDelete as Array<{ _id: Id<"vouchers">; imageStorageId: Id<"_storage"> }>).map((v) => ({
			id: v._id,
			imageStorageId: v.imageStorageId,
		}));

		if (!isDryRun && toDelete.length > 0) {
			const deleteResult = await ctx.runMutation(
				internal.admin.imageCleanup.deleteVoucherImages,
				{
					vouchers: (toDelete as Array<{ _id: Id<"vouchers">; imageStorageId: Id<"_storage"> }>).map((v) => ({
						voucherId: v._id,
						imageStorageId: v.imageStorageId,
					})),
				},
			);
			result.deleted = deleteResult.deleted;
			result.skipped = deleteResult.skipped;
		}

		console.log(
			`[Cleanup ${isDryRun ? "DRY RUN" : "EXECUTED"}] ` +
				`Marked: ${result.marked}, Deleted: ${result.deleted}, Skipped: ${result.skipped}`,
		);

		return result;
	},
});
