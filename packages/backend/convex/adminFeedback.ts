import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { adminMutation, adminQuery } from "./adminGuards";

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

export const getFailedUploads = adminQuery({
	args: {
		excludeReasons: v.optional(v.array(v.string())),
		page: v.optional(v.number()),
		pageSize: v.optional(v.number()),
	},
	handler: async (ctx, { excludeReasons, page, pageSize }) => {
		const limit = pageSize ?? 12;
		const pageNum = page ?? 1;

		const failedUploads = await ctx.db
			.query("failedUploads")
			.order("desc")
			.take(200);

		const allReasons = [
			...new Set(
				failedUploads
					.map((u) => u.failureReason)
					.filter((r): r is string => !!r),
			),
		].sort();

		const filtered = excludeReasons?.length
			? failedUploads.filter((u) => !excludeReasons.includes(u.failureReason))
			: failedUploads;

		const total = filtered.length;
		const start = (pageNum - 1) * limit;
		const pageItems = filtered.slice(start, start + limit);
		const hasMore = start + limit < total;

		const failedUploadsWithDetails = await Promise.all(
			pageItems.map(async (failedUpload) => {
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

		return {
			failedUploads: failedUploadsWithDetails,
			allReasons,
			total,
			hasMore,
			page: pageNum,
			pageSize: limit,
		};
	},
});

export const getSampleVoucherImageUrl = adminQuery({
	args: {},
	handler: async (ctx) => {
		const setting = await ctx.db
			.query("settings")
			.withIndex("by_key", (q) => q.eq("key", "sample-voucher-image"))
			.first();

		if (!setting?.value) return null;
		return await ctx.storage.getUrl(setting.value as Id<"_storage">);
	},
});
