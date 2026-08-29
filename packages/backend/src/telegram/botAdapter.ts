import { getMiniAppUrl } from "./keyboards";

export interface InlineKeyboardButton {
	text: string;
	callback_data?: string;
	web_app?: { url: string };
}

export interface BotMessageOptions {
	inline_keyboard?: InlineKeyboardButton[][];
}

export interface BotAdapter {
	sendMessage(
		chatId: string,
		text: string,
		opts?: BotMessageOptions,
	): Promise<void>;
	answerCallback(callbackId: string, text?: string): Promise<void>;
	editMessageText(
		chatId: string,
		messageId: number,
		text: string,
		opts?: { isPhoto?: boolean },
	): Promise<void>;
	sendPhoto(
		chatId: string,
		photoUrl: string,
		caption: string,
		opts?: BotMessageOptions,
	): Promise<boolean>;
}

export type TelegramSendHooks = {
	onSendMessageError?: (
		chatId: string,
		errorText: string,
	) => void | Promise<void>;
	onSendPhotoError?: (
		chatId: string,
		errorText: string,
	) => void | Promise<void>;
};

export function createBotAdapter(hooks?: TelegramSendHooks): BotAdapter {
	return {
		sendMessage: (chatId, text, opts) =>
			sendTelegramMessage(chatId, text, opts, hooks),
		answerCallback: answerTelegramCallback,
		editMessageText: editTelegramMessageText,
		sendPhoto: (chatId, photoUrl, caption, opts) =>
			sendTelegramPhoto(chatId, photoUrl, caption, opts, hooks),
	};
}

export function realBotAdapter(): BotAdapter {
	return createBotAdapter();
}

export async function registerTelegramBotCommands(): Promise<void> {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) {
		console.error("TELEGRAM_BOT_TOKEN is not set");
		return;
	}

	const commands = [
		{ command: "help", description: "Show help menu" },
		{ command: "balance", description: "Check your coin balance" },
		{ command: "share", description: "Share the bot with friends" },
		{ command: "account", description: "Open My Account" },
		{ command: "donate", description: "Support the project" },
	];

	const url = `https://api.telegram.org/bot${token}/setMyCommands`;
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ commands }),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error("Failed to set bot commands:", errorText);
		} else {
			console.log("Bot commands registered successfully");
		}
	} catch (error) {
		console.error("Network error setting bot commands:", error);
	}

	const menuButtonUrl = `https://api.telegram.org/bot${token}/setChatMenuButton`;
	try {
		const response = await fetch(menuButtonUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				menu_button: {
					type: "web_app",
					text: "My Account",
					web_app: { url: getMiniAppUrl() },
				},
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error("Failed to set chat menu button:", errorText);
		} else {
			console.log("Chat menu button set to My Account Mini App");
		}
	} catch (error) {
		console.error("Network error setting chat menu button:", error);
	}
}

async function sendTelegramMessage(
	chatId: string,
	text: string,
	opts?: BotMessageOptions,
	hooks?: TelegramSendHooks,
) {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) {
		console.error("TELEGRAM_BOT_TOKEN is not set");
		return;
	}

	const url = `https://api.telegram.org/bot${token}/sendMessage`;
	try {
		const body: Record<string, unknown> = {
			chat_id: chatId,
			text,
			parse_mode: "HTML",
		};
		if (opts) {
			body.reply_markup = JSON.stringify(opts);
		}
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error("Failed to send Telegram message:", errorText);
			await hooks?.onSendMessageError?.(chatId, errorText);
		}
	} catch (error) {
		console.error("Network error sending Telegram message:", error);
		const errorText = error instanceof Error ? error.message : String(error);
		await hooks?.onSendMessageError?.(chatId, errorText);
	}
}

async function answerTelegramCallback(callbackQueryId: string, text?: string) {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) {
		return;
	}

	const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
	try {
		await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				callback_query_id: callbackQueryId,
				text: text,
			}),
		});
	} catch (error) {
		console.error("Network error answering callback:", error);
	}
}

async function editTelegramMessageText(
	chatId: string,
	messageId: number,
	text: string,
	opts?: { isPhoto?: boolean },
) {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) {
		return;
	}

	const method = opts?.isPhoto ? "editMessageCaption" : "editMessageText";
	const contentField = opts?.isPhoto ? "caption" : "text";
	const url = `https://api.telegram.org/bot${token}/${method}`;
	try {
		await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chat_id: chatId,
				message_id: messageId,
				[contentField]: text,
				parse_mode: "HTML",
				reply_markup: { inline_keyboard: [] },
			}),
		});
	} catch (error) {
		console.error("Network error editing message:", error);
	}
}

async function sendTelegramPhoto(
	chatId: string,
	photoUrl: string,
	caption: string,
	opts?: BotMessageOptions,
	hooks?: TelegramSendHooks,
): Promise<boolean> {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) {
		return false;
	}

	if (photoUrl === "image") {
		await sendTelegramMessage(
			chatId,
			caption || "Sample image placeholder",
			opts,
			hooks,
		);
		return true;
	}

	const url = `https://api.telegram.org/bot${token}/sendPhoto`;
	try {
		const imageRes = await fetch(photoUrl);
		if (!imageRes.ok) {
			const errorText = `Failed to fetch image: ${imageRes.statusText}`;
			console.error(
				`Failed to fetch image from storage URL: ${photoUrl} - ${imageRes.statusText}`,
			);
			await hooks?.onSendPhotoError?.(chatId, errorText);
			return false;
		}
		const imageBlob = await imageRes.blob();

		const formData = new FormData();
		formData.append("chat_id", chatId);
		formData.append("photo", imageBlob, "voucher.jpg");
		formData.append("caption", caption);
		formData.append("parse_mode", "HTML");
		if (opts) {
			formData.append("reply_markup", JSON.stringify(opts));
		}

		const response = await fetch(url, {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error("Failed to send Telegram photo:", errorText);
			await hooks?.onSendPhotoError?.(chatId, errorText);
			return false;
		}

		return true;
	} catch (error) {
		console.error("Network error sending Telegram photo:", error);
		const errorText = error instanceof Error ? error.message : String(error);
		await hooks?.onSendPhotoError?.(chatId, errorText);
		return false;
	}
}
