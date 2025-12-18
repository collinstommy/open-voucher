import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Invite codes table - for controlled signups
  inviteCodes: defineTable({
    // The invite code (e.g., "REDDIT50", "IRELAND-LAUNCH")
    code: v.string(),
    // Optional label for tracking (e.g., "r/ireland post", "Twitter launch")
    label: v.optional(v.string()),
    // Maximum number of signups allowed with this code
    maxUses: v.number(),
    // Current number of times this code has been used
    usedCount: v.number(),
    // Optional expiry timestamp (null = never expires)
    expiresAt: v.optional(v.number()),
    // Unix timestamp when code was created
    createdAt: v.number(),
  }).index("by_code", ["code"]),

  // Users table - stores Telegram users
  users: defineTable({
    // Telegram Chat ID (stringified)
    telegramChatId: v.string(),
    // Telegram Username (optional)
    username: v.optional(v.string()),
    // Telegram First Name
    firstName: v.optional(v.string()),
    // Current coin balance (0-100)
    coins: v.number(),
    // Whether user is banned from the service
    isBanned: v.boolean(),
    // Which invite code this user signed up with
    inviteCode: v.optional(v.string()),
    // Unix timestamp when user first messaged bot
    createdAt: v.number(),
    // Unix timestamp of last interaction
    lastActiveAt: v.number(),
  }).index("by_chat_id", ["telegramChatId"]),

  // Messages table - stores incoming Telegram messages
  messages: defineTable({
    // Telegram Message ID (unique per chat)
    telegramMessageId: v.number(),
    // Telegram Chat ID
    telegramChatId: v.string(),
    // Direction of message
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    // Type of message
    messageType: v.union(v.literal("text"), v.literal("image")),
    // Text content (or caption for images)
    text: v.optional(v.string()),
    // Media Group ID for grouping albums
    mediaGroupId: v.optional(v.string()),
    // Convex storage ID if message contained an image
    imageStorageId: v.optional(v.id("_storage")),
    // Unix timestamp
    createdAt: v.number(),
  })
    .index("by_chat_id", ["telegramChatId"])
    .index("by_message_id", ["telegramChatId", "telegramMessageId"]),

  // Vouchers table - stores uploaded voucher images and metadata
  vouchers: defineTable({
    // Voucher denomination: "5" = €5 off €25, "10" = €10 off €50, "20" = €20 off €100, "0" = Invalid/Unknown
    type: v.union(v.literal("5"), v.literal("10"), v.literal("20"), v.literal("0")),
    // Current voucher status
    status: v.union(
      v.literal("processing"),  // OCR in progress
      v.literal("available"),   // Ready to be claimed
      v.literal("claimed"),     // Someone claimed it
      v.literal("reported"),    // Claimer reported it as already used
      v.literal("expired")      // Past expiry date (set manually or via future cron)
    ),
    // Reference to image in Convex storage
    imageStorageId: v.id("_storage"),
    // Barcode number extracted by OCR (optional, may not be readable)
    barcodeNumber: v.optional(v.string()),
    // Unix timestamp of voucher expiry date
    expiryDate: v.number(),
    // User who uploaded this voucher
    uploaderId: v.id("users"),
    // User who claimed this voucher (null if not claimed)
    claimerId: v.optional(v.id("users")),
    // Unix timestamp when voucher was claimed
    claimedAt: v.optional(v.number()),
    // Unix timestamp when voucher was uploaded
    createdAt: v.number(),
    // Raw JSON response from Gemini for debugging
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

  // Reports table - tracks "already used" reports
  reports: defineTable({
    // The voucher being reported
    voucherId: v.id("vouchers"),
    // User who reported the voucher (must be the claimer)
    reporterId: v.id("users"),
    // User who uploaded the voucher
    uploaderId: v.id("users"),
    // Reason for report
    reason: v.string(),
    // If a replacement was given, reference to the new voucher
    replacementVoucherId: v.optional(v.id("vouchers")),
    // Unix timestamp when report was created
    createdAt: v.number(),
  })
    .index("by_voucher", ["voucherId"])
    .index("by_uploader", ["uploaderId"])
    .index("by_reporterId", ["reporterId"]),

  // Transactions table - audit log of all coin changes
  transactions: defineTable({
    // User whose coins changed
    userId: v.id("users"),
    // Type of transaction
    type: v.union(
      v.literal("signup_bonus"),   // Initial 20 coins on first message
      v.literal("upload_reward"),  // Coins earned for uploading voucher
      v.literal("claim_spend"),    // Coins spent to claim voucher
      v.literal("report_refund")   // Coins refunded when voucher was already used
    ),
    // Amount of coins (positive for gains, negative for spends)
    amount: v.number(),
    // Related voucher (optional, not present for signup_bonus)
    voucherId: v.optional(v.id("vouchers")),
    // Unix timestamp
    createdAt: v.number(),
    }).index("by_user", ["userId"]),

  // Feedback table
  feedback: defineTable({
    userId: v.id("users"),
    text: v.string(),
    createdAt: v.number(),
    status: v.string(), // "new", "read", "archived"
  }).index("by_status", ["status"]),
});
