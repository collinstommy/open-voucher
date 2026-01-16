import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const getSetting = internalQuery({
	args: { key: v.string() },
	handler: async (ctx, { key }) => {
		const setting = await ctx.db
			.query("settings")
			.withIndex("by_key", (q) => q.eq("key", key))
			.first();
		return setting?.value;
	},
});

export const setSampleVoucherImage = internalMutation({
	args: { imageStorageId: v.id("_storage") },
	handler: async (ctx, { imageStorageId }) => {
		const existing = await ctx.db
			.query("settings")
			.withIndex("by_key", (q) => q.eq("key", "sample-voucher-image"))
			.first();
		if (existing) {
			await ctx.db.patch(existing._id, { value: imageStorageId });
		} else {
			await ctx.db.insert("settings", {
				key: "sample-voucher-image",
				value: imageStorageId,
			});
		}
	},
});

export const getSampleVoucherImageUrl = query({
	args: {},
	handler: async (ctx) => {
		const setting = await ctx.db
			.query("settings")
			.withIndex("by_key", (q) => q.eq("key", "sample-voucher-image"))
			.first();
		if (!setting?.value) return null;
		return await ctx.storage.getUrl(setting.value as Id<"_storage">);
	},
});
