export const APP_CLIENT_HEADER = "X-OpenVoucher-Client";

export const APP_CLIENTS = ["android", "ios", "web"] as const;
export type AppClient = (typeof APP_CLIENTS)[number];

const APP_CLIENT_SET: ReadonlySet<string> = new Set(APP_CLIENTS);

export function isAppClient(value: unknown): value is AppClient {
	return typeof value === "string" && APP_CLIENT_SET.has(value);
}

export function parseAppClientClaim(value: unknown): AppClient | undefined {
	return isAppClient(value) ? value : undefined;
}

export function requireAppClient(client: AppClient | undefined): AppClient {
	if (client === undefined) {
		throw new Error("Missing app client claim");
	}
	return client;
}

/**
 * HTTP actions (auth endpoints) can read headers; queries/mutations cannot.
 * Missing or unknown values are errors so a typo does not silently drop the claim.
 */
export function parseAppClientHeader(
	headers: Headers,
): { ok: true; client: AppClient } | { ok: false } {
	const raw = headers.get(APP_CLIENT_HEADER);
	if (raw === null || raw.trim() === "") {
		return { ok: false };
	}
	if (isAppClient(raw)) {
		return { ok: true, client: raw };
	}
	return { ok: false };
}
