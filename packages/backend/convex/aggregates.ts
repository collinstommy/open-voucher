import { TableAggregate } from "@convex-dev/aggregate";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";

/**
 * Denormalized counts over the `vouchers` table, keyed by [status, type].
 * Replaces full-table `.collect()` scans for count shapes (availability page,
 * admin stats). Reads are O(log n); every voucher write must keep it in sync
 * via the trackVoucher* helpers below (idempotent variants, so a missed site
 * is repairable by the backfill instead of drifting forever).
 */
export const voucherAggregate = new TableAggregate<{
	Key: [string, string];
	DataModel: DataModel;
	TableName: "vouchers";
}>(components.voucherAgg, {
	sortKey: (doc) => [doc.status, doc.type],
});

export async function trackVoucherInsert(
	ctx: MutationCtx,
	doc: Doc<"vouchers">,
): Promise<void> {
	await voucherAggregate.insertIfDoesNotExist(ctx, doc);
}

/**
 * Call after patching a voucher doc. `before` is the pre-patch doc the caller
 * already had in hand; omit it and the helper fetches it.
 */
export async function trackVoucherPatch(
	ctx: MutationCtx,
	voucherId: Id<"vouchers">,
	before?: Doc<"vouchers"> | null,
): Promise<void> {
	const oldDoc = before ?? (await ctx.db.get(voucherId));
	if (!oldDoc) return;
	const after = await ctx.db.get(voucherId);
	if (!after) return;
	await voucherAggregate.replaceOrInsert(ctx, oldDoc, after);
}

export async function trackVoucherDelete(
	ctx: MutationCtx,
	before: Doc<"vouchers">,
): Promise<void> {
	await voucherAggregate.deleteIfExists(ctx, before);
}

/**
 * One-time (resumable) backfill: walks the whole vouchers table and inserts
 * every doc into the aggregate. Run after the sync helpers are deployed:
 *   npx convex run aggregates:backfillVouchers --prod
 * Re-running is safe (insertIfDoesNotExist).
 */
export const backfillVouchers = internalMutation({
	args: { cursor: v.optional(v.string()) },
	handler: async (ctx, { cursor }) => {
		const page = await ctx.db
			.query("vouchers")
			.paginate({ numItems: 500, cursor: cursor ?? null });

		for (const voucher of page.page) {
			await voucherAggregate.insertIfDoesNotExist(ctx, voucher);
		}

		if (!page.isDone) {
			await ctx.scheduler.runAfter(0, internal.aggregates.backfillVouchers, {
				cursor: page.continueCursor,
			});
			return { done: false, processed: page.page.length };
		}
		return { done: true, processed: page.page.length };
	},
});
