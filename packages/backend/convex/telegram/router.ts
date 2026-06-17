import type { ActionCtx } from "../_generated/server";
import type { BotAdapter } from "./botAdapter";

export const CALLBACK_KINDS = {
	report_init: "ri",
	report_confirm: "rc",
	report_replacement_yes: "rpy",
	report_replacement_no: "rpn",
	report_cancel: "rx",
	uploader_admitted: "ua",
	uploader_denied: "ud",
	help: "h",
	faq: "f",
} as const;

type CallbackKindKey = keyof typeof CALLBACK_KINDS;

const REVERSE_KINDS: Record<string, CallbackKindKey> = {};
for (const [key, code] of Object.entries(CALLBACK_KINDS)) {
	REVERSE_KINDS[code] = key as CallbackKindKey;
}

export type HelpAction =
	| "balance"
	| "upload"
	| "claim"
	| "faq"
	| "donate"
	| "share"
	| "app";

export type FaqAction = "back" | "return_cancel" | "processing_failed";

export type CallbackEvent =
	| { kind: "report_init"; voucherId: string }
	| { kind: "report_confirm"; voucherId: string }
	| { kind: "report_replacement_yes"; voucherId: string }
	| { kind: "report_replacement_no"; voucherId: string }
	| { kind: "report_cancel"; voucherId: string }
	| { kind: "help"; action: HelpAction }
	| { kind: "faq"; action: FaqAction }
	| { kind: "uploader_admitted"; voucherId: string }
	| { kind: "uploader_denied"; voucherId: string };

export interface CallbackContext {
	ctx: ActionCtx;
	chatId: string;
	telegramUserId: string;
	callbackId: string;
	messageId: number;
	messageText: string;
	isPhotoMessage: boolean;
}

export type CallbackHandler<E extends CallbackEvent = CallbackEvent> = (
	c: CallbackContext,
	event: E,
	bot: BotAdapter,
) => Promise<void>;

const handlers = new Map<string, CallbackHandler>();

export function on<K extends CallbackEvent["kind"]>(
	kind: K,
	handler: CallbackHandler<Extract<CallbackEvent, { kind: K }>>,
) {
	handlers.set(kind, handler as CallbackHandler);
}

export function parseCallbackData(data: string): CallbackEvent | null {
	try {
		const raw = JSON.parse(data);
		const code = raw.k as string;
		const v = raw.v as string | undefined;
		const a = raw.a as string | undefined;

		const kind = REVERSE_KINDS[code];
		if (!kind) return null;

		switch (kind) {
			case "report_init":
			case "report_confirm":
			case "report_replacement_yes":
			case "report_replacement_no":
			case "report_cancel":
			case "uploader_admitted":
			case "uploader_denied":
				if (!v) return null;
				return { kind, voucherId: v };
			case "help":
				if (!a) return null;
				return { kind: "help", action: a as HelpAction };
			case "faq":
				if (!a) return null;
				return { kind: "faq", action: a as FaqAction };
			default:
				return null;
		}
	} catch {
		return null;
	}
}

export function reportData(
	kind: "report_init" | "report_confirm" | "report_replacement_yes" | "report_replacement_no" | "report_cancel",
	voucherId: string,
): string {
	return JSON.stringify({ k: CALLBACK_KINDS[kind], v: voucherId });
}

export function helpData(action: HelpAction): string {
	return JSON.stringify({ k: CALLBACK_KINDS.help, a: action });
}

export function faqData(action: FaqAction): string {
	return JSON.stringify({ k: CALLBACK_KINDS.faq, a: action });
}

export function uploaderData(
	kind: "uploader_admitted" | "uploader_denied",
	voucherId: string,
): string {
	return JSON.stringify({ k: CALLBACK_KINDS[kind], v: voucherId });
}

export async function dispatch(
	c: CallbackContext,
	rawData: string,
	bot: BotAdapter,
) {
	const event = parseCallbackData(rawData);
	if (!event) {
		console.warn("Unrecognized callback data:", rawData);
		return;
	}

	const handler = handlers.get(event.kind);
	if (!handler) {
		console.warn("No handler for callback kind:", event.kind);
		return;
	}

	await handler(c, event, bot);
}
