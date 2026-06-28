import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const logError = internalMutation({
	args: {
		errorType: v.string(),
		text: v.string(),
	},
	handler: async (ctx, { errorType, text }) => {
		await ctx.db.insert("errors", {
			errorType,
			text,
		});
	},
});
