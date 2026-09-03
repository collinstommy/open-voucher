import { v } from "convex/values";

// Permanent-shaped notification outbox kinds. Chatless (Google-only) users
// have no telegramChatId, so anywhere the bot would send them a Telegram
// message we write a row here instead (see src/lib/notify.ts). The app reads
// its own rows; when push exists, delivery reads the same rows.

export const OUTBOX_KINDS = [
	"upload_accepted",
	"upload_rejected",
	"upload_limit",
	"processing_failed",
	"claim_success",
	"report_received",
	"uploader_reported",
	"generic",
] as const;

export type OutboxKind = (typeof OUTBOX_KINDS)[number];

export const outboxKindValidator = v.union(
	v.literal("upload_accepted"),
	v.literal("upload_rejected"),
	v.literal("upload_limit"),
	v.literal("processing_failed"),
	v.literal("claim_success"),
	v.literal("report_received"),
	v.literal("uploader_reported"),
	v.literal("generic"),
);

// Envelope: human-readable text (mirrors the Telegram message the linked
// path sends) plus optional machine-readable details. No createdAt column —
// Convex provides _creationTime.
export const outboxPayloadValidator = v.object({
	text: v.string(),
	data: v.optional(v.any()),
});

export type OutboxPayload = {
	text: string;
	data?: unknown;
};
