import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { v } from "convex/values";
import {
    internalMutation,
    mutation,
    query,
    QueryCtx
} from "./_generated/server";


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
			await new Promise((resolve) => setTimeout(resolve, 1000));
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
	ctx: QueryCtx,
	token: string,
): Promise<void> {
	const session = await ctx.db
		.query("adminSessions")
		.withIndex("by_token", (q) => q.eq("token", token))
		.first();

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

export const getAllUsers = adminQuery({
	args: {},
	handler: async (ctx) => {
		const users = await ctx.db.query("users").collect();

		return {
			users: users.map((u) => ({
				_id: u._id,
				telegramChatId: u.telegramChatId,
				username: u.username,
				firstName: u.firstName,
				coins: u.coins,
				isBanned: u.isBanned,
				createdAt: u.createdAt,
				lastActiveAt: u.lastActiveAt,
			})),
			totalCount: users.length,
		};
	},
});

export const banUser = adminMutation({
	args: {
		userId: v.id("users"),
	},
	handler: async (ctx, { userId }) => {
		await ctx.db.patch(userId, { isBanned: true });
		return { success: true };
	},
});

export const unbanUser = adminMutation({
	args: {
		userId: v.id("users"),
	},
	handler: async (ctx, { userId }) => {
		await ctx.db.patch(userId, { isBanned: false });
		return { success: true };
	},
});

export const getTodaysVouchers = adminQuery({
	args: {},
	handler: async (ctx) => {
		const now = new Date();
		const startOfDay = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
		).getTime();

		const vouchers = await ctx.db
			.query("vouchers")
			.filter((q) => q.gte(q.field("createdAt"), startOfDay))
			.collect();

		const vouchersWithImages = await Promise.all(
			vouchers.map(async (v) => ({
				_id: v._id,
				type: v.type,
				status: v.status,
				createdAt: v.createdAt,
				expiryDate: v.expiryDate,
				imageUrl: await ctx.storage.getUrl(v.imageStorageId),
			})),
		);

		return { vouchers: vouchersWithImages };
	},
});

export const getUsersWithStats = adminQuery({
	args: {},
	handler: async (ctx) => {
		const users = await ctx.db.query("users").collect();

		const usersWithStats = await Promise.all(
			users.map(async (u) => {
				const uploaded = await ctx.db
					.query("vouchers")
					.withIndex("by_uploader", (q) => q.eq("uploaderId", u._id))
					.collect();

				const claimed = await ctx.db
					.query("vouchers")
					.filter((q) => q.eq(q.field("claimerId"), u._id))
					.collect();

				const uploadReports = await ctx.db
					.query("reports")
					.withIndex("by_uploader", (q) => q.eq("uploaderId", u._id))
					.collect();

				const claimReports = await ctx.db
					.query("reports")
					.withIndex("by_reporterId", (q) => q.eq("reporterId", u._id))
					.collect();

				return {
					_id: u._id,
					telegramChatId: u.telegramChatId,
					username: u.username,
					firstName: u.firstName,
					coins: u.coins,
					isBanned: u.isBanned,
					createdAt: u.createdAt,
					uploadCount: uploaded.length,
					claimCount: claimed.length,
					uploadReportCount: uploadReports.length,
					claimReportCount: claimReports.length,
				};
			}),
		);

		return { users: usersWithStats };
	},
});

export const getAllFeedback = adminQuery({
	args: {},
	handler: async (ctx) => {
		const feedback = await ctx.db
			.query("feedback")
			.order("desc")
			.collect();

		const feedbackWithUsers = await Promise.all(
			feedback.map(async (f) => {
				const user = await ctx.db.get(f.userId);
				return {
					_id: f._id,
					text: f.text,
					status: f.status,
					createdAt: f.createdAt,
					user: user
						? {
								telegramChatId: user.telegramChatId,
								username: user.username,
								firstName: user.firstName,
							}
						: null,
				};
			}),
		);

		return { feedback: feedbackWithUsers };
	},
});

export const updateFeedbackStatus = adminMutation({
	args: {
		feedbackId: v.id("feedback"),
		status: v.string(),
	},
	handler: async (ctx, { feedbackId, status }) => {
		await ctx.db.patch(feedbackId, { status });
		return { success: true };
	},
});

export const getUserDetails = adminQuery({
	args: {
		userId: v.id("users"),
	},
	handler: async (ctx, { userId }) => {
		const user = await ctx.db.get(userId);
		if (!user) {
			throw new Error("User not found");
		}

		const uploadedVouchers = await ctx.db
			.query("vouchers")
			.withIndex("by_uploader", (q) => q.eq("uploaderId", userId))
			.collect();

		const claimedVouchers = await ctx.db
			.query("vouchers")
			.filter((q) => q.eq(q.field("claimerId"), userId))
			.collect();

		const reportsAgainstUploads = await ctx.db
			.query("reports")
			.withIndex("by_uploader", (q) => q.eq("uploaderId", userId))
			.collect();

		const reportsFiledByUser = await ctx.db
			.query("reports")
			.withIndex("by_reporterId", (q) => q.eq("reporterId", userId))
			.collect();

		const reportsFiledByUser = await Promise.all(
			reportsFiledByUser.map(async (report) => {
				const voucher = await ctx.db.get(report.voucherId);
				const uploader = voucher ? await ctx.db.get(voucher.uploaderId) : null;
				const imageUrl = voucher
					? await ctx.storage.getUrl(voucher.imageStorageId)
					: null;
				return {
					_id: report._id,
					voucherId: report.voucherId,
					reason: report.reason,
					createdAt: report.createdAt,
					voucher: voucher
						? {
								type: voucher.type,
								status: voucher.status,
								imageUrl,
								expiryDate: voucher.expiryDate,
							}
						: null,
					uploader: uploader
						? {
								username: uploader.username,
								firstName: uploader.firstName,
								telegramChatId: uploader.telegramChatId,
							}
						: null,
				};
			}),
		);

		const reportsAgainstUserUploads = await Promise.all(
			reportsAgainstUploads.map(async (report) => {
				const voucher = await ctx.db.get(report.voucherId);
				const reporter = await ctx.db.get(report.reporterId);
				const imageUrl = voucher
					? await ctx.storage.getUrl(voucher.imageStorageId)
					: null;
				return {
					_id: report._id,
					voucherId: report.voucherId,
					reason: report.reason,
					createdAt: report.createdAt,
					voucher: voucher
						? {
								type: voucher.type,
								status: voucher.status,
								imageUrl,
								expiryDate: voucher.expiryDate,
							}
						: null,
					reporter: reporter
						? {
								username: reporter.username,
								firstName: reporter.firstName,
								telegramChatId: reporter.telegramChatId,
							}
						: null,
				};
			}),
		);

		return {
			user: {
				_id: user._id,
				telegramChatId: user.telegramChatId,
				username: user.username,
				firstName: user.firstName,
				coins: user.coins,
				isBanned: user.isBanned,
				createdAt: user.createdAt,
				lastActiveAt: user.lastActiveAt,
			},
			stats: {
				uploadedCount: uploadedVouchers.length,
				claimedCount: claimedVouchers.length,
				reportsAgainstUploadsCount: reportsAgainstUploads.length,
				reportsFiledCount: reportsFiledByUser.length,
			},
			reportsFiledByUser,
			reportsAgainstUploads: reportsAgainstUserUploads,
		};
	},
});
