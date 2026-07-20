import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { userMutation } from "./auth";

export const recordEvent = userMutation({
	args: {
		action: v.string(),
	},
	handler: async (ctx, { userId, action }) => {
		await ctx.db.insert("analytics", {
			action,
			userId,
			createdAt: Date.now(),
		});
	},
});

export const recordServerEvent = internalMutation({
	args: {
		action: v.string(),
		userId: v.optional(v.id("users")),
	},
	handler: async (ctx, { action, userId }) => {
		await ctx.db.insert("analytics", {
			action,
			userId,
			createdAt: Date.now(),
		});
	},
});
