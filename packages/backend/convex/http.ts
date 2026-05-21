import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyTelegramInitData } from "./lib/telegramAuth";

const http = httpRouter();

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Telegram Mini App auth endpoint.
 * Verifies initData from Telegram WebApp and creates a user session.
 */
http.route({
	path: "/api/telegram-auth",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		try {
			const { initData } = (await request.json()) as { initData?: string };
			if (!initData) {
				return new Response(
					JSON.stringify({ error: "Missing initData" }),
					{ status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
				);
			}

			const botToken = process.env.TELEGRAM_BOT_TOKEN;
			if (!botToken) {
				return new Response(
					JSON.stringify({ error: "Server configuration error" }),
					{ status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
				);
			}

			const verifyResult = await verifyTelegramInitData(initData, botToken);
			if (!verifyResult.success) {
				return new Response(
					JSON.stringify({ error: verifyResult.error }),
					{ status: verifyResult.status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
				);
			}

			const telegramUser = verifyResult.user;
			const telegramChatId = String(telegramUser.id);

			const dbUser = await ctx.runQuery(
				internal.userAppInternal.getUserByTelegramChatId,
				{ telegramChatId },
			);
			if (!dbUser) {
				return new Response(
					JSON.stringify({ error: "User not found. Please start the bot first." }),
					{ status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
				);
			}

			const session = await ctx.runMutation(
				internal.userAppInternal.createUserSession,
				{ userId: dbUser._id },
			);

			return new Response(
				JSON.stringify({
					user: {
						_id: dbUser._id,
						telegramChatId: dbUser.telegramChatId,
						firstName: dbUser.firstName,
						username: dbUser.username,
						coins: dbUser.coins,
						isBanned: dbUser.isBanned,
					},
					sessionToken: session.token,
					expiresAt: session.expiresAt,
				}),
				{ status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Authentication failed";
			return new Response(
				JSON.stringify({ error: message }),
				{ status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
			);
		}
	}),
});

// Handle CORS preflight
http.route({
	path: "/api/telegram-auth",
	method: "OPTIONS",
	handler: httpAction(async () => {
		return new Response(null, { status: 204, headers: CORS_HEADERS });
	}),
});

/**
 * Telegram webhook message handler.
 * Telegram sends all incoming messages here.
 */
http.route({
	path: "/telegram/webhook",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		try {
			const secretToken = request.headers.get(
				"x-telegram-bot-api-secret-token",
			);
			const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

			if (!configuredSecret) {
				console.error("TELEGRAM_WEBHOOK_SECRET is not set");
				return new Response("Server Configuration Error", { status: 500 });
			}

			if (secretToken !== configuredSecret) {
				console.error("Unauthorized webhook attempt");
				return new Response("Unauthorized", { status: 403 });
			}

			const body = await request.json();

			// Log incoming webhook for debugging
			console.log("Webhook received:", JSON.stringify(body, null, 2));

			// Process message in background action
			// We only care about "message" updates for now
			if (body.message) {
				await ctx.runAction(internal.telegram.handleTelegramMessage, {
					message: body.message,
				});
			} else if (body.callback_query) {
				await ctx.runAction(internal.telegram.handleTelegramCallback, {
					callbackQuery: body.callback_query,
				});
			}

			return new Response("OK", { status: 200 });
		} catch (error) {
			console.error("Webhook error:", error);
			// Still return 200 to prevent retries
			return new Response("OK", { status: 200 });
		}
	}),
});

export default http;
