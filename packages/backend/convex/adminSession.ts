import { v } from "convex/values";
import { lookupSessionByToken } from "../src/lib/adminAuth";
import { internalMutation, internalQuery } from "./_generated/server";

export const getSessionByToken = internalQuery({
	args: { token: v.string() },
	handler: async (ctx, { token }) => lookupSessionByToken(ctx, token),
});

export const getHealthCheckMetrics = internalQuery({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const vouchers = await ctx.db
			.query("vouchers")
			.withIndex("by_status_created", (q) => q.eq("status", "available"))
			.collect();
		const voucherCount = vouchers.filter((v) => v.expiryDate > now).length;

		const setting = await ctx.db
			.query("settings")
			.withIndex("by_key", (q) => q.eq("key", "test-voucher-image"))
			.first();

		return {
			voucherCount,
			testImageSetting: setting?.value,
		};
	},
});

export const cleanupExpiredSessions = internalMutation({
	handler: async (ctx) => {
		const now = Date.now();
		const expiredSessions = await ctx.db
			.query("adminSessions")
			.filter((q) => q.lt(q.field("expiresAt"), now))
			.collect();

		for (const session of expiredSessions) {
			await ctx.db.delete(session._id);
		}

		return { deletedCount: expiredSessions.length };
	},
});
