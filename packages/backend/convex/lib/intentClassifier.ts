import { callGeminiApi } from "./gemini";
import {
	isClassifiedIntent,
	type InboundClassification,
} from "./messageIntent";

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
- unknown               ambiguous, low-confidence, or not covered above

Reply ONLY with JSON: {"label": <label>, "confidence": <0..1>}

If the message doesn't clearly fit any label, return "unknown".`;

export type ClassificationResult = {
	label: string;
	confidence: number;
};

export function normalizeClassification(raw: ClassificationResult): {
	intent: InboundClassification;
	confidence: number;
} {
	const confidence =
		typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
			? Math.max(0, Math.min(1, raw.confidence))
			: 0;

	if (confidence < CLASSIFICATION_CONFIDENCE_THRESHOLD) {
		return { intent: "unknown", confidence };
	}

	if (isClassifiedIntent(raw.label)) {
		return { intent: raw.label, confidence };
	}

	return { intent: "unknown", confidence };
}

export async function classifyMessageText(
	text: string,
	apiKey: string,
): Promise<{ intent: InboundClassification; confidence: number; raw: string }> {
	if (!text.trim()) {
		return { intent: "unknown", confidence: 0, raw: "" };
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
			};
		} else {
			result = { label: "unknown", confidence: 0 };
		}
	} catch {
		result = { label: "unknown", confidence: 0 };
	}

	const { intent, confidence } = normalizeClassification(result);
	return { intent, confidence, raw: geminiResponse.raw };
}
