import { v } from "convex/values";
import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { internalAction } from "./_generated/server";
import { UPLOAD_REWARDS } from "./constants";
import { classifyInboundMessage } from "./lib/messageIntent";
import { realBotAdapter } from "./telegram/botAdapter";
import { reportData, uploaderData } from "./telegram/router";
import { helpMenuKeyboard, faqMenuKeyboard, appWebAppKeyboard } from "./telegram/keyboards";
import "./telegram/handlers/report";
import "./telegram/handlers/help";
import "./telegram/handlers/faq";
import "./telegram/handlers/uploader";
import { dispatch } from "./telegram/router";
import type { CallbackContext } from "./telegram/router";

dayjs.extend(advancedFormat);

type TelegramUserState =
	| "waiting_for_support_message"
	| "waiting_for_ban_appeal"
	| "onboarding_tutorial";

interface User {
	_id: Id<"users">;
	telegramChatId: string;
	username?: string;
	firstName?: string;
	coins: number;
	isBanned: boolean;
	inviteCode?: string;
	createdAt: number;
	lastActiveAt: number;
	bannedAt?: number;
	uploadCount?: number;
	claimCount?: number;
	uploadReportCount?: number;
	claimReportCount?: number;
	lastReportAt?: number;
	onboardingStep?: number;
	telegramState?: TelegramUserState;
}

const TUTORIAL_VOUCHER_AMOUNT = 10;

const TUTORIAL_STEP_1_MESSAGE = `Let's show you how to use the bot. Send the number <b>${TUTORIAL_VOUCHER_AMOUNT}</b> to get a voucher.`;

const TUTORIAL_STEP_1_RETRY_MESSAGE = `Please send the number <b>${TUTORIAL_VOUCHER_AMOUNT}</b> to continue the tutorial.`;

const TUTORIAL_COMPLETE_MESSAGE = (coins: number) => `
You are now ready to go!

We've given you a welcome bonus of <b>${coins} coins</b> to get you started! 🚀

<b>How it works:</b>
• Upload a voucher → Earn coins
• Claim a voucher → Spend coins

<b>Coin Values:</b>
€5 voucher = 15 coins
€10 voucher = 10 coins
€20 voucher = 5 coins

📤 <b>Got a voucher?</b> Upload a screenshot via the paperclip icon
🙏 <b>Need a voucher?</b> Reply with just <b>5</b>, <b>10</b>, or <b>20</b>
📱 <b>Check balance & get help:</b> Tap the "My Account" button below

<b>Important</b>
• Please do not use vouchers you have already uploaded. Request a voucher through the bot instead.
• Only report a voucher as not working, when it does not scan at the till. Please do not report a voucher for any other reason.
`;

function getWelcomeMessage(): string {
	return "🎉 <b>Welcome to Dunnes Voucher Bot!</b>";
}

async function getSampleVoucherImageUrl(
	ctx: ActionCtx,
): Promise<string | null> {
	const storageId = await ctx.runQuery(internal.settings.getSetting, {
		key: "sample-voucher-image",
	});
	if (!storageId) return null;
	return await ctx.storage.getUrl(storageId);
}

async function handleNewUser(
	ctx: ActionCtx,
	chatId: string,
	username: string | undefined,
	firstName: string,
) {
	const newUser = await ctx.runMutation(internal.users.createUser, {
		telegramChatId: chatId,
		username,
		firstName,
	});
	await sendTelegramMessage(chatId, getWelcomeMessage());
	await ctx.runMutation(internal.users.setUserOnboardingStep, {
		userId: newUser._id,
		step: 1,
	});
	await sendTelegramMessage(chatId, TUTORIAL_STEP_1_MESSAGE);
}

async function handleUserState(
	ctx: ActionCtx,
	chatId: string,
	text: string,
	user: User,
) {
	switch (user.telegramState) {
		case "waiting_for_support_message":
			await ctx.runMutation(internal.users.submitFeedback, {
				userId: user._id,
				text,
				type: "support",
			});
			await ctx.runMutation(internal.users.clearUserTelegramState, {
				userId: user._id,
			});
			await sendTelegramMessage(
				chatId,
				"✅ Your support request has been received. We'll review your case and get back to you.",
			);
			return true;

		case "waiting_for_ban_appeal":
			await ctx.runMutation(internal.users.submitFeedback, {
				userId: user._id,
				text,
				type: "support",
			});
			await ctx.runMutation(internal.users.clearUserTelegramState, {
				userId: user._id,
			});
			await sendTelegramMessage(
				chatId,
				"✅ Your appeal has been received. We'll review your case and get back to you.",
			);
			return true;

		case "onboarding_tutorial":
			return await handleOnboardingTutorial(ctx, chatId, text, user);

		default:
			return false;
	}
}

async function handleOnboardingTutorial(
	ctx: ActionCtx,
	chatId: string,
	text: string,
	user: User,
) {
	const step = user.onboardingStep ?? 1;

	if (
		step === 1 &&
		text.toLowerCase().trim() === String(TUTORIAL_VOUCHER_AMOUNT)
	) {
		await ctx.runMutation(internal.users.setUserOnboardingStep, {
			userId: user._id,
			step: 2,
		});
		const imageUrl = await getSampleVoucherImageUrl(ctx);
		if (imageUrl) {
			await sendTelegramPhoto(chatId, imageUrl, "Here is your sample voucher!");
		} else {
			console.error("Sample image not found");
			await sendTelegramMessage(chatId, "Here is your sample voucher!");
		}
		await ctx.runMutation(internal.users.clearOnboardingTutorial, {
			userId: user._id,
		});
		await sendTelegramMessage(chatId, TUTORIAL_COMPLETE_MESSAGE(user.coins));
		return true;
	}

	if (step === 1) {
		await sendTelegramMessage(chatId, TUTORIAL_STEP_1_RETRY_MESSAGE);
		return true;
	}

	return false;
}

async function handleImageUpload(
	ctx: ActionCtx,
	chatId: string,
	message: {
		chat: { id: number };
		message_id: number;
		text?: string;
		caption?: string;
		from: { username?: string; first_name: string };
		photo?: Array<{ file_id: string }>;
		media_group_id?: string;
	},
	messageDbId: Id<"messages"> | undefined,
	user: User,
) {
	await sendTelegramMessage(chatId, "📸 Processing your voucher...");

	if (!message.photo) {
		await sendTelegramMessage(chatId, "❌ No photo found in message.");
		return;
	}

	const photo = message.photo[message.photo.length - 1];
	const fileId = photo.file_id;

	try {
		const imageUrl = await getTelegramFileUrl(fileId);
		const imageBlob = await fetch(imageUrl).then((r) => r.blob());
		const storageId = await ctx.storage.store(imageBlob);

		if (messageDbId) {
			await ctx.runMutation(internal.users.patchMessageImage, {
				messageId: messageDbId,
				imageStorageId: storageId,
			});
		}

		await ctx.runMutation(internal.vouchers.uploadVoucher, {
			userId: user._id,
			imageStorageId: storageId,
		});
	} catch (e) {
		console.error(e);
		await sendTelegramMessage(chatId, "❌ Failed to process image.");
	}
}

function getMiniAppUrl(): string {
	return process.env.MINI_APP_URL ?? "https://openvouchers.org/app";
}

async function sendHelpMenu(chatId: string) {
	await sendTelegramMessage(chatId, "Choose an option below", helpMenuKeyboard());
}

async function sendFaqMenu(chatId: string) {
	await sendTelegramMessage(chatId, "Choose a FAQ question below", faqMenuKeyboard());
}

async function sendAppWebAppButton(chatId: string) {
	await sendTelegramMessage(
		chatId,
		"📱 <b>My Account</b>\n\nView your balance, transactions, and voucher availability.",
		appWebAppKeyboard(),
	);
}

async function handleCommand(
	ctx: ActionCtx,
	chatId: string,
	lowerText: string,
	text: string,
	user: User,
) {
	if (lowerText === "start") {
		await sendHelpMenu(chatId);
		return true;
	}

	if (lowerText === "balance") {
		await sendTelegramMessage(chatId, `💰 You have ${user.coins} coins.`);
		return true;
	}

	if (lowerText === "help") {
		await sendHelpMenu(chatId);
		return true;
	}

	if (lowerText === "faq") {
		await sendFaqMenu(chatId);
		return true;
	}

	if (lowerText === "donate") {
		await sendTelegramMessage(
			chatId,
			"☕ <b>Support Open Vouchers</b>\n\nThe service is free, but servers and AI-powered OCR aren't. Your support helps keep the lights on!\n\nhttps://buymeacoffee.com/openvouchers",
		);
		return true;
	}

	if (lowerText === "account" || lowerText === "app") {
		await sendAppWebAppButton(chatId);
		return true;
	}

	if (lowerText === "share") {
		await sendTelegramMessage(
			chatId,
			"🔗 Swap and share Dunnes Stores vouchers:\nhttps://openvouchers.org/telegram\n\nNew users get a <b>10-coin welcome bonus</b>!",
		);
		return true;
	}

	return false;
}

async function handleVoucherRequest(
	ctx: ActionCtx,
	chatId: string,
	lowerText: string,
	user: User,
) {
	const match = lowerText.match(/\b(5|10|20)\b/);
	if (!match) return false;

	// Only respond if message is short (< 10 chars)
	if (lowerText.length >= 10) return false;

	const type = match[1] as "5" | "10" | "20";
	const result = await ctx.runMutation(internal.vouchers.requestVoucher, {
		userId: user._id,
		type,
	});

	if (!result.success) {
		await sendTelegramMessage(chatId, `❌ ${result.error}`);
	} else {
		const sent = await sendTelegramPhoto(
			chatId,
			result.imageUrl!,
			`✅ <b>Here is your €${type} voucher!</b>\n\nExpires: ${dayjs(result.expiryDate!).format("MMM Do")}\nRemaining coins: ${result.remainingCoins}`,
			{
				inline_keyboard: [
					[
						{
							text: "⚠️ Its not working",
							callback_data: reportData("report_init", String(result.voucherId)),
						},
					],
				],
			},
		);

		if (!sent) {
			const refundResult = await ctx.runMutation(
				internal.vouchers.refundFailedClaimDelivery,
				{
					userId: user._id,
					voucherId: result.voucherId as Id<"vouchers">,
					type,
				},
			);

			if (refundResult.refunded) {
				await sendTelegramMessage(
					chatId,
					`⚠️ We couldn't deliver your voucher image right now. Your ${refundResult.refundAmount} coins were refunded automatically. Please try requesting again.`,
				);
			}
		}
	}
	return true;
}

export const handleTelegramMessage = internalAction({
	args: {
		message: v.any(),
	},
	handler: async (ctx, { message }) => {
		const chatId = String(message.chat.id);
		const messageId = message.message_id;
		const text = message.text || message.caption || "";
		const username = message.from.username;
		const firstName = message.from.first_name;
		const isImage = !!message.photo;
		const mediaGroupId = message.media_group_id;

		const user = await ctx.runQuery(internal.users.getUserByTelegramChatId, {
			telegramChatId: chatId,
		});

		const intent = classifyInboundMessage({
			text,
			messageType: isImage ? "image" : "text",
			userState: user?.telegramState,
		});

		// 1. Idempotency Check & Storage
		const messageDbId = (await ctx.runMutation(internal.users.storeMessage, {
			telegramMessageId: messageId,
			telegramChatId: chatId,
			direction: "inbound",
			messageType: isImage ? "image" : "text",
			text: text,
			mediaGroupId,
			imageStorageId: undefined,
			intent,
		})) as Id<"messages"> | null;

		if (!messageDbId) {
			console.log(`Duplicate message ${messageId} from ${chatId}, ignoring.`);
			return;
		}

		if (!user) {
			await handleNewUser(ctx, chatId, username, firstName);
			return;
		}

		// handle user state (support, feedback, onboarding, etc.)
		const stateHandled = await handleUserState(ctx, chatId, text, user);
		if (stateHandled) return;

		if (user.isBanned) {
			await ctx.runMutation(internal.users.setUserTelegramState, {
				userId: user._id,
				state: "waiting_for_ban_appeal",
			});
			await sendTelegramMessage(
				chatId,
				"🚫 Your account has been banned for misuse.\n\nPlease reply with a message describing if you think this is an error.",
			);
			return;
		}

		if (isImage) {
			await handleImageUpload(ctx, chatId, message, messageDbId, user);
			return;
		}

		const lowerText = text.toLowerCase().trim().replace(/^\//, "");

		if (await handleCommand(ctx, chatId, lowerText, text, user)) return;

		if (await handleVoucherRequest(ctx, chatId, lowerText, user)) return;
	},
});

export const sendMessageAction = internalAction({
	args: {
		chatId: v.string(),
		text: v.string(),
	},
	handler: async (_ctx, { chatId, text }) => {
		await sendTelegramMessage(chatId, text);
	},
});

function formatUploaderReportCaption(
	voucherType: "5" | "10" | "20",
	barcodeNumber?: string,
): string {
	const suffix =
		barcodeNumber && barcodeNumber.length >= 4
			? barcodeNumber.slice(-4)
			: barcodeNumber;
	const voucherLabel = suffix
		? `€${voucherType} voucher (ending in ${suffix})`
		: `€${voucherType} voucher`;

	return (
		"⚠️ <b>Someone has reported one of your vouchers as not working.</b>\n\n" +
		`${voucherLabel}\n\n` +
		"Did you use this voucher already?"
	);
}

export const sendUploaderReportMessage = internalAction({
	args: {
		uploaderChatId: v.string(),
		voucherId: v.id("vouchers"),
		voucherType: v.union(v.literal("5"), v.literal("10"), v.literal("20")),
		imageStorageId: v.id("_storage"),
		barcodeNumber: v.optional(v.string()),
	},
	handler: async (
		ctx,
		{
			uploaderChatId,
			voucherId,
			voucherType,
			imageStorageId,
			barcodeNumber,
		},
	) => {
		const replyMarkup = {
			inline_keyboard: [
				[
					{
						text: "I've used this voucher",
						callback_data: uploaderData("uploader_admitted", voucherId),
					},
				],
				[
					{
						text: "They're lying",
						callback_data: uploaderData("uploader_denied", voucherId),
					},
				],
			],
		};
		const caption = formatUploaderReportCaption(voucherType, barcodeNumber);
		const imageUrl = await ctx.storage.getUrl(imageStorageId);

		if (imageUrl) {
			const sent = await sendTelegramPhoto(
				uploaderChatId,
				imageUrl,
				caption,
				replyMarkup,
			);
			if (sent) {
				return;
			}
		}

		await sendTelegramMessage(uploaderChatId, caption, replyMarkup);
	},
});

async function sendTelegramMessage(
	chatId: string,
	text: string,
	replyMarkup?: Record<string, unknown>,
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
		if (replyMarkup) {
			body.reply_markup = JSON.stringify(replyMarkup);
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

async function sendTelegramPhoto(
	chatId: string,
	photoUrl: string,
	caption?: string,
	replyMarkup?: Record<string, unknown>,
): Promise<boolean> {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) {
		return false;
	}

	if (photoUrl === "image") {
		await sendTelegramMessage(
			chatId,
			caption || "Sample image placeholder",
			replyMarkup,
		);
		return true;
	}

	const url = `https://api.telegram.org/bot${token}/sendPhoto`;
	try {
		const imageRes = await fetch(photoUrl);
		if (!imageRes.ok) {
			console.error(
				`Failed to fetch image from storage URL: ${photoUrl} - ${imageRes.statusText}`,
			);
			return false;
		}
		const imageBlob = await imageRes.blob();

		const formData = new FormData();
		formData.append("chat_id", chatId);
		formData.append("photo", imageBlob, "voucher.jpg");
		if (caption) {
			formData.append("caption", caption);
			formData.append("parse_mode", "HTML");
		}
		if (replyMarkup) {
			formData.append("reply_markup", JSON.stringify(replyMarkup));
		}

		// 3. Send to Telegram
		const response = await fetch(url, {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error("Failed to send Telegram photo:", errorText);
			return false;
		}

		return true;
	} catch (error) {
		console.error("Network error sending Telegram photo:", error);
		return false;
	}
}

async function setBotCommands() {
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

export const registerBotCommands = internalAction({
	args: {},
	handler: async () => {
		await setBotCommands();
	},
});

export const handleTelegramCallback = internalAction({
	args: {
		callbackQuery: v.any(),
	},
	handler: async (ctx, { callbackQuery }) => {
		const c: CallbackContext = {
			ctx,
			chatId: String(callbackQuery.message.chat.id),
			telegramUserId: String(callbackQuery.from.id),
			callbackId: callbackQuery.id,
			messageId: callbackQuery.message.message_id,
			messageText:
				callbackQuery.message.text ?? callbackQuery.message.caption ?? "",
			isPhotoMessage:
				Array.isArray(callbackQuery.message.photo) &&
				callbackQuery.message.photo.length > 0,
		};
		await dispatch(c, callbackQuery.data, realBotAdapter());
	},
});

async function editTelegramMessageText(
	chatId: string,
	messageId: number,
	text: string,
) {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) {
		return;
	}

	const url = `https://api.telegram.org/bot${token}/editMessageText`;
	try {
		await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chat_id: chatId,
				message_id: messageId,
				text,
				parse_mode: "HTML",
				reply_markup: { inline_keyboard: [] },
			}),
		});
	} catch (error) {
		console.error("Network error editing message text:", error);
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

async function getTelegramFileUrl(fileId: string): Promise<string> {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	const res = await fetch(
		`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`,
	);
	const data = await res.json();
	if (!data.ok) {
		throw new Error(`Failed to get file path: ${data.description}`);
	}
	return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
}
