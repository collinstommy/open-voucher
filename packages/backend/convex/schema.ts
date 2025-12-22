import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	inviteCodes: defineTable({
		code: v.string(),
		label: v.optional(v.string()),
		maxUses: v.number(),
		usedCount: v.number(),
		expiresAt: v.optional(v.number()),
		createdAt: v.number(),
	}).index("by_code", ["code"]),

	// Users table - stores Telegram users
	users: defineTable({
		telegramChatId: v.string(),
		username: v.optional(v.string()),
		firstName: v.optional(v.string()),
		coins: v.number(),
		isBanned: v.boolean(),
		inviteCode: v.optional(v.string()),
		createdAt: v.number(),
		lastActiveAt: v.number(),
		bannedAt: v.optional(v.number()),
		uploadCount: v.optional(v.number()),
		claimCount: v.optional(v.number()),
		uploadReportCount: v.optional(v.number()),
		claimReportCount: v.optional(v.number()),
	}).index("by_chat_id", ["telegramChatId"]),

	messages: defineTable({
		telegramMessageId: v.number(),
		telegramChatId: v.string(),
		direction: v.union(v.literal("inbound"), v.literal("outbound")),
		messageType: v.union(v.literal("text"), v.literal("image")),
		text: v.optional(v.string()),
		mediaGroupId: v.optional(v.string()),
		imageStorageId: v.optional(v.id("_storage")),
		createdAt: v.number(),
	})
		.index("by_chat_id", ["telegramChatId"])
		.index("by_message_id", ["telegramChatId", "telegramMessageId"]),

	vouchers: defineTable({
		type: v.union(
			v.literal("5"),
			v.literal("10"),
			v.literal("20"),
			v.literal("0"),
		),
		status: v.union(
			v.literal("processing"),
			v.literal("available"),
			v.literal("claimed"),
			v.literal("reported"),
			v.literal("expired"),
		),
		imageStorageId: v.id("_storage"),
		barcodeNumber: v.optional(v.string()),
		expiryDate: v.number(),
		uploaderId: v.id("users"),
		claimerId: v.optional(v.id("users")),
		claimedAt: v.optional(v.number()),
		createdAt: v.number(),
		ocrRawResponse: v.optional(v.string()),
	})
		.index("by_status_type", ["status", "type"])
		.index("by_status_created", ["status", "createdAt"])
		.index("by_claimed_at", ["claimedAt"])
		.index("by_uploader", ["uploaderId"])
		.index("by_uploader_created", ["uploaderId", "createdAt"])
		.index("by_claimer_status", ["claimerId", "status"])
		.index("by_claimer_claimed_at", ["claimerId", "claimedAt"])
		.index("by_barcode", ["barcodeNumber"]),

	reports: defineTable({
		voucherId: v.id("vouchers"),
		reporterId: v.id("users"),
		uploaderId: v.id("users"),
		reason: v.string(),
		replacementVoucherId: v.optional(v.id("vouchers")),
		createdAt: v.number(),
	})
		.index("by_voucher", ["voucherId"])
		.index("by_uploader", ["uploaderId"])
		.index("by_reporterId", ["reporterId"]),

	transactions: defineTable({
		userId: v.id("users"),
		type: v.union(
			v.literal("signup_bonus"),
			v.literal("upload_reward"),
			v.literal("claim_spend"),
			v.literal("report_refund"),
		),
		amount: v.number(),
		voucherId: v.optional(v.id("vouchers")),
		createdAt: v.number(),
	}).index("by_user", ["userId"]),

	feedback: defineTable({
		userId: v.id("users"),
		text: v.string(),
		createdAt: v.number(),
		status: v.string(), // "new", "read", "archived"
		type: v.optional(v.string()), // "feedback", "support"
	})
		.index("by_status", ["status"])
		.index("by_type", ["type"]),

	adminSessions: defineTable({
		token: v.string(),
		createdAt: v.number(),
		expiresAt: v.number(),
	}).index("by_token", ["token"]),
});
