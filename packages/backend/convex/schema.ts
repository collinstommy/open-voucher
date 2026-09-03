import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { outboxKindValidator, outboxPayloadValidator } from "../src/lib/outbox";

export default defineSchema({
	inviteCodes: defineTable({
		code: v.string(),
		label: v.optional(v.string()),
		maxUses: v.number(),
		usedCount: v.number(),
		expiresAt: v.optional(v.number()),
		createdAt: v.number(),
	}),

	// Users table - stores Telegram users. telegramChatId is optional since
	// Google sign-in introduced chatless users (authIdentities holds their
	// identity); Telegram identity stays on this field.
	users: defineTable({
		telegramChatId: v.optional(v.string()),
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
		lastReportAt: v.optional(v.number()),
		flaggedForReviewAt: v.optional(v.number()),
		onboardingStep: v.optional(v.number()),
		telegramState: v.optional(
			v.union(
				v.literal("waiting_for_support_message"),
				v.literal("waiting_for_ban_appeal"),
				v.literal("onboarding_tutorial"),
			),
		),
	}).index("by_chat_id", ["telegramChatId"]),

	// Google (and later Apple) identities. Telegram identity intentionally
	// stays on users.telegramChatId — no "telegram" rows here.
	authIdentities: defineTable({
		provider: v.union(v.literal("google"), v.literal("apple")),
		// Google `sub`. Stable across email changes; lookup key.
		providerAccountId: v.string(),
		userId: v.id("users"),
		// Last seen values, display only — never used for lookup.
		email: v.optional(v.string()),
		displayName: v.optional(v.string()),
	})
		.index("by_provider_account", ["provider", "providerAccountId"])
		.index("by_user_provider", ["userId", "provider"]),

	// Single-use bot /link codes: prove Telegram ownership for the app to
	// redeem inside POST /api/google-auth. Dead rows are never cleaned.
	linkCodes: defineTable({
		// 8 chars, no 0/1/I/L/O/U, uppercase.
		code: v.string(),
		userId: v.id("users"),
		attempts: v.number(),
		expiresAt: v.number(),
		usedAt: v.optional(v.number()),
	}).index("by_code", ["code"]),

	// Small keyed counters for endpoint rate limiting (see src/lib/rateLimit.ts).
	rateLimits: defineTable({
		key: v.string(),
		count: v.number(),
		windowStart: v.number(),
	}).index("by_key", ["key"]),

	messages: defineTable({
		telegramMessageId: v.number(),
		telegramChatId: v.string(),
		direction: v.union(v.literal("inbound"), v.literal("outbound")),
		messageType: v.union(v.literal("text"), v.literal("image")),
		text: v.optional(v.string()),
		mediaGroupId: v.optional(v.string()),
		imageStorageId: v.optional(v.id("_storage")),
		isAdminMessage: v.optional(v.boolean()),
		// Stored as string; validated on write via messageIntentValidator in mutations.
		intent: v.optional(v.string()),
		classifiedIntent: v.optional(v.string()),
		classifiedConfidence: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_admin_message", ["isAdminMessage", "telegramChatId"])
		.index("by_direction", ["direction"])
		.index("by_classified_intent", ["classifiedIntent"]),

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
			v.literal("uploader_admitted_used"),
			v.literal("uploader_denied"),
			v.literal("invalidated"),
		),
		imageStorageId: v.id("_storage"),
		barcodeNumber: v.optional(v.string()),
		expiryDate: v.number(),
		validFrom: v.optional(v.number()),
		uploaderId: v.id("users"),
		claimerId: v.optional(v.id("users")),
		claimedAt: v.optional(v.number()),
		createdAt: v.number(),
		ocrRawResponse: v.optional(v.string()),
		imageMarkedForDeletionAt: v.optional(v.number()),
		imageDeletedAt: v.optional(v.number()),
	})
		.index("by_status_type", ["status", "type"])
		.index("by_status_created", ["status", "createdAt"])
		.index("by_claimed_at", ["claimedAt"])
		.index("by_uploader", ["uploaderId"])
		.index("by_uploader_created", ["uploaderId", "createdAt"])
		.index("by_claimer_claimed_at", ["claimerId", "claimedAt"])
		.index("by_barcode", ["barcodeNumber"])
		.index("by_image_storage", ["imageStorageId"]),

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
			v.literal("refund"),
			v.literal("report_refund"),
			v.literal("uploader_refund"),
			v.literal("uploader_denied"),
			v.literal("admin_expiry_deduction"),
			v.literal("admin_manual_deduction"),
			v.literal("admin_report_deduction"),
			v.literal("claim_reversed"),
			v.literal("self_invalidated"),
			v.literal("claim_returned"),
			v.literal("replacement_received"),
			v.literal("fork_merge_clawback"),
		),
		amount: v.number(),
		voucherId: v.optional(v.id("vouchers")),
		createdAt: v.number(),
	}).index("by_user", ["userId"]),

	failedUploads: defineTable({
		userId: v.id("users"),
		imageStorageId: v.id("_storage"),
		failureType: v.union(v.literal("validation"), v.literal("system")),
		failureReason: v.string(),
		errorMessage: v.optional(v.string()),
		// OCR data (partial/missing for system errors)
		rawOcrResponse: v.optional(v.string()),
		extractedType: v.optional(v.string()),
		extractedBarcode: v.optional(v.string()),
		extractedExpiryDate: v.optional(v.string()),
		extractedValidFrom: v.optional(v.string()),
	})
		.index("by_userId", ["userId"])
		.index("by_image_storage", ["imageStorageId"]),
	feedback: defineTable({
		userId: v.id("users"),
		text: v.string(),
		createdAt: v.number(),
		status: v.string(), // "new", "read", "archived"
		type: v.optional(v.string()), // "feedback", "support"
	}).index("by_user", ["userId"]),

	analytics: defineTable({
		action: v.string(),
		userId: v.optional(v.id("users")),
		createdAt: v.number(),
	})
		.index("by_action", ["action"])
		.index("by_created", ["createdAt"]),

	settings: defineTable({
		key: v.string(),
		value: v.string(),
	}).index("by_key", ["key"]),

	adminSessions: defineTable({
		token: v.string(),
		createdAt: v.number(),
		expiresAt: v.number(),
	}).index("by_token", ["token"]),

	errors: defineTable({
		errorType: v.string(),
		text: v.string(),
	}),

	// Decoupling proof: notifications for users with no Telegram chat land
	// here instead of the Bot API (see src/lib/notify.ts). First reader is
	// the dev flows page inspector plus a user query; push reads the same
	// rows later. No createdAt — use _creationTime. If it proves useless it
	// is one table to drop.
	notificationOutbox: defineTable({
		userId: v.id("users"),
		kind: outboxKindValidator,
		payload: outboxPayloadValidator,
		readAt: v.optional(v.number()),
	}).index("by_user", ["userId"]),
});
