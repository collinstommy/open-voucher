import { httpRouter } from "convex/server";
import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyTelegramInitData } from "./lib/telegramAuth";
import { issueJwt } from "./lib/jwt";

const http = httpRouter();

const ALLOWED_ORIGINS = [
	"https://openvouchers.org",
	"https://www.openvouchers.org",
	"https://dev.openvouchers.org",
	"https://open-voucher-web-dev.tomascollins.workers.dev",
	"http://localhost:3001",
];

function getCorsHeaders(request: Request): Record<string, string> {
	const origin = request.headers.get("Origin") || "";
	const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
		? origin
		: ALLOWED_ORIGINS[0];
	return {
		"Access-Control-Allow-Origin": allowedOrigin,
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
	};
}

async function handleDevAuth(
	ctx: ActionCtx,
	corsHeaders: Record<string, string>,
) {
	if (process.env.ENVIRONMENT !== "development") {
		return new Response(
			JSON.stringify({ error: "Dev auth is only available in development" }),
			{ status: 403, headers: corsHeaders },
		);
	}

	const user = await ctx.runMutation(internal.auth.getUserForDevAuth, {});

	if (!user) {
		return new Response(
			JSON.stringify({
				error: "User not found. Please start the bot first.",
			}),
			{ status: 404, headers: corsHeaders },
		);
	}

	const jwt = await issueJwt(user._id);

	return new Response(JSON.stringify({ user, jwt }), {
		status: 200,
		headers: corsHeaders,
	});
}

http.route({
	path: "/api/telegram-auth",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const corsHeaders = {
			...getCorsHeaders(request),
			"Content-Type": "application/json",
		};
		try {
			const { initData } = (await request.json()) as { initData?: string };
			if (!initData) {
				return new Response(
					JSON.stringify({ error: "Missing initData" }),
					{ status: 400, headers: corsHeaders },
				);
			}

			const botToken = process.env.TELEGRAM_BOT_TOKEN;
			if (!botToken) {
				return new Response(
					JSON.stringify({ error: "Server configuration error" }),
					{ status: 500, headers: corsHeaders },
				);
			}

			const verifyResult = await verifyTelegramInitData(initData, botToken);
			if (!verifyResult.success) {
				return new Response(
					JSON.stringify({ error: verifyResult.error }),
					{ status: verifyResult.status, headers: corsHeaders },
				);
			}

			const telegramUser = verifyResult.user;
			const telegramChatId = String(telegramUser.id);

			const user = await ctx.runMutation(
				internal.auth.getUserForTelegramAuth,
				{ telegramChatId },
			);

			if (!user) {
				return new Response(
					JSON.stringify({
						error: "User not found. Please start the bot first.",
					}),
					{ status: 404, headers: corsHeaders },
				);
			}

			const jwt = await issueJwt(user._id);

			return new Response(JSON.stringify({ user, jwt }), {
				status: 200,
				headers: corsHeaders,
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Authentication failed";
			return new Response(JSON.stringify({ error: message }), {
				status: 500,
				headers: corsHeaders,
			});
		}
	}),
});

http.route({
	path: "/api/telegram-auth",
	method: "OPTIONS",
	handler: httpAction(async (_ctx, request) => {
		return new Response(null, {
			status: 204,
			headers: getCorsHeaders(request),
		});
	}),
});

http.route({
	path: "/api/dev-auth",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const corsHeaders = {
			...getCorsHeaders(request),
			"Content-Type": "application/json",
		};
		try {
			return await handleDevAuth(ctx, corsHeaders);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Dev auth failed";
			return new Response(JSON.stringify({ error: message }), {
				status: 500,
				headers: corsHeaders,
			});
		}
	}),
});

http.route({
	path: "/api/dev-auth",
	method: "OPTIONS",
	handler: httpAction(async (_ctx, request) => {
		return new Response(null, {
			status: 204,
			headers: getCorsHeaders(request),
		});
	}),
});

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

			const body = (await request.json()) as {
				message?: unknown;
				callback_query?: unknown;
			};

			console.log("Webhook received:", JSON.stringify(body, null, 2));

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
			return new Response("OK", { status: 200 });
		}
	}),
});

export default http;
