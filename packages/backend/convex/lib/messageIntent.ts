import { v } from "convex/values";

export type TelegramUserState =
	| "waiting_for_support_message"
	| "waiting_for_ban_appeal"
	| "onboarding_tutorial";

export const MESSAGE_INTENTS = [
	"image",
	"claim_5",
	"claim_10",
	"claim_20",
	"balance",
	"help",
	"start",
	"faq",
	"donate",
	"app",
	"share",
	"feedback",
	"feedback_with_text",
	"state_support",
	"state_ban_appeal",
	"state_onboarding",
	"unknown",
] as const;

export type MessageIntent = (typeof MESSAGE_INTENTS)[number];

const MESSAGE_INTENT_SET = new Set<string>(MESSAGE_INTENTS);

export function isMessageIntent(value: string): value is MessageIntent {
	return MESSAGE_INTENT_SET.has(value);
}

export const messageIntentValidator = v.union(
	...MESSAGE_INTENTS.map((intent) => v.literal(intent)),
);

export const INTENT_LABELS: Record<MessageIntent, string> = {
	image: "Image upload",
	claim_5: "Claim €5",
	claim_10: "Claim €10",
	claim_20: "Claim €20",
	balance: "Balance",
	help: "Help",
	start: "Start",
	faq: "FAQ",
	donate: "Donate",
	app: "App",
	share: "Share",
	feedback: "Feedback",
	feedback_with_text: "Feedback (with text)",
	state_support: "Support flow",
	state_ban_appeal: "Ban appeal",
	state_onboarding: "Onboarding",
	unknown: "Unknown / free text",
};

/** Intents shown as known command counts on the admin dashboard. */
export const DASHBOARD_INTENTS: MessageIntent[] = [
	"claim_5",
	"claim_10",
	"claim_20",
	"balance",
	"help",
	"start",
	"faq",
	"donate",
	"app",
	"share",
	"feedback",
	"feedback_with_text",
	"image",
];

export function normalizeInboundText(text: string): string {
	return text.toLowerCase().trim().replace(/^\//, "");
}

export function classifyInboundMessage(args: {
	text: string;
	messageType: "text" | "image";
	userState?: TelegramUserState;
}): MessageIntent {
	const { text, messageType, userState } = args;

	if (messageType === "image") {
		return "image";
	}

	if (userState === "waiting_for_support_message") {
		return "state_support";
	}
	if (userState === "waiting_for_ban_appeal") {
		return "state_ban_appeal";
	}
	if (userState === "onboarding_tutorial") {
		return "state_onboarding";
	}

	const lowerText = normalizeInboundText(text);

	if (lowerText === "start") {
		return "start";
	}
	if (lowerText === "balance") {
		return "balance";
	}
	if (lowerText === "help") {
		return "help";
	}
	if (lowerText === "faq") {
		return "faq";
	}
	if (lowerText === "donate") {
		return "donate";
	}
	if (lowerText === "app") {
		return "app";
	}
	if (lowerText === "share") {
		return "share";
	}
	if (lowerText === "feedback") {
		return "feedback";
	}
	if (lowerText.startsWith("feedback ")) {
		return "feedback_with_text";
	}

	const claimMatch = lowerText.match(/\b(5|10|20)\b/);
	if (claimMatch && lowerText.length < 10) {
		if (claimMatch[1] === "5") return "claim_5";
		if (claimMatch[1] === "10") return "claim_10";
		return "claim_20";
	}

	return "unknown";
}

export function resolveMessageIntent(message: {
	intent?: string;
	text?: string;
	messageType: "text" | "image";
}): MessageIntent {
	if (message.intent && isMessageIntent(message.intent)) {
		return message.intent;
	}
	return classifyInboundMessage({
		text: message.text ?? "",
		messageType: message.messageType,
	});
}

export function emptyIntentCounts(): Record<MessageIntent, number> {
	return Object.fromEntries(
		MESSAGE_INTENTS.map((intent) => [intent, 0]),
	) as Record<MessageIntent, number>;
}

export const INBOUND_CLASSIFICATIONS = [
	"return_voucher",
	"revoke_upload",
	"report_not_working",
	"how_does_it_work",
	"balance",
	"limits_question",
	"praise_or_noise",
	"unknown",
] as const;

export const CLASSIFIED_LABELS = new Set<string>(INBOUND_CLASSIFICATIONS);

export type InboundClassification = (typeof INBOUND_CLASSIFICATIONS)[number];

export const classifiedIntentValidator = v.union(
	...INBOUND_CLASSIFICATIONS.map((label) => v.literal(label)),
);

export function isClassifiedIntent(
	value: string,
): value is InboundClassification {
	return CLASSIFIED_LABELS.has(value);
}

export const CLASSIFIED_INTENT_LABELS: Record<InboundClassification, string> = {
	return_voucher: "Return voucher",
	revoke_upload: "Revoke upload",
	report_not_working: "Report not working",
	how_does_it_work: "How does it work?",
	balance: "Balance",
	limits_question: "Limits question",
	praise_or_noise: "Praise / noise",
	unknown: "Unknown",
};
