import { v } from "convex/values";
import { callGeminiApi } from "./gemini";

/** LLM classification labels for unknown free-text inbound messages. */
export const INBOUND_CLASSIFICATIONS = [
	"return_voucher",
	"revoke_upload",
	"report_not_working",
	"how_does_it_work",
	"balance",
	"limits_question",
	"praise_or_noise",
	"request_voucher",
	"why_rejected",
	"unknown",
] as const;

export type InboundClassification = (typeof INBOUND_CLASSIFICATIONS)[number];

const INBOUND_CLASSIFICATION_SET = new Set<string>(INBOUND_CLASSIFICATIONS);

export const classifiedIntentValidator = v.union(
	...INBOUND_CLASSIFICATIONS.map((label) => v.literal(label)),
);

export function isInboundClassification(
	value: string,
): value is InboundClassification {
	return INBOUND_CLASSIFICATION_SET.has(value);
}

export const INBOUND_CLASSIFICATION_LABELS: Record<
	InboundClassification,
	string
> = {
	return_voucher: "Return voucher",
	revoke_upload: "Revoke upload",
	report_not_working: "Report not working",
	how_does_it_work: "How does it work?",
	balance: "Balance",
	limits_question: "Limits question",
	praise_or_noise: "Praise / noise",
	request_voucher: "Request a voucher",
	why_rejected: "Why was upload rejected?",
	unknown: "Unknown",
};

export const CLASSIFICATION_MODEL = "gemini-3.1-flash-lite";
export const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.6;

export const CLASSIFICATION_PROMPT = `You classify free-text Telegram messages from users of a Dunnes Stores voucher-swapping bot.

Bot context:
- Users upload vouchers they don't need → earn coins.
- Users spend coins to claim vouchers → use them in-store.
- Users report a voucher that didn't work at the till via a button on the claim-delivery message.
- Users can return an unused claimed voucher from "My Claims" in the mini app.
- Users can pull back a voucher they uploaded by mistake from "My Uploads" in the mini app.

Classify the user's message into exactly one label:
- return_voucher        user asks how/whether to return an unused downloaded voucher; includes "I don't need it", "I want to cancel", "do not need this anymore"
- revoke_upload         user says an uploaded voucher was used and should be removed
- report_not_working    user says a voucher they claimed didn't work at the till
- how_does_it_work      user asks how to upload, claim, or use vouchers
- balance               user asks for their coin balance or account balance; includes "my points", "what's my balance", "how many coins"
- limits_question       user asks about limits or whether the app is free
- praise_or_noise       thanks, testing, or anything else confidently non-actionable
- request_voucher       user is asking for/wanting a voucher or wondering if a voucher/value is available now (e.g. "any €20 left?", "got a €10?", "when do vouchers refresh", "I want a €5"); does NOT include asking how the claiming process works
- why_rejected          user says their voucher upload was rejected/failed or asks why it wasn't accepted, or is asking about a previous failed/rejected upload
- unknown               ambiguous, low-confidence, or not covered above

Also decide escalate: whether this message needs a human operator to look at it. Set escalate=true when the user is frustrated, angry, abusive, demands immediate attention, or reports something critical (e.g. "this is a scam", "I've been unfairly banned", repeated frustration). Set escalate=false for routine questions, thanks, or simple help.

Reply ONLY with JSON: {"label": <label>, "confidence": <0..1>, "escalate": <true|false>}

If the message doesn't clearly fit any label, return "unknown".`;

export type ClassificationResult = {
	label: string;
	confidence: number;
	escalate?: boolean;
};

export function normalizeClassification(raw: ClassificationResult): {
	intent: InboundClassification;
	confidence: number;
	escalate: boolean;
} {
	const confidence =
		typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
			? Math.max(0, Math.min(1, raw.confidence))
			: 0;
	const escalate = raw.escalate === true;

	if (confidence < CLASSIFICATION_CONFIDENCE_THRESHOLD) {
		return { intent: "unknown", confidence, escalate };
	}

	if (isInboundClassification(raw.label)) {
		return { intent: raw.label, confidence, escalate };
	}

	return { intent: "unknown", confidence, escalate };
}

export async function classifyMessageText(
	text: string,
	apiKey: string,
): Promise<{
	intent: InboundClassification;
	confidence: number;
	escalate: boolean;
	raw: string;
}> {
	if (!text.trim()) {
		return { intent: "unknown", confidence: 0, escalate: false, raw: "" };
	}

	const geminiResponse = await callGeminiApi(
		[{ text: CLASSIFICATION_PROMPT }, { text: `User message: "${text}"` }],
		apiKey,
		CLASSIFICATION_MODEL,
		{
			temperature: 0,
			maxOutputTokens: 128,
			responseMimeType: "application/json",
		},
	);

	let result: ClassificationResult;
	try {
		const parsed = JSON.parse(geminiResponse.text) as unknown;
		if (
			parsed &&
			typeof parsed === "object" &&
			"label" in parsed &&
			"confidence" in parsed
		) {
			result = {
				label: String(parsed.label),
				confidence: Number(parsed.confidence),
				escalate: "escalate" in parsed ? parsed.escalate === true : undefined,
			};
		} else {
			result = { label: "unknown", confidence: 0 };
		}
	} catch {
		result = { label: "unknown", confidence: 0 };
	}

	const { intent, confidence, escalate } = normalizeClassification(result);
	return { intent, confidence, escalate, raw: geminiResponse.raw };
}
