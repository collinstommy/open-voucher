import type { InboundClassification } from "./intentClassifier";

export type IntentEvalCase = {
	text: string;
	expected: InboundClassification;
};

export const INTENT_EVAL_SET: IntentEvalCase[] = [
	{ text: "Can I return an unused voucher?", expected: "return_voucher" },
	{ text: "I did not use this", expected: "return_voucher" },
	{ text: "Do not need this anymore", expected: "return_voucher" },
	{ text: "I want to cancel", expected: "return_voucher" },
	{ text: "Can I give it back?", expected: "return_voucher" },
	{ text: "I'm returning it", expected: "return_voucher" },
	{ text: "I don't need it", expected: "return_voucher" },
	{
		text: "What to do if you do not need the voucher. Do not want to waste it",
		expected: "return_voucher",
	},
	{ text: "Can I sent this back? I haven't used it", expected: "return_voucher" },
	{ text: "Didn't use the voucher", expected: "return_voucher" },
	{
		text: "I have uploaded a 5 off 25 voucher but it was used by my partner. I want the last uploaded one to be cancelled",
		expected: "revoke_upload",
	},
	{
		text: "Hi i have used this voucher now, please take it out",
		expected: "revoke_upload",
	},
	{
		text: "I accidentally uploaded wrong image of 5 off 25 but got the points fyi",
		expected: "revoke_upload",
	},
	{ text: "Uploaded wrong image", expected: "revoke_upload" },
	{
		text: "I want the ability to cancel already uploaded vouchers since I have decided on using it",
		expected: "revoke_upload",
	},
	{ text: "One not working", expected: "report_not_working" },
	{
		text: "This didn't work and I had to use the voucher from dunnes wallet",
		expected: "report_not_working",
	},
	{ text: "My voucher didn't work yesterday", expected: "report_not_working" },
	{ text: "not working", expected: "report_not_working" },
	{ text: "How do i use these in dunnes", expected: "how_does_it_work" },
	{ text: "How do I get coins", expected: "how_does_it_work" },
	{ text: "How do I upload a voucher", expected: "how_does_it_work" },
	{ text: "Explain the vouchers", expected: "how_does_it_work" },
	{ text: "What does 10 coins mean", expected: "how_does_it_work" },
	{ text: "My points", expected: "balance" },
	{ text: "What's my balance", expected: "balance" },
	{ text: "How many voucher can I get in a month", expected: "limits_question" },
	{ text: "Is this free to use?", expected: "limits_question" },
	{ text: "How many vouchers can I upload per day?", expected: "limits_question" },
	{ text: "Are there any limits on claiming?", expected: "limits_question" },
	{ text: "Perfect tks", expected: "praise_or_noise" },
	{ text: "Wow thank you", expected: "praise_or_noise" },
	{ text: "Apologies", expected: "praise_or_noise" },
	{ text: "Don't need it thanks", expected: "return_voucher" },
	{ text: "ok", expected: "praise_or_noise" },
	{ text: "test", expected: "praise_or_noise" },
	{ text: "Why am i banned?", expected: "unknown" },
	{ text: "€5 voucher wanted", expected: "how_does_it_work" },
	{ text: "Referral link", expected: "unknown" },
	{ text: "Request 20", expected: "unknown" },
	{ text: "Buy", expected: "unknown" },
];
