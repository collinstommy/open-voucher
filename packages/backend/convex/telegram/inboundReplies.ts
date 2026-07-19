import { getMiniAppUrl } from "./keyboards";
import type { InboundClassification } from "../lib/messageIntent";

export type ReplyPayload = {
	text: string;
	webAppUrl: string;
};

function buildUrl(path: string): string {
	const base = getMiniAppUrl().replace(/\/$/, "");
	return `${base}${path}`;
}

const REPLIES: Record<
	Exclude<InboundClassification, "praise_or_noise" | "unknown">,
	ReplyPayload
> = {
	return_voucher: {
		text: "To return a voucher you didn't use, open <b>My Claims</b>.",
		webAppUrl: buildUrl("/my-claims"),
	},
	revoke_upload: {
		text: "To pull back a voucher you uploaded by mistake, open <b>My Uploads</b>.",
		webAppUrl: buildUrl("/my-uploads"),
	},
	report_not_working: {
		text: "Find the voucher in your chat history and tap <b>Report</b> for a replacement.",
		webAppUrl: buildUrl("/my-claims"),
	},
	how_does_it_work: {
		text: "Find the answer in our <b>FAQ</b>.",
		webAppUrl: buildUrl("/faq"),
	},
	balance: {
		text: "Your balance will appear here.",
		webAppUrl: buildUrl("/account"),
	},
	limits_question: {
		text: "See our limits in <b>FAQ</b>.",
		webAppUrl: buildUrl("/faq?item=are-there-any-limits"),
	},
};

export function replyForClassification(
	classification: InboundClassification,
): ReplyPayload | null {
	if (classification === "praise_or_noise" || classification === "unknown") {
		return null;
	}
	return REPLIES[classification];
}
