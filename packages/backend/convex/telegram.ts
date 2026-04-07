import { v } from "convex/values";
import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { internalAction } from "./_generated/server";
import { UPLOAD_REWARDS } from "./constants";

dayjs.extend(advancedFormat);

type TelegramUserState =
	| "waiting_for_support_message"
	| "waiting_for_feedback_message"
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
💰 <b>Check Balance:</b> Send <b>balance</b>
❓ <b>Get Help:</b> Send <b>help</b>

<b>Important</b>
• Please do not use vouchers you have already uploaded. Request a voucher through the bot instead.
• Only report a voucher as not working, when it does not scan at the till. Please do not report a voucher for any other reason.
`;

function getWelcomeMessage(): string {
	return "🎉 <b>Welcome to Dunnes Voucher Bot!</b>";
}

function getBetaMessage(): string {
	return `👋 <b>We're in beta!</b>\nWe're keen to hear about bugs or general feedback.\n\n📝 To send feedback send <b>feedback [your message]</b>`;
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
	await sendTelegramMessage(chatId, getBetaMessage());
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

		case "waiting_for_feedback_message":
			await ctx.runMutation(internal.users.submitFeedback, {
				userId: user._id,
				text,
				type: "feedback",
			});
			await ctx.runMutation(internal.users.clearUserTelegramState, {
				userId: user._id,
			});
			await sendTelegramMessage(
				chatId,
				"✅ Thanks for your feedback! We read every message.",
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

async function sendHelpMenu(chatId: string) {
	await sendTelegramMessage(chatId, "Choose an option below", {
		inline_keyboard: [
			[
				{ text: "Balance", callback_data: "help:balance" },
				{ text: "FAQ", callback_data: "help:faq" },
			],
			[{ text: "Give feedback", callback_data: "help:feedback" }],
			[
				{
					text: "Voucher Availability",
					callback_data: "help:availability",
				},
			],
			[
				{ text: "How to upload?", callback_data: "help:upload" },
				{ text: "How to claim?", callback_data: "help:claim" },
			],
			[{ text: "View Transactions", callback_data: "help:transactions" }],
		],
	});
}

async function sendFaqMenu(chatId: string) {
	await sendTelegramMessage(chatId, "Choose a FAQ question below", {
		inline_keyboard: [
			[
				{
					text: "Can I return/cancel a voucher?",
					callback_data: "faq:return_cancel",
				},
			],
			[
				{
					text: "Voucher processing failed",
					callback_data: "faq:processing_failed",
				},
			],
			[{ text: "Back to Help", callback_data: "faq:back" }],
		],
	});
}

async function handleCommand(
	ctx: ActionCtx,
	chatId: string,
	lowerText: string,
	text: string,
	user: User,
) {
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

	if (lowerText.startsWith("feedback ")) {
		const feedbackText = text.slice(9).trim();
		if (feedbackText.length > 0) {
			await ctx.runMutation(internal.users.submitFeedback, {
				userId: user._id,
				text: feedbackText,
			});
			await sendTelegramMessage(
				chatId,
				"✅ Thanks for your feedback! We read every message.",
			);
		} else {
			await sendTelegramMessage(
				chatId,
				"⚠️ Please include a message, e.g., 'feedback fix this bug!'",
			);
		}
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
		await sendTelegramPhoto(
			chatId,
			result.imageUrl!,
			`✅ <b>Here is your €${type} voucher!</b>\n\nExpires: ${dayjs(result.expiryDate!).format("MMM Do")}\nRemaining coins: ${result.remainingCoins}`,
			{
				inline_keyboard: [
					[
						{
							text: "⚠️ Its not working",
							callback_data: `report:${result.voucherId}`,
						},
					],
				],
			},
		);
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

		// 1. Idempotency Check & Storage
		const messageDbId = (await ctx.runMutation(internal.users.storeMessage, {
			telegramMessageId: messageId,
			telegramChatId: chatId,
			direction: "inbound",
			messageType: isImage ? "image" : "text",
			text: text,
			mediaGroupId,
			imageStorageId: undefined,
		})) as Id<"messages"> | null;

		if (!messageDbId) {
			console.log(`Duplicate message ${messageId} from ${chatId}, ignoring.`);
			return;
		}

		const user = await ctx.runQuery(internal.users.getUserByTelegramChatId, {
			telegramChatId: chatId,
		});

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
				"🚫 Your account has been banned from this service.\n\nPlease reply with a message describing why you think this is an error.",
			);
			return;
		}

		if (isImage) {
			await handleImageUpload(ctx, chatId, message, messageDbId, user);
			return;
		}

		const lowerText = text.toLowerCase().trim();

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

export const sendUploaderReportMessage = internalAction({
	args: {
		uploaderChatId: v.string(),
		voucherId: v.id("vouchers"),
		voucherType: v.union(v.literal("5"), v.literal("10"), v.literal("20")),
	},
	handler: async (_ctx, { uploaderChatId, voucherId, voucherType }) => {
		await sendTelegramMessage(
			uploaderChatId,
			"⚠️ <b>Someone has reported one of your vouchers as not working.</b>\n\nDid you use this voucher already?",
			{
				inline_keyboard: [
					[
						{
							text: "I've used this voucher",
							callback_data: `uploader_admitted:${voucherId}`,
						},
					],
					[
						{
							text: "They're lying",
							callback_data: `uploader_denied:${voucherId}`,
						},
					],
				],
			},
		);
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
) {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) {
		return;
	}

	if (photoUrl === "image") {
		await sendTelegramMessage(
			chatId,
			caption || "Sample image placeholder",
			replyMarkup,
		);
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
		}
	} catch (error) {
		console.error("Network error sending Telegram photo:", error);
	}
}

export const handleTelegramCallback = internalAction({
	args: {
		callbackQuery: v.any(),
	},
	handler: async (ctx, { callbackQuery }) => {
		const chatId = String(callbackQuery.message.chat.id);
		const telegramUserId = String(callbackQuery.from.id);
		const data = callbackQuery.data;

		if (data.startsWith("report:confirm:")) {
			const voucherId = data.split(":")[2];

			await answerTelegramCallback(callbackQuery.id);

			const user = await ctx.runQuery(internal.users.getUserByTelegramChatId, {
				telegramChatId: telegramUserId,
			});

			if (!user) {
				return;
			}

			const result = await ctx.runMutation(internal.vouchers.reportVoucher, {
				userId: user._id,
				voucherId: voucherId as Id<"vouchers">,
			});

			if (!result) {
				return;
			}

			// Remove inline keyboard from confirmation message
			await editTelegramMessageText(
				chatId,
				callbackQuery.message.message_id,
				callbackQuery.message.text,
			);

			if (result.status === "rate_limited") {
				await sendTelegramMessage(chatId, `⏰ ${result.message}`);
			} else if (result.status === "already_reported") {
				await sendTelegramMessage(chatId, `⚠️ ${result.message}`);
			} else if (result.status === "replaced" && result.voucher) {
				await sendTelegramPhoto(
					chatId,
					result.voucher.imageUrl,
					`🔄 <b>Here is a replacement €${result.voucher.type} voucher.</b>\n\nExpires: ${dayjs(result.voucher.expiryDate).format("MMM Do")}`,
					{
						inline_keyboard: [
							[
								{
									text: "⚠️ Its not working",
									callback_data: `report:${result.voucher._id}`,
								},
							],
						],
					},
				);
			} else if (result.status === "refunded") {
				await sendTelegramMessage(
					chatId,
					"⚠️ No replacement vouchers available. Your coins have been refunded.",
				);
			} else if (result.status === "reported") {
				await sendTelegramMessage(chatId, "✅ Report received.");
			}
		} else if (data.startsWith("report:cancel:")) {
			await editTelegramMessageText(
				chatId,
				callbackQuery.message.message_id,
				callbackQuery.message.text,
			);
			await answerTelegramCallback(callbackQuery.id);
			await sendTelegramMessage(chatId, "✅ Cancelled. No action taken.");
		} else if (data.startsWith("report:")) {
			// General report request (2 parts: report:id)
			const voucherId = data.split(":")[1];
			console.log(
				"Processing initial report request for voucherId:",
				voucherId,
			);

			await answerTelegramCallback(callbackQuery.id);

			const user = await ctx.runQuery(internal.users.getUserByTelegramChatId, {
				telegramChatId: telegramUserId,
			});

			if (!user) {
				return;
			}

			if (user.isBanned) {
				await ctx.runMutation(internal.users.setUserTelegramState, {
					userId: user._id,
					state: "waiting_for_ban_appeal",
				});
				await sendTelegramMessage(
					chatId,
					"🚫 Your account has been banned from this service.\n\nPlease reply with a message describing why you think this is an error.",
				);
				return;
			}

			await sendTelegramMessage(
				chatId,
				"⚠️ <b>Report this voucher as not working?</b>\n\nA replacement voucher will be sent if available. If not, your coins will be refunded.",
				{
					inline_keyboard: [
						[{ text: "✅ Yes", callback_data: `report:confirm:${voucherId}` }],
						[{ text: "❌ No", callback_data: `report:cancel:${voucherId}` }],
					],
				},
			);
		} else if (data.startsWith("help:")) {
			await answerTelegramCallback(callbackQuery.id);

			const helpAction = data.split(":")[1];
			const user = await ctx.runQuery(internal.users.getUserByTelegramChatId, {
				telegramChatId: chatId,
			});

			if (!user) {
				return;
			}

			switch (helpAction) {
				case "balance": {
					await sendTelegramMessage(chatId, `💰 You have ${user.coins} coins.`);
					break;
				}
				case "support":
				case "faq": {
					await sendFaqMenu(chatId);
					break;
				}
				case "feedback": {
					await ctx.runMutation(internal.users.setUserTelegramState, {
						userId: user._id,
						state: "waiting_for_feedback_message",
					});
					await sendTelegramMessage(
						chatId,
						"Please reply with your feedback message",
					);
					break;
				}
				case "availability": {
					const counts = await ctx.runQuery(
						internal.vouchers.getAvailableVoucherCount,
					);

					const getStatus = (count: number) => {
						if (count === 0) return "🔴 none";
						if (count < 10) return `🟡 low - ${count} vouchers`;
						return "🟢 good availability";
					};

					await sendTelegramMessage(
						chatId,
						`€5 vouchers: ${getStatus(counts["5"])}\n€10 vouchers: ${getStatus(counts["10"])}\n€20 vouchers: ${getStatus(counts["20"])}`,
					);
					break;
				}
				case "upload": {
					await sendTelegramMessage(
						chatId,
						"📸 To upload a voucher, simply send a screenshot of your voucher. Make sure the screenshot shows the barcode clearly.",
					);
					break;
				}
				case "claim": {
					await sendTelegramMessage(
						chatId,
						"💳 To claim a voucher, send <b>5</b>, <b>10</b>, or <b>20</b> depending on the voucher value you want.",
					);
					break;
				}
				case "transactions": {
					const transactions = await ctx.runQuery(
						internal.users.getUserTransactions,
						{ userId: user._id },
					);

					if (transactions.length === 0) {
						await sendTelegramMessage(chatId, "📋 No transactions yet.");
						break;
					}

					const formatType = (type: string) => {
						switch (type) {
							case "signup_bonus":
								return "🎁 Signup Bonus";
							case "upload_reward":
								return "📤 Upload Reward";
							case "claim_spend":
								return "💳 Claim Spent";
							case "report_refund":
								return "↩️ Refund";
							case "uploader_denied":
								return "❌ Upload Denied";
							default:
								return type;
						}
					};

					const transactionList = transactions.map((t) => {
						const date = dayjs(t.createdAt).format("MMM D, YYYY");
						const formattedType = formatType(t.type);
						const amountPrefix = t.type === "claim_spend" ? "-" : "+";
						return `${formattedType}: ${amountPrefix}${t.amount} (${date})`;
					});

					await sendTelegramMessage(
						chatId,
						`📋 <b>Your Last 25 Transactions:</b>\n\n${transactionList.join("\n")}`,
					);
					break;
				}
			}
		} else if (data.startsWith("faq:")) {
			await answerTelegramCallback(callbackQuery.id);

			const faqAction = data.split(":")[1];

			switch (faqAction) {
				case "back": {
					await sendHelpMenu(chatId);
					break;
				}
				case "return_cancel": {
					await sendTelegramMessage(
						chatId,
						"Voucher return/cancel is currently <b>not supported</b>.",
					);
					break;
				}
				case "processing_failed": {
					await sendTelegramMessage(
						chatId,
						"If uploading a paper voucher, retake the photo with clear lighting, the full voucher visible, and no blur.\n\nWe currently do <b>not</b> support Three+ vouchers yet, but support is coming soon.",
					);
					break;
				}
			}
		} else if (data.startsWith("uploader_admitted:")) {
			const voucherId = data.split(":")[1];
			await answerTelegramCallback(callbackQuery.id);

			await editTelegramMessageText(
				chatId,
				callbackQuery.message.message_id,
				callbackQuery.message.text,
			);

			const voucher = await ctx.runQuery(
				internal.vouchers.getVoucherForUploaderConfirm,
				{
					voucherId: voucherId as Id<"vouchers">,
				},
			);

			if (!voucher) {
				await sendTelegramMessage(chatId, "Voucher not found.");
				return;
			}

			const reward = UPLOAD_REWARDS[voucher.type];

			await ctx.runMutation(internal.vouchers.confirmUploaderUsedVoucher, {
				uploaderId: voucher.uploaderId,
				voucherId: voucher._id,
				amount: reward,
			});

			await sendTelegramMessage(
				chatId,
				"Thanks for letting us know. We've updated your coin balance",
			);
		} else if (data.startsWith("uploader_denied:")) {
			const voucherId = data.split(":")[1];
			await answerTelegramCallback(callbackQuery.id);

			await editTelegramMessageText(
				chatId,
				callbackQuery.message.message_id,
				callbackQuery.message.text,
			);

			const uploadedVoucher = await ctx.runQuery(
				internal.vouchers.getVoucherForUploaderConfirm,
				{
					voucherId: voucherId as Id<"vouchers">,
				},
			);

			if (uploadedVoucher) {
				await ctx.runMutation(internal.vouchers.recordUploaderDenied, {
					uploaderId: uploadedVoucher.uploaderId,
					voucherId: uploadedVoucher._id,
				});
			}

			await sendTelegramMessage(
				chatId,
				"Thanks for the info. We've recorded this in the system",
			);
		}
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
