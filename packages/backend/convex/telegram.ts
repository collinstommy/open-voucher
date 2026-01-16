import { v } from "convex/values";
import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
dayjs.extend(advancedFormat);

const TUTORIAL_STEP_1_MESSAGE =
	"Let's show you how to use the bot. Send the number <b>10</b> to get a voucher.";

const TUTORIAL_STEP_1_RETRY_MESSAGE =
	"Please send the number <b>0</b> to continue the tutorial.";

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
`
;

function getWelcomeMessage(coins: number): string {
	return `🎉 <b>Welcome to Dunnes Voucher Bot!</b>`
}

function getBetaMessage(): string {
	return `<b>Beta Notice:</b> This is a work in progress. Please report any issues via the help menu.`;
}

async function getSampleVoucherImageUrl(ctx: any): Promise<string | null> {
	const storageId = await ctx.runQuery(internal.settings.getSetting, {
		key: "sample-voucher-image",
	});
	if (!storageId) return null;
	return await ctx.storage.getUrl(storageId);
}

/**
 * Handle incoming Telegram message.
 */
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
		// Store message immediately. If it exists, this returns null.
		// For now, we ignore images content, just storing the fact that it was an image
		const messageDbId = await ctx.runMutation(internal.users.storeMessage, {
			telegramMessageId: messageId,
			telegramChatId: chatId,
			direction: "inbound",
			messageType: isImage ? "image" : "text",
			text: text,
			mediaGroupId,
			imageStorageId: undefined, // Ignoring image storage for this step
		});

		if (!messageDbId) {
			console.log(`Duplicate message ${messageId} from ${chatId}, ignoring.`);
			return;
		}

		const user = await ctx.runQuery(internal.users.getUserByTelegramChatId, {
			telegramChatId: chatId,
		});

		if (!user) {
			const requireInviteCode = process.env.REQUIRE_INVITE_CODE === "true";

			if (!requireInviteCode) {
				const newUser = await ctx.runMutation(
					internal.users.createUserWithInvite,
					{
						telegramChatId: chatId,
						username,
						firstName
					},
				);
				await sendTelegramMessage(chatId, getWelcomeMessage(newUser.coins));
				await sendTelegramMessage(chatId, getBetaMessage());
				await ctx.runMutation(internal.users.setUserOnboardingStep, {
					userId: newUser._id,
					step: 1,
				});
				await sendTelegramMessage(chatId, TUTORIAL_STEP_1_MESSAGE);
				return;
			}

			if (text.startsWith("/start")) {
				await sendTelegramMessage(
					chatId,
					"👋 Welcome! You need an invite code to join. Respond with 'code YOUR_INVITE_CODE_HERE' ",
				);
				return;
			}

			if (text.startsWith("code") || text.startsWith("Code")) {
				const parts = text.split(" ");
				const code = parts.length > 1 ? parts[1] : null;

				if (code) {
					const result = await ctx.runMutation(
						internal.users.validateAndUseInviteCode,
						{ code },
					);

					if (result.valid) {
						const newUser = await ctx.runMutation(
							internal.users.createUserWithInvite,
							{
								telegramChatId: chatId,
								username,
								firstName,
								inviteCode: code,
							},
						);
						await sendTelegramMessage(chatId, getWelcomeMessage(newUser.coins));
						await sendTelegramMessage(chatId, getBetaMessage());
						return;
					} else {
						await sendTelegramMessage(chatId, `❌ ${result.reason}`);
						return;
					}
				}
			}
			await sendTelegramMessage(
				chatId,
				"👋 Welcome! You need an invite code to join. Respond with 'code YOUR_INVITE_CODE_HERE' ",
			);
			return;
		}

		const lowerText = text.toLowerCase().trim();

		if (user.telegramState === "waiting_for_support_message") {
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
			return;
		}

		if (user.telegramState === "waiting_for_feedback_message") {
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
			return;
		}

		if (user.telegramState === "waiting_for_ban_appeal") {
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
			return;
		}

		if (user.telegramState === "onboarding_tutorial") {
			const step = user.onboardingStep ?? 1;

			if (step === 1) {
				const lowerText = text.toLowerCase().trim();
				if (lowerText === "10") {
					await ctx.runMutation(internal.users.setUserOnboardingStep, {
						userId: user._id,
						step: 2,
					});
					// Send sample image
					const imageUrl = await getSampleVoucherImageUrl(ctx);
					if (imageUrl) {
						await sendTelegramPhoto(chatId, imageUrl, "Here is your sample voucher!");
					} else {
						await sendTelegramMessage(chatId, "Here is your sample voucher!");
					}
					await ctx.runMutation(internal.users.clearOnboardingTutorial, {
						userId: user._id,
					});
					await sendTelegramMessage(chatId, TUTORIAL_COMPLETE_MESSAGE(user.coins));
				} else {
					await sendTelegramMessage(chatId, TUTORIAL_STEP_1_RETRY_MESSAGE);
				}
				return;
		}
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

		if (isImage) {
			await sendTelegramMessage(chatId, "📸 Processing your voucher...");

			// Telegram sends multiple sizes, take the largest (last one)
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
			return;
		}

		// 5. Handle Commands
		if (lowerText === "/balance" || lowerText === "balance") {
			await sendTelegramMessage(chatId, `💰 You have ${user.coins} coins.`);
			return;
		} else if (lowerText === "/help" || lowerText === "help") {
			await sendTelegramMessage(
				chatId,`Choose an option below`,
				{
					inline_keyboard: [
						[
							{ text: "Balance", callback_data: "help:balance" },
							{ text: "Support", callback_data: "help:support" },
						],
						[
							{ text: "Give feedback", callback_data: "help:feedback" },
						],
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
					],
				},
			);
			return;
		} else if (lowerText.startsWith("feedback ")) {
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
			return;
		}

		// Handle Voucher Requests
		const match = lowerText.match(/\b(5|10|20)\b/);
		if (match) {
		}
			const type = match[1] as "5" | "10" | "20";
			// We do a loose check: if message length is short (< 20 chars) and contains the number
			if (lowerText.length < 10) {
				const result = await ctx.runMutation(internal.vouchers.requestVoucher, {
					userId: user._id,
					type,
				});

				if (!result.success) {
					await sendTelegramMessage(chatId, `❌ ${result.error}`);
				} else {
					// Image URL is now guaranteed to be present if success is true
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
				return;
			}
	}
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

async function sendTelegramMessage(
	chatId: string,
	text: string,
	replyMarkup?: any,
) {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) {
		console.error("TELEGRAM_BOT_TOKEN is not set");
		return;
	}

	const url = `https://api.telegram.org/bot${token}/sendMessage`;
	try {
		const body: any = { chat_id: chatId, text, parse_mode: "HTML" };
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
	replyMarkup?: any,
) {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) {
		return;
	}

	// Handle placeholder "image" for tutorial
	if (photoUrl === "image") {
		await sendTelegramMessage(chatId, caption || "Sample image placeholder", replyMarkup);
		return;
	}

	const url = `https://api.telegram.org/bot${token}/sendPhoto`;
	try {
		// 1. Fetch the image from the Storage URL
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
			// reply_markup must be a JSON string when using multipart/form-data
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

		if (data.startsWith("report:")) {
			const voucherId = data.split(":")[1];

			await answerTelegramCallback(callbackQuery.id, "Checking...");

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

			const result = await ctx.runMutation(internal.vouchers.reportVoucher, {
				userId: user._id,
				voucherId: voucherId as Id<"vouchers">,
			});

			if (!result) {
				return;
			}

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
								}, // Allow reporting the replacement too
							],
						],
					},
				);
			} else if (result.status === "refunded") {
				await sendTelegramMessage(
					chatId,
					"⚠️ No replacement vouchers available.",
				);
			} else if (result.status === "reported") {
				// Should not happen if everything goes right, but just in case
				await sendTelegramMessage(chatId, "✅ Report received.");
			}
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
				case "support": {
					await ctx.runMutation(internal.users.setUserTelegramState, {
						userId: user._id,
						state: "waiting_for_support_message",
					});
					await sendTelegramMessage(
						chatId,
						"Please reply with a message describing what you need help with",
					);
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
						if (count < 5) return "🟡 low";
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
			}
		}
	},
});

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
