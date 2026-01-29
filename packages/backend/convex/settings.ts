import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, query } from "./_generated/server";

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

export const setSetting = internalMutation({
	args: { key: v.string(), value: v.string() },
	handler: async (ctx, { key, value }) => {
		const existing = await ctx.db
			.query("settings")
			.withIndex("by_key", (q) => q.eq("key", key))
			.first();
		if (existing) {
			await ctx.db.patch(existing._id, { value });
		} else {
			await ctx.db.insert("settings", { key, value });
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
