import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

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
