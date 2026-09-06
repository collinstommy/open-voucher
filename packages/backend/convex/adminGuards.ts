import { v } from "convex/values";
import {
	customAction,
	customMutation,
	customQuery,
} from "convex-helpers/server/customFunctions";
import {
	assertValidSession,
	verifyAdminSession,
} from "../src/lib/adminAuth";
import { internal } from "./_generated/api";
import {
	action,
	mutation,
	query,
} from "./_generated/server";

export const adminQuery = customQuery(query, {
	args: { token: v.string() },
	input: async (ctx, { token }) => {
		await verifyAdminSession(ctx, token);
		return { ctx: {}, args: {} };
	},
});

export const adminMutation = customMutation(mutation, {
	args: { token: v.string() },
	input: async (ctx, { token }) => {
		await verifyAdminSession(ctx, token);
		return { ctx: {}, args: {} };
	},
});

export const adminAction = customAction(action, {
	args: { token: v.string() },
	input: async (ctx, { token }) => {
		const session = await ctx.runQuery(internal.adminSession.getSessionByToken, {
			token,
		});
		assertValidSession(session);
		return { ctx: {}, args: { token } };
	},
});
