import { httpRouter } from "convex/server";
import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyTelegramInitData } from "../src/lib/telegramAuth";
import { issueJwt } from "../src/lib/jwt";
import { verifyGoogleIdToken } from "../src/lib/googleAuth";
import type { GoogleAuthUser } from "./auth";

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

/** JSON response with the user's telegramChatId normalized to null for the wire. */
function authUserJson(user: GoogleAuthUser) {
	return { ...user, telegramChatId: user.telegramChatId ?? null };
}

/**
 * POST /api/google-auth — Google sign-in, /link-code redemption, and
 * self-serve fork merge. Status mapping (pinned in the auth contract):
 *   400 dead link code (unknown, used, expired, over attempt cap)
 *   401 invalid / expired / wrong-audience Google token
 *   409 link conflicts (google_linked_to_other_user, user_already_has_google)
 *   429 rate limited (per verified Google sub)
 *   200 known user, or { known: false } choice screen, or created/merged user
 * Ban behavior unchanged: a JWT is issued regardless of isBanned.
 */
async function handleGoogleAuth(
	ctx: ActionCtx,
	corsHeaders: Record<string, string>,
	body: { idToken?: unknown; linkCode?: unknown; intent?: unknown },
): Promise<Response> {
	const idToken = typeof body.idToken === "string" ? body.idToken : undefined;
	if (!idToken) {
		return new Response(JSON.stringify({ error: "Missing idToken" }), {
			status: 400,
			headers: corsHeaders,
		});
	}

	const clientId = process.env.GOOGLE_ANDROID_CLIENT_ID;
	if (!clientId) {
		console.error("GOOGLE_ANDROID_CLIENT_ID is not set");
		return new Response(JSON.stringify({ error: "Server configuration error" }), {
			status: 500,
			headers: corsHeaders,
		});
	}

	const verified = await verifyGoogleIdToken(idToken, { clientId });
	if ("error" in verified) {
		return new Response(JSON.stringify({ error: verified.error }), {
			status: 401,
			headers: corsHeaders,
		});
	}

	const rateLimit = await ctx.runMutation(internal.auth.checkGoogleAuthRateLimit, {
		sub: verified.sub,
	});
	if (!rateLimit.allowed) {
		return new Response(JSON.stringify({ error: "rate_limited" }), {
			status: 429,
			headers: {
				...corsHeaders,
				"Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
			},
		});
	}

	const linkCode =
		typeof body.linkCode === "string" && body.linkCode.trim().length > 0
			? body.linkCode
			: undefined;

	if (linkCode) {
		const result = await ctx.runMutation(internal.auth.redeemLinkCode, {
			code: linkCode,
			sub: verified.sub,
			email: verified.email,
			name: verified.displayName,
		});
		if (!result.ok) {
			const deadCode =
				result.conflict === "code_invalid_or_expired" ||
				result.conflict === "too_many_attempts";
			return new Response(JSON.stringify({ error: result.conflict }), {
				status: deadCode ? 400 : 409,
				headers: corsHeaders,
			});
		}
		const jwt = await issueJwt(result.user._id);
		return new Response(
			JSON.stringify({
				user: authUserJson(result.user),
				jwt,
				created: false,
				...(result.idempotent ? { idempotent: true } : {}),
				...(result.merged ? { merged: true } : {}),
				...(result.warning ? { warning: result.warning } : {}),
			}),
			{ status: 200, headers: corsHeaders },
		);
	}

	const intent = body.intent === "create" ? "create" : undefined;
	const resolved = await ctx.runMutation(internal.auth.resolveGoogleIdentity, {
		sub: verified.sub,
		email: verified.email,
		name: verified.displayName,
		allowCreate: intent === "create",
	});

	if (resolved.status === "unknown") {
		return new Response(JSON.stringify({ known: false }), {
			status: 200,
			headers: corsHeaders,
		});
	}

	const jwt = await issueJwt(resolved.user._id);
	return new Response(
		JSON.stringify({
			user: authUserJson(resolved.user),
			jwt,
			created: resolved.status === "created",
		}),
		{ status: 200, headers: corsHeaders },
	);
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
	path: "/api/google-auth",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const corsHeaders = {
			...getCorsHeaders(request),
			"Content-Type": "application/json",
		};
		try {
			const body = await request.json();
			return await handleGoogleAuth(
				ctx,
				corsHeaders,
				typeof body === "object" && body !== null ? body : {},
			);
		} catch (error) {
			if (error instanceof SyntaxError) {
				return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
					status: 400,
					headers: corsHeaders,
				});
			}
			const message =
				error instanceof Error ? error.message : "Google auth failed";
			console.error("Google auth error:", error);
			return new Response(JSON.stringify({ error: message }), {
				status: 500,
				headers: corsHeaders,
			});
		}
	}),
});

http.route({
	path: "/api/google-auth",
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
