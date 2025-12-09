import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

/**
 * Telegram webhook message handler.
 * Telegram sends all incoming messages here.
 */
http.route({
	path: "/telegram/webhook",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		try {
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
