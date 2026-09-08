// Request-scoped client (where this action ran), distinct from account
// identity (who). A linked account can hold Telegram + Google at once;
// neither identity field tells us whether this upload came from the bot
// or from Android. The entry point sets `client` and threads it through
// async work (OCR) so completion still knows the origin.
//
// Telegram bot webhook hardcodes "telegram". App mutations accept only
// android | ios | web so a client cannot spoof the bot notification channel.

import { v } from "convex/values";

export const CLIENTS = ["telegram", "android", "ios", "web"] as const;
export type Client = (typeof CLIENTS)[number];

export const APP_CLIENTS = ["android", "ios", "web"] as const;
export type AppClient = (typeof APP_CLIENTS)[number];

export const clientValidator = v.union(
	v.literal("telegram"),
	v.literal("android"),
	v.literal("ios"),
	v.literal("web"),
);

export const appClientValidator = v.union(
	v.literal("android"),
	v.literal("ios"),
	v.literal("web"),
);

/** Interactive feedback for this action goes to Telegram only for the bot. */
export function deliversViaTelegram(client: Client): boolean {
	return client === "telegram";
}
