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
import { CLAIM_COSTS, UPLOAD_REWARDS } from "../src/lib/constants";
import { applyCoinDelta } from "../src/lib/coinLedger";
import {
	buildAnalyticsEventCounts,
	buildMessageAnalytics,
} from "../src/lib/messageAnalytics";
import { runCleanup } from "../src/lib/voucherImageCleanup";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
	action,
	internalMutation,
	internalQuery,
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
