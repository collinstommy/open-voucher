import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

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

export const getHealthCheckData = internalQuery({
	args: { token: v.string() },
	handler: async (ctx, { token }) => {
		const session = await ctx.db
			.query("adminSessions")
			.withIndex("by_token", (q) => q.eq("token", token))
			.first();

		if (!session) {
			return { valid: false, error: "Invalid session" };
		}

		if (session.expiresAt < Date.now()) {
			return { valid: false, error: "Session expired" };
		}

		const now = Date.now();
		const vouchers = await ctx.db
			.query("vouchers")
			.withIndex("by_status_created", (q) => q.eq("status", "available"))
			.collect();

		const voucherCount = vouchers.filter(
			(v) => (v.expiryDate as number) > now,
		).length;

		return { valid: true, voucherCount };
	},
});
