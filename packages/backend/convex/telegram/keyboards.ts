import { helpData, faqData } from "./router";
import type { InlineKeyboardButton } from "./botAdapter";

function getMiniAppUrl(): string {
	return process.env.MINI_APP_URL ?? "https://openvouchers.org/app";
}

function getFeedbackAppUrl(): string {
	return `${getMiniAppUrl().replace(/\/$/, "")}/feedback`;
}

export function helpMenuKeyboard(): { inline_keyboard: InlineKeyboardButton[][] } {
	return {
		inline_keyboard: [
			[
				{ text: "💰 Balance", callback_data: helpData("balance") },
				{
					text: "📱 My Account",
					web_app: { url: getMiniAppUrl() },
				},
			],
			[
				{ text: "📸 How to Upload", callback_data: helpData("upload") },
				{ text: "🎫 How to Claim", callback_data: helpData("claim") },
			],
			[{ text: "🔗 Share Bot", callback_data: helpData("share") }],
			[{ text: "☕ Donate", callback_data: helpData("donate") }],
		],
	};
}

export function faqMenuKeyboard(): { inline_keyboard: InlineKeyboardButton[][] } {
	return {
		inline_keyboard: [
			[
				{
					text: "Can I return/cancel a voucher?",
					callback_data: faqData("return_cancel"),
				},
			],
			[
				{
					text: "Voucher processing failed",
					callback_data: faqData("processing_failed"),
				},
			],
			[{ text: "Back to Help", callback_data: faqData("back") }],
		],
	};
}

export function appWebAppKeyboard(): { inline_keyboard: InlineKeyboardButton[][] } {
	return {
		inline_keyboard: [
			[
				{
					text: "📱 Open My Account",
					web_app: { url: getMiniAppUrl() },
				},
			],
		],
	};
}

export function feedbackWebAppKeyboard(): {
	inline_keyboard: InlineKeyboardButton[][];
} {
	return {
		inline_keyboard: [
			[
				{
					text: "💬 Reply in Feedback",
					web_app: { url: getFeedbackAppUrl() },
				},
			],
		],
	};
}
