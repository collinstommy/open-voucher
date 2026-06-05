import type { ActionCtx } from "../_generated/server";
import type { BotAdapter } from "./botAdapter";

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
	| { kind: "report:init"; voucherId: string }
	| { kind: "report:confirm"; voucherId: string }
	| { kind: "report:replacement_yes"; voucherId: string }
	| { kind: "report:replacement_no"; voucherId: string }
	| { kind: "report:cancel"; voucherId: string }
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
		const k = raw.k as string;
		const v = raw.v as string | undefined;
		const a = raw.a as string | undefined;

		switch (k) {
			case "report:init":
			case "report:confirm":
			case "report:replacement_yes":
			case "report:replacement_no":
			case "report:cancel":
				if (!v) return null;
				return { kind: k, voucherId: v };
			case "help":
				if (!a) return null;
				return { kind: "help", action: a as HelpAction };
			case "faq":
				if (!a) return null;
				return { kind: "faq", action: a as FaqAction };
			case "uploader_admitted":
			case "uploader_denied":
				if (!v) return null;
				return { kind: k, voucherId: v };
			default:
				return null;
		}
	} catch {
		return null;
	}
}

export function reportData(
	kind:
		| "report:init"
		| "report:confirm"
		| "report:replacement_yes"
		| "report:replacement_no"
		| "report:cancel",
	voucherId: string,
): string {
	return JSON.stringify({ k: kind, v: voucherId });
}

export function helpData(action: HelpAction): string {
	return JSON.stringify({ k: "help", a: action });
}

export function faqData(action: FaqAction): string {
	return JSON.stringify({ k: "faq", a: action });
}

export function uploaderData(
	kind: "uploader_admitted" | "uploader_denied",
	voucherId: string,
): string {
	return JSON.stringify({ k: kind, v: voucherId });
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
