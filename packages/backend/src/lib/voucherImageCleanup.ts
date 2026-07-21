import type { Id } from "../../convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../convex/_generated/server";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MARK_DELAY_DAYS = 90;
const DELETE_DELAY_DAYS = 30;
const BATCH_SIZE = 100;

type CleanupCtx = { db: QueryCtx["db"] };

export async function getExpiredVouchersForCleanup(
	ctx: CleanupCtx,
	mode: "mark" | "delete",
) {
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
			.take(BATCH_SIZE);

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
}

export async function markVoucherImagesForDeletion(
	ctx: MutationCtx,
	voucherIds: Id<"vouchers">[],
) {
	const now = Date.now();
	for (const id of voucherIds) {
		await ctx.db.patch(id, { imageMarkedForDeletionAt: now });
	}
	return { marked: voucherIds.length };
}

export async function deleteVoucherImages(
	ctx: MutationCtx,
	vouchers: Array<{ voucherId: Id<"vouchers">; imageStorageId: Id<"_storage"> }>,
) {
	const now = Date.now();
	let deleted = 0;
	let skipped = 0;

	for (const { voucherId, imageStorageId } of vouchers) {
		const otherVoucher = await ctx.db
			.query("vouchers")
			.withIndex("by_image_storage", (q) =>
				q.eq("imageStorageId", imageStorageId),
			)
			.filter((q) => q.neq(q.field("_id"), voucherId))
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
			.withIndex("by_image_storage", (q) =>
				q.eq("imageStorageId", imageStorageId),
			)
			.first();

		if (failedUpload) {
			console.log(
				`Skipping image ${imageStorageId}: still referenced by failed upload ${failedUpload._id}`,
			);
			skipped++;
			continue;
		}

		const imageUrl = await ctx.storage.getUrl(imageStorageId);
		if (imageUrl !== null) {
			await ctx.storage.delete(imageStorageId);
		} else {
			console.log(
				`Image ${imageStorageId} already absent from storage; marking voucher ${voucherId} as deleted`,
			);
		}
		await ctx.db.patch(voucherId, { imageDeletedAt: now });
		deleted++;
	}

	return { deleted, skipped };
}

export async function runCleanup(
	ctx: MutationCtx,
	dryRun: boolean,
) {
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

	const toMark = await getExpiredVouchersForCleanup(ctx, "mark");
	result.toMark = toMark.map((v) => ({
		id: v._id,
		expiryDate: v.expiryDate,
	}));

	if (!isDryRun && toMark.length > 0) {
		await markVoucherImagesForDeletion(
			ctx,
			toMark.map((v) => v._id),
		);
		result.marked = toMark.length;
	}

	const toDelete = await getExpiredVouchersForCleanup(ctx, "delete");
	result.toDelete = toDelete.map((v) => ({
		id: v._id,
		imageStorageId: v.imageStorageId,
	}));

	if (!isDryRun && toDelete.length > 0) {
		const deleteResult = await deleteVoucherImages(
			ctx,
			toDelete.map((v) => ({
				voucherId: v._id,
				imageStorageId: v.imageStorageId,
			})),
		);
		result.deleted = deleteResult.deleted;
		result.skipped = deleteResult.skipped;
	}

	console.log(
		`[Cleanup ${isDryRun ? "DRY RUN" : "EXECUTED"}] ` +
			`Marked: ${result.marked}, Deleted: ${result.deleted}, Skipped: ${result.skipped}`,
	);

	return result;
}
