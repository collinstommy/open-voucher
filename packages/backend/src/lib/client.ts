// Request-scoped client (where this action ran), distinct from account
// identity (who). A linked account can hold Telegram + Google at once;
// neither identity field tells us whether this upload came from the bot
// or from Android. The entry point sets `client` and threads it through
// async work (OCR) so completion still knows the origin.
//
// Telegram bot webhook hardcodes "telegram". App mutations accept only
// android | ios | web so a client cannot spoof the bot notification channel.

import { v } from "convex/values";

export const APP_CLIENT_HEADER = "X-OpenVoucher-Client";

export const CLIENTS = ["telegram", "android", "ios", "web"] as const;
export type Client = (typeof CLIENTS)[number];

export const APP_CLIENTS = ["android", "ios", "web"] as const;
export type AppClient = (typeof APP_CLIENTS)[number];

export function isAppClient(value: unknown): value is AppClient {
	return value === "android" || value === "ios" || value === "web";
}

/** JWT / identity claim. Telegram is never minted onto a session token. */
export function parseAppClientClaim(value: unknown): AppClient | undefined {
	return isAppClient(value) ? value : undefined;
}

/**
 * HTTP actions (auth endpoints) can read headers; queries/mutations cannot.
 * Unknown values are errors so a typo does not silently drop the claim.
 */
export function parseAppClientHeader(
	headers: Headers,
): { ok: true; client: AppClient | undefined } | { ok: false } {
	const raw = headers.get(APP_CLIENT_HEADER);
	if (raw === null || raw.trim() === "") {
		return { ok: true, client: undefined };
	}
	if (isAppClient(raw)) {
		return { ok: true, client: raw };
	}
	return { ok: false };
}

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
