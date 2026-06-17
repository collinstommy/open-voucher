import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { adminMutation, adminQuery } from "./auth";

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
		await ctx.db.patch(userId, {
			isBanned: true,
			bannedAt: Date.now(),
			flaggedForReviewAt: undefined,
		});
		return { success: true };
	},
});

export const unbanUser = adminMutation({
	args: {
		userId: v.id("users"),
	},
	handler: async (ctx, { userId }) => {
		await ctx.db.patch(userId, {
			isBanned: false,
			bannedAt: undefined,
			flaggedForReviewAt: undefined,
		});
		return { success: true };
	},
});

export const getFlaggedUsers = adminQuery({
	args: {},
	handler: async (ctx) => {
		const users = await ctx.db
			.query("users")
			.filter((q) =>
				q.and(
					q.neq(q.field("flaggedForReviewAt"), undefined),
					q.eq(q.field("isBanned"), false),
				),
			)
			.collect();

		return users
			.sort((a, b) => (b.flaggedForReviewAt || 0) - (a.flaggedForReviewAt || 0))
			.map((user) => ({
				_id: user._id,
				telegramChatId: user.telegramChatId,
				username: user.username,
				firstName: user.firstName,
				flaggedForReviewAt: user.flaggedForReviewAt,
				uploadCount: user.uploadCount || 0,
				claimCount: user.claimCount || 0,
				uploadReportCount: user.uploadReportCount || 0,
				claimReportCount: user.claimReportCount || 0,
			}));
	},
});

export const dismissFlag = adminMutation({
	args: {
		userId: v.id("users"),
	},
	handler: async (ctx, { userId }) => {
		await ctx.db.patch(userId, { flaggedForReviewAt: undefined });
		return { success: true };
	},
});

export const getBannedUsers = adminQuery({
	args: {},
	handler: async (ctx) => {
		const bannedUsers = await ctx.db
			.query("users")
			.filter((q) => q.eq(q.field("isBanned"), true))
			.collect();

		return bannedUsers
			.sort((a, b) => (b.bannedAt || 0) - (a.bannedAt || 0))
			.map((user) => ({
				_id: user._id,
				telegramChatId: user.telegramChatId,
				username: user.username,
				firstName: user.firstName,
				bannedAt: user.bannedAt,
			}));
	},
});

export const getBannedUsersInternal = internalQuery({
	args: {},
	handler: async (ctx) => {
		const bannedUsers = await ctx.db
			.query("users")
			.filter((q) => q.eq(q.field("isBanned"), true))
			.collect();

		return bannedUsers.sort((a, b) => (b.bannedAt || 0) - (a.bannedAt || 0));
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

		const uploadedVouchersWithDetails = await Promise.all(
			uploadedVouchers.map(async (voucher) => {
				const imageUrl = await ctx.storage.getUrl(voucher.imageStorageId);
				const claimer = voucher.claimerId
					? await ctx.db.get(voucher.claimerId)
					: null;
				return {
					_id: voucher._id,
					type: voucher.type,
					status: voucher.status,
					imageUrl,
					expiryDate: voucher.expiryDate,
					createdAt: voucher.createdAt,
					claimer: claimer
						? {
								_id: claimer._id,
								username: claimer.username,
								firstName: claimer.firstName,
								telegramChatId: claimer.telegramChatId,
							}
						: null,
				};
			}),
		);

		const claimedVouchersWithDetails = await Promise.all(
			claimedVouchers.map(async (voucher) => {
				const imageUrl = await ctx.storage.getUrl(voucher.imageStorageId);
				const uploader = await ctx.db.get(voucher.uploaderId);
				return {
					_id: voucher._id,
					type: voucher.type,
					status: voucher.status,
					imageUrl,
					expiryDate: voucher.expiryDate,
					createdAt: voucher.createdAt,
					claimedAt: voucher.claimedAt,
					uploader: uploader
						? {
								_id: uploader._id,
								username: uploader.username,
								firstName: uploader.firstName,
								telegramChatId: uploader.telegramChatId,
							}
						: null,
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
								createdAt: voucher.createdAt,
							}
						: null,
					uploader: uploader
						? {
								_id: uploader._id,
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
								createdAt: voucher.createdAt,
							}
						: null,
					reporter: reporter
						? {
								_id: reporter._id,
								username: reporter.username,
								firstName: reporter.firstName,
								telegramChatId: reporter.telegramChatId,
							}
						: null,
				};
			}),
		);

		const feedbackAndSupport = await ctx.db
			.query("feedback")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.order("desc")
			.collect();

		const adminMessages = await ctx.db
			.query("messages")
			.withIndex("by_admin_message", (q) =>
				q.eq("isAdminMessage", true).eq("telegramChatId", user.telegramChatId),
			)
			.order("desc")
			.collect();

		const transactions = await ctx.db
			.query("transactions")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.order("desc")
			.collect();

		const failedUploadsRaw = await ctx.db
			.query("failedUploads")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.order("desc")
			.collect();

		const failedUploadsWithDetails = await Promise.all(
			failedUploadsRaw.map(async (failedUpload) => {
				const imageUrl = await ctx.storage.getUrl(failedUpload.imageStorageId);

				return {
					_id: failedUpload._id,
					imageUrl,
					failureType: failedUpload.failureType,
					failureReason: failedUpload.failureReason,
					errorMessage: failedUpload.errorMessage,
					extractedType: failedUpload.extractedType,
					extractedBarcode: failedUpload.extractedBarcode,
					extractedExpiryDate: failedUpload.extractedExpiryDate,
					extractedValidFrom: failedUpload.extractedValidFrom,
					_creationTime: failedUpload._creationTime,
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
				flaggedForReviewAt: user.flaggedForReviewAt,
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
			failedUploads: failedUploadsWithDetails,
			reportsFiledByUser,
			reportsAgainstUploads: reportsAgainstUserUploads,
			feedbackAndSupport,
			adminMessages,
			transactions,
		};
	},
});

export const backfillUserStats = internalMutation({
	args: {},
	handler: async (ctx) => {
		let processed = 0;
		let total = 0;

		const allUsers = await ctx.db.query("users").collect();
		total = allUsers.length;

		console.log("Aggregating voucher data...");
		const allVouchers = await ctx.db.query("vouchers").collect();
		console.log(`Found ${allVouchers.length} vouchers`);

		console.log("Aggregating report data...");
		const allReports = await ctx.db.query("reports").collect();
		console.log(`Found ${allReports.length} reports`);

		const userStats = new Map();

		for (const user of allUsers) {
			userStats.set(user._id.toString(), {
				uploadCount: 0,
				claimCount: 0,
				uploadReportCount: 0,
				claimReportCount: 0,
			});
		}

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
