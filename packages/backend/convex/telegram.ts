import { v } from "convex/values";
import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
dayjs.extend(advancedFormat);

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

		// 2. Get User
		// Note: We are using the 'users' file now, so it's api.users...
		const user = await ctx.runQuery(internal.users.getUserByTelegramChatId, {
			telegramChatId: chatId,
		});

		// 3. Handle New User (Invite Code)
		if (!user) {
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
						await sendTelegramMessage(
							chatId,
							`🎉 <b>Welcome to Dunnes Voucher Bot!</b>
You've been started with <b>${newUser.coins} coins</b> to get you going! 🚀

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
❓ <b>Get Help:</b> Send <b>help</b>`,
						);
						await sendTelegramMessage(
							chatId,
							`� <b>We're in beta!</b>\nWe're keen to hear about bugs or general feedback.\n\n📝 To send feedback send <b>feedback [your message]</b>`,
						);
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

		if (lowerText.startsWith("support ")) {
			const supportText = text.slice(8).trim();
			if (supportText.length > 0) {
				await ctx.runMutation(internal.users.submitFeedback, {
					userId: user._id,
					text: supportText,
					type: "support",
				});
				await sendTelegramMessage(
					chatId,
					"✅ Your support request has been received. We'll review your case and get back to you.",
				);
			} else {
				await sendTelegramMessage(
					chatId,
					"⚠️ Please include your message, e.g., 'support I believe this ban is a mistake because...'",
				);
			}
			return;
		}

		if (user.isBanned) {
			await sendTelegramMessage(
				chatId,
				"🚫 Your account has been banned from this service.\n\nIf you believe this is a mistake, you can dispute this ban by sending: 'support YOUR_MESSAGE'",
			);
			return;
		}

		// 4. Handle Image (Voucher Upload)
		if (isImage) {
			// Telegram sends multiple sizes, take the largest (last one)
			const photo = message.photo[message.photo.length - 1];
			const fileId = photo.file_id;

			try {
				const imageUrl = await getTelegramFileUrl(fileId);
				const imageBlob = await fetch(imageUrl).then((r) => r.blob());
				const storageId = await ctx.storage.store(imageBlob);

				// Update message with storage ID
				if (messageDbId) {
					await ctx.runMutation(internal.users.patchMessageImage, {
						messageId: messageDbId,
						imageStorageId: storageId,
					});
				}

				// Schedule OCR processing directly (no voucher created yet)
				await ctx.scheduler.runAfter(0, internal.ocr.processVoucherImage, {
					userId: user._id,
					imageStorageId: storageId,
				});

				await sendTelegramMessage(chatId, "📸 Processing your voucher...");
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
				chatId,
				`📸 Send screenshot to upload vouchers and earn coins\n💳 Send <b>5</b> , <b>10</b>, or <b>20</b> to claim a voucher\n💰 <b>balance</b> to view your balance of coin\n📝 <b>feedback [msg]</b> to send us feedback`,
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
		// Support "5", "10", "20", "claim 5", "get 10", etc.
		const match = lowerText.match(/\b(5|10|20)\b/);
		if (match) {
			const type = match[1] as "5" | "10" | "20";
			// If the user just typed a number or a simple claim phrase, assume they want that voucher
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
	},
});

export const sendMessageAction = internalAction({
	args: {
		chatId: v.string(),
		text: v.string(),
	},
	handler: async (ctx, { chatId, text }) => {
		await sendTelegramMessage(chatId, text);
	},
});

async function sendTelegramMessage(chatId: string, text: string) {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) {
		console.error("TELEGRAM_BOT_TOKEN is not set");
		return;
	}

	const url = `https://api.telegram.org/bot${token}/sendMessage`;
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
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

		// 2. Construct FormData to upload the image file
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

/**
 * Handle Telegram Callback Query (Button Press)
 */
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
				await sendTelegramMessage(
					chatId,
					"🚫 Your account has been banned from this service.\n\nIf you believe this is a mistake, you can dispute this ban by sending: 'support YOUR_MESSAGE'",
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
