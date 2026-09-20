// Telegram Update fixtures for E2E tests.
//
// Captured from the dev deployment webhook logs (convex/http.ts logs every
// update) on 2026-08-30 and sanitized: chat/user ids, first_name, bot identity,
// file ids, voucher ids, and chat_instance are replaced with test-controlled
// values. Chat ids and ids arrive as function arguments, so the same sanitized
// templates serve every run.

let updateIdCounter = 1_000_000;
let messageIdCounter = 5_000;
let callbackIdCounter = 90_000;

/** Unique per call, mirroring Telegram's monotonic update_id. */
export function nextUpdateId(): number {
	return updateIdCounter++;
}

interface TelegramUser {
	id: number;
	is_bot: boolean;
	first_name: string;
	username?: string;
	language_code?: string;
}

interface TelegramChat {
	id: number;
	first_name: string;
	type: "private";
}

function senderUser(chatId: number): TelegramUser {
	return {
		id: chatId,
		is_bot: false,
		first_name: "E2E",
		language_code: "en",
	};
}

function senderChat(chatId: number): TelegramChat {
	return { id: chatId, first_name: "E2E", type: "private" };
}

const BOT_USER = {
	id: 42,
	is_bot: true,
	first_name: "E2EDunnesVoucherBot",
	username: "E2EDunnesVoucherBot",
};

const CHAT_INSTANCE = "-1000000000000000001";

// Sanitized placeholder file ids (shape only; the fake Bot API serves the bytes).
const PHOTO_FILE_IDS = [
	"AgACAgQAAxkE2EFAKEFILEID0AAKzEGsb6LKgAAKzEGsb6LKgAQADAgADcwADPQQ",
	"AgACAgQAAxkE2EFAKEFILEID0AAKzEGsb6LKgAAKzEGsb6LKgAQADAgADbQADPQQ",
	"AgACAgQAAxkE2EFAKEFILEID0AAKzEGsb6LKgAAKzEGsb6LKgAQADAgADeAADPQQ",
	"AgACAgQAAxkE2EFAKEFILEID0AAKzEGsb6LKgAAKzEGsb6LKgAQADAgADeQADPQQ",
];

/** A text message from a private chat (e.g. /start, a claim request). */
export function messageText(
	chatId: number,
	text: string,
): Record<string, unknown> {
	const isCommand = text.startsWith("/");
	return {
		update_id: nextUpdateId(),
		message: {
			message_id: messageIdCounter++,
			from: senderUser(chatId),
			chat: senderChat(chatId),
			date: Math.floor(Date.now() / 1000),
			text,
			...(isCommand
				? {
						entities: [{ offset: 0, length: text.length, type: "bot_command" }],
					}
				: {}),
		},
	};
}

/**
 * Photo upload with Telegram's photo size array (captured: four descending
 * sizes). The bot's upload handler uses the last entry's file_id.
 */
export function messagePhoto(
	chatId: number,
	fileId: string,
): Record<string, unknown> {
	const sizes = [
		{ file_size: 1000, width: 40, height: 90 },
		{ file_size: 8708, width: 144, height: 320 },
		{ file_size: 30513, width: 359, height: 800 },
		{ file_size: 53313, width: 574, height: 1280 },
	];
	return {
		update_id: nextUpdateId(),
		message: {
			message_id: messageIdCounter++,
			from: senderUser(chatId),
			chat: senderChat(chatId),
			date: Math.floor(Date.now() / 1000),
			photo: sizes.map((size, index) => ({
				file_id: index === sizes.length - 1 ? fileId : PHOTO_FILE_IDS[index],
				file_unique_id: `uniq-${chatId}-${index}`,
				...size,
			})),
		},
	};
}

const VOUCHER_CAPTION =
	"✅ Here is your €10 voucher!\n\nExpires: Sep 8th\nRemaining coins: 5";

/**
 * Callback query from tapping an inline keyboard button. Captured reality:
 * report_init arrives on the claimed voucher's photo message (caption +
 * photo array), report_confirm on a text message with entities.
 */
export function callbackQuery(args: {
	chatId: number;
	messageId: number;
	data: string;
	isPhoto?: boolean;
}): Record<string, unknown> {
	const message: Record<string, unknown> = {
		message_id: args.messageId,
		from: BOT_USER,
		chat: senderChat(args.chatId),
		date: Math.floor(Date.now() / 1000),
	};
	if (args.isPhoto) {
		message.photo = PHOTO_FILE_IDS.map((fileId, index) => ({
			file_id: fileId,
			file_unique_id: `uniq-cb-${index}`,
			file_size: 1000 + index,
			width: 40,
			height: 90,
		}));
		message.caption = VOUCHER_CAPTION;
		message.caption_entities = [{ offset: 2, length: 25, type: "bold" }];
	} else {
		message.text =
			"⚠️ Report this voucher as not working?\n\nYou can request a replacement voucher if you need one.";
		message.entities = [{ offset: 3, length: 35, type: "bold" }];
	}
	return {
		update_id: nextUpdateId(),
		callback_query: {
			id: String(callbackIdCounter++),
			from: senderUser(args.chatId),
			message,
			chat_instance: CHAT_INSTANCE,
			data: args.data,
		},
	};
}

// Malformed payload set for webhook robustness tests.

export const malformed = {
	/** Valid JSON, wrong top-level shape (e.g. a stripped-down update). */
	emptyObject: {},
	/** Update with neither message nor callback_query. */
	noKnownField: { update_id: 1, edited_message: { text: "hi" } },
};
