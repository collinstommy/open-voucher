import { v } from "convex/values";

export const APP_CLIENT_HEADER = "X-OpenVoucher-Client";

export const CLIENTS = ["telegram", "android", "ios", "web"] as const;
export type Client = (typeof CLIENTS)[number];

export const APP_CLIENTS = ["android", "ios", "web"] as const;
export type AppClient = (typeof APP_CLIENTS)[number];

export function isAppClient(value: unknown): value is AppClient {
	return value === "android" || value === "ios" || value === "web";
}

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

export function deliversViaTelegram(client: Client): boolean {
	return client === "telegram";
}
