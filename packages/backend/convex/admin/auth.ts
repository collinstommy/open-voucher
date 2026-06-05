import { v } from "convex/values";
import {
	customAction,
	customMutation,
	customQuery,
} from "convex-helpers/server/customFunctions";
import { internal } from "../_generated/api";
import type { ActionCtx, QueryCtx } from "../_generated/server";
import {
	action,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "../_generated/server";

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

export const getSessionByToken = internalQuery({
	args: { token: v.string() },
	handler: async (ctx, { token }) => {
		return await ctx.db
			.query("adminSessions")
			.withIndex("by_token", (q) => q.eq("token", token))
			.first();
	},
});

export const login = mutation({
	args: {
		password: v.string(),
	},
	handler: async (ctx, { password }) => {
		const adminPassword = process.env.ADMIN_PASSWORD;

		if (!adminPassword) {
			throw new Error(
				"Admin password not configured. Set ADMIN_PASSWORD environment variable.",
			);
		}

		if (password !== adminPassword) {
			throw new Error("Invalid password");
		}

		const token = crypto.randomUUID();
		const now = Date.now();

		await ctx.db.insert("adminSessions", {
			token,
			createdAt: now,
			expiresAt: now + SESSION_DURATION_MS,
		});

		return {
			token,
			expiresAt: now + SESSION_DURATION_MS,
		};
	},
});

export const logout = mutation({
	args: {
		token: v.string(),
	},
	handler: async (ctx, { token }) => {
		const session = await ctx.db
			.query("adminSessions")
			.withIndex("by_token", (q) => q.eq("token", token))
			.first();

		if (!session) {
			return { success: true };
		}

		await ctx.db.delete(session._id);

		return { success: true };
	},
});

export async function verifyAdminSession(
	ctx: QueryCtx | ActionCtx,
	token: string,
): Promise<void> {
	const session = await ctx.runQuery(internal.admin.auth.getSessionByToken, {
		token,
	});

	if (!session) {
		throw new Error("Unauthorized: Invalid session token");
	}

	const now = Date.now();
	if (session.expiresAt < now) {
		throw new Error("Unauthorized: Session expired");
	}
}

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
		await verifyAdminSession(ctx, token);
		return { ctx: {}, args: { token } };
	},
});

export const checkSession = query({
	args: {
		token: v.string(),
	},
	handler: async (ctx, { token }) => {
		const session = await ctx.db
			.query("adminSessions")
			.withIndex("by_token", (q) => q.eq("token", token))
			.first();

		if (!session) {
			return null;
		}

		const now = Date.now();
		if (session.expiresAt < now) {
			return null;
		}

		return {
			valid: true,
			expiresAt: session.expiresAt,
			createdAt: session.createdAt,
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
