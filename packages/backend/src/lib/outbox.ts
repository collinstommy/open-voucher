import { v } from "convex/values";

// Notification outbox kinds (routing rule lives in src/lib/notify.ts:
// linked users get Telegram sends, chatless users get a row here). The app
// reads its own rows; push delivery will read the same rows.

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
// path sends) plus optional machine-readable details.
export const outboxPayloadValidator = v.object({
	text: v.string(),
	data: v.optional(v.any()),
});

export type OutboxPayload = {
	text: string;
	data?: unknown;
};
