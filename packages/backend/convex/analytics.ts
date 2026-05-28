import { v } from "convex/values";
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
