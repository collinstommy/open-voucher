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
	): Promise<void>;
}

export function realBotAdapter(): BotAdapter {
	return {
		sendMessage: sendTelegramMessage,
		answerCallback: answerTelegramCallback,
		editMessageText: editTelegramMessageText,
		sendPhoto: sendTelegramPhoto,
	};
}

async function sendTelegramMessage(
	chatId: string,
	text: string,
	opts?: BotMessageOptions,
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
		}
	} catch (error) {
		console.error("Network error sending Telegram message:", error);
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
): Promise<void> {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) {
		return;
	}

	if (photoUrl === "image") {
		await sendTelegramMessage(chatId, caption || "Sample image placeholder", opts);
		return;
	}

	const url = `https://api.telegram.org/bot${token}/sendPhoto`;
	try {
		const imageRes = await fetch(photoUrl);
		if (!imageRes.ok) {
			console.error(
				`Failed to fetch image from storage URL: ${photoUrl} - ${imageRes.statusText}`,
			);
			return;
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
		}
	} catch (error) {
		console.error("Network error sending Telegram photo:", error);
	}
}
