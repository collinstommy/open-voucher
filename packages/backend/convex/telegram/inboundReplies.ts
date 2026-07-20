import { getMiniAppUrl, webAppKeyboard } from "./keyboards";
import type { InboundClassification } from "../lib/messageIntent";

export const RETURN_VOUCHER_REPLY_TEXT =
	"To return a voucher you didn't use, open <b>My Claims</b>.";

export const REPORT_NOT_WORKING_REPLY_TEXT =
	"Find the voucher in your chat history and tap <b>Report</b> for a replacement.";

export type WebAppReply = {
	kind: "web_app";
	text: string;
	webAppUrl: string;
	buttonText?: string;
};

export type TextReply = {
	kind: "text";
	text: string;
};

export type ClassifiedReply = WebAppReply | TextReply;

function buildUrl(path: string): string {
	const base = getMiniAppUrl().replace(/\/$/, "");
	return `${base}${path}`;
}

const WEB_APP_REPLIES: Record<
	Exclude<
		InboundClassification,
		"praise_or_noise" | "unknown" | "balance" | "report_not_working"
	>,
	WebAppReply
> = {
	return_voucher: {
		kind: "web_app",
		text: RETURN_VOUCHER_REPLY_TEXT,
		webAppUrl: buildUrl("/my-claims"),
		buttonText: "📱 Open My Claims",
	},
	revoke_upload: {
		kind: "web_app",
		text: "To pull back a voucher you uploaded by mistake, open <b>My Uploads</b>.",
		webAppUrl: buildUrl("/my-uploads"),
		buttonText: "📱 Open My Uploads",
	},
	how_does_it_work: {
		kind: "web_app",
		text: "Find the answer in our <b>FAQ</b>.",
		webAppUrl: buildUrl("/faq"),
	},
	limits_question: {
		kind: "web_app",
		text: "See our limits in <b>FAQ</b>.",
		webAppUrl: buildUrl("/faq?item=are-there-any-limits"),
	},
};

export function replyForClassification(
	classification: InboundClassification,
): ClassifiedReply | null {
	if (classification === "praise_or_noise" || classification === "unknown") {
		return null;
	}

	if (classification === "balance") {
		return null;
	}

	if (classification === "report_not_working") {
		return {
			kind: "text",
			text: REPORT_NOT_WORKING_REPLY_TEXT,
		};
	}

	return WEB_APP_REPLIES[classification];
}

export function returnVoucherReplyKeyboard() {
	return webAppKeyboard(buildUrl("/my-claims"), "📱 Open My Claims");
}
