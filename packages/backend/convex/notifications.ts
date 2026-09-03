import { v } from "convex/values";
import { outboxKindValidator, outboxPayloadValidator } from "../src/lib/outbox";
import { internalMutation } from "./_generated/server";
import { userMutation, userQuery } from "./auth";

export const insertOutboxRow = internalMutation({
	args: {
		userId: v.id("users"),
		kind: outboxKindValidator,
		payload: outboxPayloadValidator,
	},
	handler: async (ctx, args) => {
		await ctx.db.insert("notificationOutbox", args);
	},
});

export const getMyNotifications = userQuery({
	args: {},
	handler: async (ctx, { userId }) => {
		return await ctx.db
			.query("notificationOutbox")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.order("desc")
			.collect();
	},
});

export const markNotificationRead = userMutation({
	args: { notificationId: v.id("notificationOutbox") },
	handler: async (ctx, { userId, notificationId }) => {
		const row = await ctx.db.get(notificationId);
		if (!row || row.userId !== userId) {
			throw new Error("Notification not found");
		}
		if (row.readAt === undefined) {
			await ctx.db.patch(notificationId, { readAt: Date.now() });
		}
		return { success: true as const };
	},
});
