import { v } from "convex/values";
import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action, internalAction } from "./_generated/server";
import { assertValidSession } from "../src/lib/adminAuth";
import { classifyInboundMessage } from "../src/lib/messageIntent";
import {
	createBotAdapter,
	realBotAdapter,
	registerTelegramBotCommands,
} from "../src/telegram/botAdapter";
import { reportData, uploaderData } from "../src/telegram/router";
import { helpMenuKeyboard, faqMenuKeyboard, appWebAppKeyboard, feedbackWebAppKeyboard, webAppKeyboard } from "../src/telegram/keyboards";
import "../src/telegram/handlers/report";
import "../src/telegram/handlers/help";
import "../src/telegram/handlers/faq";
import "../src/telegram/handlers/uploader";
import { dispatch } from "../src/telegram/router";
import type { CallbackContext } from "../src/telegram/router";

dayjs.extend(advancedFormat);

const outboundBot = realBotAdapter();

async function logTelegramSendError(
	ctx: ActionCtx,
	chatId: string,
	errorText: string,
) {
	await ctx.runMutation(internal.errors.logError, {
		errorType: "telegram_send_message",
		text: `chatId=${chatId}: ${errorText}`,
	});
}

function botWithSendErrorLogging(ctx: ActionCtx) {
	return createBotAdapter({
		onSendMessageError: (chatId, errorText) =>
			logTelegramSendError(ctx, chatId, errorText),
	});
}

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
	await outboundBot.sendMessage(chatId, getWelcomeMessage());
	await ctx.runMutation(internal.users.setUserOnboardingStep, {
		userId: newUser._id,
		step: 1,
	});
	await outboundBot.sendMessage(chatId, TUTORIAL_STEP_1_MESSAGE);
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
			await outboundBot.sendMessage(
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
			await outboundBot.sendMessage(
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
			await outboundBot.sendPhoto(chatId, imageUrl, "Here is your sample voucher!");
		} else {
			console.error("Sample image not found");
			await outboundBot.sendMessage(chatId, "Here is your sample voucher!");
		}
		await ctx.runMutation(internal.users.clearOnboardingTutorial, {
			userId: user._id,
		});
		await outboundBot.sendMessage(chatId, TUTORIAL_COMPLETE_MESSAGE(user.coins));
		return true;
	}

	if (step === 1) {
		await outboundBot.sendMessage(chatId, TUTORIAL_STEP_1_RETRY_MESSAGE);
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
	await outboundBot.sendMessage(chatId, "📸 Processing your voucher...");

	if (!message.photo) {
		await outboundBot.sendMessage(chatId, "❌ No photo found in message.");
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
		await outboundBot.sendMessage(chatId, "❌ Failed to process image.");
	}
}

async function sendHelpMenu(chatId: string) {
	await outboundBot.sendMessage(
		chatId,
		"Choose an option below",
		helpMenuKeyboard(),
	);
}

async function sendFaqMenu(chatId: string) {
	await outboundBot.sendMessage(
		chatId,
		"Choose a FAQ question below",
		faqMenuKeyboard(),
	);
}

async function sendAppWebAppButton(chatId: string) {
	await outboundBot.sendMessage(
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
		await outboundBot.sendMessage(chatId, `💰 You have ${user.coins} coins.`);
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
		await outboundBot.sendMessage(
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
		await outboundBot.sendMessage(
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
		await outboundBot.sendMessage(chatId, `❌ ${result.error}`);
	} else {
		const sent = await outboundBot.sendPhoto(
			chatId,
			result.imageUrl!,
			`✅ <b>Here is your €${type} voucher!</b>\n\nExpires: ${dayjs(result.expiryDate!).format("MMM Do")}\nRemaining coins: ${result.remainingCoins}`,
			{
				inline_keyboard: [
					[
						{
							text: "⚠️ Its not working",
							callback_data: reportData(
								"report_init",
								String(result.voucherId),
							),
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
				await outboundBot.sendMessage(
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
			await outboundBot.sendMessage(
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

		if (intent === "unknown") {
			await ctx.scheduler.runAfter(
				0,
				internal.telegram.classifyUnknown.classifyUnknownMessage,
				{ messageId: messageDbId },
			);
		}
	},
});

export const sendMessageAction = internalAction({
	args: {
		chatId: v.string(),
		text: v.string(),
	},
	handler: async (ctx, { chatId, text }) => {
		await botWithSendErrorLogging(ctx).sendMessage(chatId, text);
	},
});

export const sendWebAppMessageAction = internalAction({
	args: {
		chatId: v.string(),
		text: v.string(),
		webAppUrl: v.string(),
		buttonText: v.optional(v.string()),
	},
	handler: async (ctx, { chatId, text, webAppUrl, buttonText }) => {
		await botWithSendErrorLogging(ctx).sendMessage(
			chatId,
			text,
			webAppKeyboard(webAppUrl, buttonText),
		);
	},
});

function formatAdminTelegramMessage(messageText: string): string {
	return (
		`${messageText}\n\n` +
		"—\n" +
		"<i>Reply in the app (Feedback). Replies in this Telegram chat are not monitored.</i>"
	);
}

export const sendAdminMessageAction = internalAction({
	args: {
		chatId: v.string(),
		text: v.string(),
	},
	handler: async (_ctx, { chatId, text }) => {
		await outboundBot.sendMessage(
			chatId,
			formatAdminTelegramMessage(text),
			feedbackWebAppKeyboard(),
		);
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
		{ uploaderChatId, voucherId, voucherType, imageStorageId, barcodeNumber },
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
			const sent = await outboundBot.sendPhoto(
				uploaderChatId,
				imageUrl,
				caption,
				replyMarkup,
			);
			if (sent) {
				return;
			}
		}

		await outboundBot.sendMessage(uploaderChatId, caption, replyMarkup);
	},
});

export const registerBotCommands = internalAction({
	args: {},
	handler: async () => {
		await registerTelegramBotCommands();
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

async function getTelegramFileUrl(fileId: string): Promise<string> {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	const res = await fetch(
		`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`,
	);
	const data = (await res.json()) as {
		ok: boolean;
		description?: string;
		result?: { file_path?: string };
	};
	if (!data.ok) {
		throw new Error(`Failed to get file path: ${data.description}`);
	}
	return `https://api.telegram.org/file/bot${token}/${data.result?.file_path}`;
}

type HealthCheckResult = {
	ocrTest: { success: boolean; message: string };
	voucherCount: { success: boolean; count: number; message: string };
	telegramToken: { success: boolean; message: string };
};

async function performHealthCheck(ctx: ActionCtx): Promise<HealthCheckResult> {
	const currentYear = new Date().getFullYear();
	const expectedExpiry = `${currentYear}-01-29`;

	const { voucherCount, testImageSetting } = await ctx.runQuery(
		internal.adminSession.getHealthCheckMetrics,
		{},
	);

	let ocrTest: { success: boolean; message: string };
	if (!testImageSetting) {
		ocrTest = {
			success: false,
			message: "No test voucher image configured",
		};
	} else {
		const ocrResult = await ctx.runAction(
			internal.ocr.extractFromImage,
			{ imageStorageId: testImageSetting as Id<"_storage"> },
		);

		if (ocrResult.expiryDate === expectedExpiry) {
			ocrTest = {
				success: true,
				message: `Expiry date ${ocrResult.expiryDate} matches expected ${expectedExpiry}`,
			};
		} else {
			ocrTest = {
				success: false,
				message: `Expected expiry ${expectedExpiry}, got ${ocrResult.expiryDate ?? "null"}`,
			};
		}
	}

	const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
	let telegramTest: { success: boolean; message: string };
	if (!telegramToken) {
		telegramTest = {
			success: false,
			message: "TELEGRAM_BOT_TOKEN not configured",
		};
	} else {
		const response = await fetch(
			`https://api.telegram.org/bot${telegramToken}/getMe`,
		);
		if (response.ok) {
			telegramTest = {
				success: true,
				message: "Telegram token is valid",
			};
		} else {
			telegramTest = {
				success: false,
				message: `Telegram token invalid: ${response.status} ${response.statusText}`,
			};
		}
	}

	return {
		ocrTest,
		voucherCount: {
			success: voucherCount > 20,
			count: voucherCount,
			message:
				voucherCount > 20
					? `${voucherCount} available vouchers (threshold: 20)`
					: `${voucherCount} available vouchers, need > 20`,
		},
		telegramToken: telegramTest,
	};
}

export const runHealthCheck = action({
	args: { token: v.string() },
	handler: async (ctx, { token }) => {
		const session = await ctx.runQuery(internal.adminSession.getSessionByToken, {
			token,
		});
		assertValidSession(session);
		return performHealthCheck(ctx);
	},
});

export const runHealthCheckInternal = internalAction({
	args: {},
	handler: async (ctx) => performHealthCheck(ctx),
});

export const runOcrEvals = action({
	args: {
		token: v.string(),
		images: v.array(
			v.object({
				filename: v.string(),
				imageBase64: v.string(),
			}),
		),
		useOpenRouter: v.optional(v.boolean()),
	},
	handler: async (
		ctx,
		{ token, images, useOpenRouter },
	): Promise<{
		overallSuccess: boolean;
		passed: number;
		total: number;
		results: Array<{
			filename: string;
			testDate: string;
			success: boolean;
			expectedValidFrom: string | undefined;
			expectedExpiry: string;
			actualValidFrom?: string;
			actualExpiry?: string;
			error?: string;
		}>;
	}> => {
		const session = await ctx.runQuery(internal.adminSession.getSessionByToken, {
			token,
		});
		assertValidSession(session);
		return ctx.runAction(internal.ocr.runOcrEvalsInternal, {
			images,
			useOpenRouter,
		});
	},
});

export const runSingleOcrEval = action({
	args: {
		token: v.string(),
		filename: v.string(),
		imageBase64: v.string(),
		useOpenRouter: v.optional(v.boolean()),
	},
	handler: async (
		ctx,
		{ token, filename, imageBase64, useOpenRouter },
	): Promise<{
		filename: string;
		results: Array<{
			filename: string;
			testDate: string;
			success: boolean;
			expectedValidFrom: string | undefined;
			expectedExpiry: string;
			actualValidFrom?: string;
			actualExpiry?: string;
			error?: string;
		}>;
	}> => {
		const session = await ctx.runQuery(internal.adminSession.getSessionByToken, {
			token,
		});
		assertValidSession(session);
		return ctx.runAction(internal.ocr.runImageOcrEval, {
			filename,
			imageBase64,
			useOpenRouter,
		});
	},
});
