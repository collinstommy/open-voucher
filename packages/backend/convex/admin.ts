import { v } from "convex/values";
import {
	customAction,
	customMutation,
	customQuery,
} from "convex-helpers/server/customFunctions";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import {
	action,
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";

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
	const session = await ctx.runQuery(internal.admin.getSessionByToken, {
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
				uploaderId: v.uploaderId,
				claimerId: v.claimerId,
				imageUrl: await ctx.storage.getUrl(v.imageStorageId),
			})),
		);

		return { vouchers: vouchersWithImages };
	},
});

export const getAllVouchers = adminQuery({
	args: {
		paginationOpts: v.object({
			numItems: v.number(),
			cursor: v.nullable(v.string()),
			id: v.number(),
		}),
	},
	handler: async (ctx, { paginationOpts }) => {
		const { cursor, ...rest } = paginationOpts;
		const results = await ctx.db
			.query("vouchers")
			.order("desc")
			.paginate({ ...rest, cursor: cursor ?? null });

		const vouchersWithImages = await Promise.all(
			results.page.map(async (v) => {
				const uploader = await ctx.db.get(v.uploaderId);
				return {
					_id: v._id,
					type: v.type,
					status: v.status,
					createdAt: v.createdAt,
					expiryDate: v.expiryDate,
					uploaderId: v.uploaderId,
					uploaderFirstName: uploader?.firstName,
					claimerId: v.claimerId,
					imageUrl: await ctx.storage.getUrl(v.imageStorageId),
				};
			}),
		);

		return {
			page: vouchersWithImages,
			continueCursor: results.continueCursor,
			isDone: results.isDone,
		};
	},
});

export const getUsersWithStats = adminQuery({
	args: {},
	handler: async (ctx) => {
		const users = await ctx.db.query("users").collect();

		const usersWithStats = users.map((u) => ({
			_id: u._id,
			telegramChatId: u.telegramChatId,
			username: u.username,
			firstName: u.firstName,
			coins: u.coins,
			isBanned: u.isBanned,
			createdAt: u.createdAt,
			uploadCount: u.uploadCount || 0,
			claimCount: u.claimCount || 0,
			uploadReportCount: u.uploadReportCount || 0,
			claimReportCount: u.claimReportCount || 0,
		}));

		return { users: usersWithStats };
	},
});

export const getAllFeedback = adminQuery({
	args: {},
	handler: async (ctx) => {
		const feedback = await ctx.db.query("feedback").order("desc").collect();

		const feedbackWithUsers = await Promise.all(
			feedback.map(async (f) => {
				const user = await ctx.db.get(f.userId);
				return {
					_id: f._id,
					text: f.text,
					status: f.status,
					type: f.type,
					createdAt: f.createdAt,
					user: user
						? {
								telegramChatId: user.telegramChatId,
								username: user.username,
								firstName: user.firstName,
								isBanned: user.isBanned,
								id: user._id,
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

		// Get voucher details with images for uploaded vouchers
		const uploadedVouchersWithDetails = await Promise.all(
			uploadedVouchers.map(async (voucher) => {
				const imageUrl = await ctx.storage.getUrl(voucher.imageStorageId);
				return {
					_id: voucher._id,
					type: voucher.type,
					status: voucher.status,
					imageUrl,
					expiryDate: voucher.expiryDate,
					createdAt: voucher.createdAt,
				};
			}),
		);

		// Get voucher details with images for claimed vouchers
		// Only include successfully claimed vouchers (not reported)
		const claimedVouchersWithDetails = await Promise.all(
			claimedVouchers.map(async (voucher) => {
				const imageUrl = await ctx.storage.getUrl(voucher.imageStorageId);
				return {
					_id: voucher._id,
					type: voucher.type,
					status: voucher.status,
					imageUrl,
					expiryDate: voucher.expiryDate,
					claimedAt: voucher.claimedAt,
				};
			}),
		);

		const reportsAgainstUploads = await ctx.db
			.query("reports")
			.withIndex("by_uploader", (q) => q.eq("uploaderId", userId))
			.collect();

		const reportsFiledByUserRaw = await ctx.db
			.query("reports")
			.withIndex("by_reporterId", (q) => q.eq("reporterId", userId))
			.collect();

		const reportsFiledByUser = await Promise.all(
			reportsFiledByUserRaw.map(async (report) => {
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

		// Get feedback and support messages from this user
		const feedbackAndSupport = await ctx.db
			.query("feedback")
			.filter((q) => q.eq(q.field("userId"), userId))
			.order("desc")
			.collect();

		// Get admin messages sent to this user
		const adminMessages = await ctx.db
			.query("messages")
			.withIndex("by_admin_message", (q) =>
				q.eq("isAdminMessage", true).eq("telegramChatId", user.telegramChatId),
			)
			.order("desc")
			.collect();

		// Get all transactions for this user
		const transactions = await ctx.db
			.query("transactions")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.order("desc")
			.collect();

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
				uploadedCount: user.uploadCount || 0,
				claimedCount: user.claimCount || 0,
				reportsAgainstUploadsCount: user.uploadReportCount || 0,
				reportsFiledCount: user.claimReportCount || 0,
			},
			uploadedVouchers: uploadedVouchersWithDetails,
			claimedVouchers: claimedVouchersWithDetails,
			reportsFiledByUser,
			reportsAgainstUploads: reportsAgainstUserUploads,
			feedbackAndSupport,
			adminMessages,
			transactions,
		};
	},
});

async function getBannedUsersData(ctx: QueryCtx) {
	const bannedUsers = await ctx.db
		.query("users")
		.filter((q) => q.eq(q.field("isBanned"), true))
		.collect();

	return bannedUsers.sort((a, b) => (b.bannedAt || 0) - (a.bannedAt || 0));
}

export const getBannedUsersInternal = internalQuery({
	args: {},
	handler: async (ctx) => {
		return getBannedUsersData(ctx);
	},
});

export const getBannedUsers = adminQuery({
	args: {},
	handler: async (ctx) => {
		const bannedUsers = await getBannedUsersData(ctx as unknown as QueryCtx);

		return bannedUsers.map((user) => ({
			_id: user._id,
			telegramChatId: user.telegramChatId,
			username: user.username,
			firstName: user.firstName,
			bannedAt: user.bannedAt,
		}));
	},
});

export const sendMessageToUser = adminMutation({
	args: {
		userId: v.id("users"),
		messageText: v.string(),
	},
	handler: async (ctx, { userId, messageText }) => {
		// Get user details
		const user = await ctx.db.get(userId);
		if (!user) {
			throw new Error("User not found");
		}

		// Create outbound message in messages table
		await ctx.db.insert("messages", {
			telegramMessageId: 0, // Placeholder for admin messages
			telegramChatId: user.telegramChatId,
			direction: "outbound",
			messageType: "text",
			text: messageText,
			isAdminMessage: true,
			createdAt: Date.now(),
		});

		// Send message via Telegram
		await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
			chatId: user.telegramChatId,
			text: messageText,
		});

		return { success: true };
	},
});

export const clearReportAndUpdateVoucher = adminMutation({
	args: {
		reportId: v.id("reports"),
		newVoucherStatus: v.union(v.literal("expired"), v.literal("available")),
	},
	handler: async (ctx, { reportId, newVoucherStatus }) => {
		const report = await ctx.db.get(reportId);
		if (!report) {
			throw new Error("Report not found");
		}

		const voucher = await ctx.db.get(report.voucherId);
		if (!voucher) {
			throw new Error("Voucher not found");
		}

		await ctx.db.patch(report.voucherId, { status: newVoucherStatus });

		await ctx.db.delete(reportId);

		return {
			success: true,
			voucherId: report.voucherId,
			newStatus: newVoucherStatus,
		};
	},
});

export const backfillUserStats = internalMutation({
	args: {},
	handler: async (ctx) => {
		let processed = 0;
		let total = 0;

		// Get total count first
		const allUsers = await ctx.db.query("users").collect();
		total = allUsers.length;

		// Pre-aggregate all data in one pass
		console.log("Aggregating voucher data...");
		const allVouchers = await ctx.db.query("vouchers").collect();
		console.log(`Found ${allVouchers.length} vouchers`);

		console.log("Aggregating report data...");
		const allReports = await ctx.db.query("reports").collect();
		console.log(`Found ${allReports.length} reports`);

		// Create counters for each user
		const userStats = new Map();

		// Initialize counters for all users
		for (const user of allUsers) {
			userStats.set(user._id.toString(), {
				uploadCount: 0,
				claimCount: 0,
				uploadReportCount: 0,
				claimReportCount: 0,
			});
		}

		// Count vouchers
		for (const voucher of allVouchers) {
			const uploaderId = voucher.uploaderId.toString();
			const uploaderStats = userStats.get(uploaderId);
			if (uploaderStats) {
				uploaderStats.uploadCount++;
			}

			if (voucher.claimerId) {
				const claimerId = voucher.claimerId.toString();
				const claimerStats = userStats.get(claimerId);
				if (claimerStats) {
					claimerStats.claimCount++;
				}
			}
		}

		// Count reports
		for (const report of allReports) {
			const uploaderId = report.uploaderId.toString();
			const reporterId = report.reporterId.toString();

			const uploaderStats = userStats.get(uploaderId);
			if (uploaderStats) {
				uploaderStats.uploadReportCount++;
			}

			const reporterStats = userStats.get(reporterId);
			if (reporterStats) {
				reporterStats.claimReportCount++;
			}
		}

		// Update users with their stats
		console.log("Updating user documents...");
		for (const user of allUsers) {
			const stats = userStats.get(user._id.toString());
			if (stats) {
				await ctx.db.patch(user._id, {
					uploadCount: stats.uploadCount,
					claimCount: stats.claimCount,
					uploadReportCount: stats.uploadReportCount,
					claimReportCount: stats.claimReportCount,
				});
				processed++;
			}
		}

		return {
			total,
			processed,
			completed: processed === total,
		};
	},
});

export const clearUserData = internalMutation({
	args: {
		userId: v.id("users"),
	},
	handler: async (ctx, { userId }) => {
		const isDevelopment = process.env.ENVIRONMENT === "development";

		if (!isDevelopment) {
			throw new Error(
				"clearUserData is only available in development. This operation is blocked in production.",
			);
		}

		const user = await ctx.db.get(userId);
		if (!user) {
			throw new Error("User not found");
		}

		const uploadedVouchers = await ctx.db
			.query("vouchers")
			.withIndex("by_uploader", (q) => q.eq("uploaderId", userId))
			.collect();

		for (const voucher of uploadedVouchers) {
			await ctx.db.delete(voucher._id);
		}

		const claimedVouchers = await ctx.db
			.query("vouchers")
			.filter((q) => q.eq(q.field("claimerId"), userId))
			.collect();

		for (const voucher of claimedVouchers) {
			await ctx.db.delete(voucher._id);
		}

		const reportsFiled = await ctx.db
			.query("reports")
			.withIndex("by_reporterId", (q) => q.eq("reporterId", userId))
			.collect();

		for (const report of reportsFiled) {
			await ctx.db.delete(report._id);
		}

		const reportsAgainstUploads = await ctx.db
			.query("reports")
			.withIndex("by_uploader", (q) => q.eq("uploaderId", userId))
			.collect();

		for (const report of reportsAgainstUploads) {
			await ctx.db.delete(report._id);
		}

		const transactions = await ctx.db
			.query("transactions")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		for (const transaction of transactions) {
			await ctx.db.delete(transaction._id);
		}

		await ctx.db.patch(userId, {
			uploadCount: 0,
			claimCount: 0,
			uploadReportCount: 0,
			claimReportCount: 0,
			lastReportAt: undefined,
		});

		console.log(`Cleared all data for user ${userId} (${user.username})`);

		return {
			success: true,
			deletedCounts: {
				uploadedVouchers: uploadedVouchers.length,
				claimedVouchers: claimedVouchers.length,
				reportsFiled: reportsFiled.length,
				reportsAgainstUploads: reportsAgainstUploads.length,
				transactions: transactions.length,
			},
		};
	},
});

export const getFailedUploads = adminQuery({
	args: {},
	handler: async (ctx) => {
		const failedUploads = await ctx.db
			.query("failedUploads")
			.order("desc")
			.take(50);

		const failedUploadsWithDetails = await Promise.all(
			failedUploads.map(async (failedUpload) => {
				const user = await ctx.db.get(failedUpload.userId);
				const imageUrl = await ctx.storage.getUrl(failedUpload.imageStorageId);

				return {
					_id: failedUpload._id,
					userId: failedUpload.userId,
					username: user?.username,
					firstName: user?.firstName,
					telegramChatId: user?.telegramChatId,
					imageUrl,
					failureType: failedUpload.failureType,
					failureReason: failedUpload.failureReason,
					errorMessage: failedUpload.errorMessage,
					extractedType: failedUpload.extractedType,
					_creationTime: failedUpload._creationTime,
				};
			}),
		);

		return { failedUploads: failedUploadsWithDetails };
	},
});

export const getHealthCheckData = internalQuery({
	args: { token: v.string() },
	handler: async (ctx, { token }) => {
		const session = await ctx.db
			.query("adminSessions")
			.withIndex("by_token", (q) => q.eq("token", token))
			.first();

		if (!session) {
			return { valid: false, error: "Invalid session" };
		}

		if (session.expiresAt < Date.now()) {
			return { valid: false, error: "Session expired" };
		}

		const now = Date.now();
		const vouchers = await ctx.db
			.query("vouchers")
			.withIndex("by_status_created", (q) => q.eq("status", "available"))
			.collect();

		const voucherCount = vouchers.filter(
			(v) => (v.expiryDate as number) > now,
		).length;

		return { valid: true, voucherCount };
	},
});

type HealthCheckResult = {
	ocrTest: { success: boolean; message: string };
	voucherCount: { success: boolean; count: number; message: string };
	telegramToken: { success: boolean; message: string };
};

async function performHealthCheck(ctx: ActionCtx): Promise<HealthCheckResult> {
	const currentYear = new Date().getFullYear();
	const expectedExpiry = `${currentYear}-01-29`;

	const now = Date.now();
	const vouchers: { expiryDate: number }[] = await ctx.runQuery(
		internal.admin.getAvailableVouchersCount,
	);
	const voucherCount = vouchers.filter(
		(v: { expiryDate: number }) => v.expiryDate > now,
	).length;

	const setting = await ctx.runQuery(internal.settings.getSetting, {
		key: "test-voucher-image",
	});

	let ocrTest: { success: boolean; message: string };
	if (!setting) {
		ocrTest = {
			success: false,
			message: "No test voucher image configured",
		};
	} else {
		const ocrResult = await ctx.runAction(
			internal.ocr.extract.extractFromImage,
			{ imageStorageId: setting as Id<"_storage"> },
		);

		if (ocrResult.expiryDate === expectedExpiry) {
			ocrTest = {
				success: true,
				message: `Expiry date ${ocrResult.expiryDate} matches expected ${expectedExpiry}`,
			};
		} else {
			ocrTest = {
				success: false,
				message: `Expected expiry ${expectedExpiry}, got ${ocrResult.expiryDate ?? "null"}`,
			};
		}
	}

	const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
	let telegramTest: { success: boolean; message: string };
	if (!telegramToken) {
		telegramTest = {
			success: false,
			message: "TELEGRAM_BOT_TOKEN not configured",
		};
	} else {
		const response = await fetch(
			`https://api.telegram.org/bot${telegramToken}/getMe`,
		);
		if (response.ok) {
			telegramTest = {
				success: true,
				message: "Telegram token is valid",
			};
		} else {
			telegramTest = {
				success: false,
				message: `Telegram token invalid: ${response.status} ${response.statusText}`,
			};
		}
	}

	return {
		ocrTest,
		voucherCount: {
			success: voucherCount > 20,
			count: voucherCount,
			message:
				voucherCount > 20
					? `${voucherCount} available vouchers (threshold: 20)`
					: `${voucherCount} available vouchers, need > 20`,
		},
		telegramToken: telegramTest,
	};
}

export const getAvailableVouchersCount = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("vouchers")
			.withIndex("by_status_created", (q) => q.eq("status", "available"))
			.collect();
	},
});

export const runHealthCheck = adminAction({
	args: { token: v.string() },
	handler: async (ctx, { token }) => {
		await verifyAdminSession(ctx, token);
		return performHealthCheck(ctx);
	},
});

export const runHealthCheckInternal = internalAction({
	args: {},
	handler: async (ctx) => {
		return performHealthCheck(ctx);
	},
});

export const getUserGrowth = adminQuery({
	args: {
		range: v.union(v.literal("all"), v.literal("30days")),
	},
	handler: async (ctx, { range }) => {
		const now = Date.now();
		const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

		// Fetch all users
		const users = await ctx.db.query("users").collect();

		// Filter users based on range
		const filteredUsers =
			range === "30days"
				? users.filter((u) => u.createdAt >= thirtyDaysAgo)
				: users;

		if (filteredUsers.length === 0) {
			return { data: [] };
		}

		// Group users by creation date (YYYY-MM-DD)
		const dateMap = new Map<string, number>();

		for (const user of filteredUsers) {
			const date = new Date(user.createdAt);
			const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
			dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + 1);
		}

		// Sort dates and calculate cumulative counts
		const sortedDates = Array.from(dateMap.entries()).sort(
			(a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime(),
		);

		// For 30days range, we need to fill in missing dates and start from day 0
		const data: { date: string; cumulative: number }[] = [];
		let cumulative = 0;

		if (range === "30days") {
			// Generate all dates in the last 30 days
			for (let i = 29; i >= 0; i--) {
				const d = new Date(now - i * 24 * 60 * 60 * 1000);
				const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
				const count = dateMap.get(dateKey) || 0;
				cumulative += count;
				data.push({ date: dateKey, cumulative });
			}
		} else {
			// All time - just show dates where users were created
			for (const [date, count] of sortedDates) {
				cumulative += count;
				data.push({ date, cumulative });
			}
		}

		return { data };
	},
});

export const runOcrEvals = adminAction({
	args: {
		token: v.string(),
		images: v.array(
			v.object({
				filename: v.string(),
				imageBase64: v.string(),
			}),
		),
		useOpenRouter: v.optional(v.boolean()),
	},
	handler: async (
		ctx,
		{ token, images, useOpenRouter },
	): Promise<{
		overallSuccess: boolean;
		passed: number;
		total: number;
		results: Array<{
			filename: string;
			testDate: string;
			success: boolean;
			expectedValidFrom: string;
			expectedExpiry: string;
			actualValidFrom?: string;
			actualExpiry?: string;
			error?: string;
		}>;
	}> => {
		return ctx.runAction(internal.ocr.evals.runOcrEvalsInternal, {
			images,
			useOpenRouter,
		});
	},
});

export const runSingleOcrEval = adminAction({
	args: {
		token: v.string(),
		filename: v.string(),
		imageBase64: v.string(),
		useOpenRouter: v.optional(v.boolean()),
	},
	handler: async (
		ctx,
		{ token, filename, imageBase64, useOpenRouter },
	): Promise<{
		filename: string;
		results: Array<{
			filename: string;
			testDate: string;
			success: boolean;
			expectedValidFrom: string;
			expectedExpiry: string;
			actualValidFrom?: string;
			actualExpiry?: string;
			error?: string;
		}>;
	}> => {
		return ctx.runAction(internal.ocr.evals.runImageOcrEval, {
			filename,
			imageBase64,
			useOpenRouter,
		});
	},
});
