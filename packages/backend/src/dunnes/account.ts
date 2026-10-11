const IDENTITY_URL = "https://my.buymie.eu";
const API_URL = "https://api.buymie.eu";
const CLIENT_ID = "D287A7A3-9D08-41A8-AA24-4AE5ECC29EAF";
const USER_AGENT =
	"Dunnes/2.52.0 (com.dunnes.valueclubcard; build:20; iOS 26.3.1) Alamofire/5.12.0";
const SCOPES = "account buymie giftcard stamp valueclub voucher offline_access";
const SKEW_MS = 60_000;
const TIMEOUT_MS = 15_000;

export type DunnesTokens = {
	username: string;
	accessToken: string;
	refreshToken?: string;
	expiresAtMs: number;
};

export type StoredDunnesSession = {
	accessToken: string;
	refreshToken?: string;
	expiresAtMs: number;
};

export type DunnesHttpResult = {
	status: number;
	body: unknown;
};

export function isAccessTokenFresh(
	expiresAtMs: number,
	nowMs: number,
): boolean {
	return nowMs < expiresAtMs;
}

function keepRefresh(tokens: DunnesTokens, previous?: string): DunnesTokens {
	if (tokens.refreshToken !== undefined || previous === undefined)
		return tokens;
	return { ...tokens, refreshToken: previous };
}

export async function ensureDunnesTokens(args: {
	stored: StoredDunnesSession | null;
	username: string;
	password: string;
	nowMs: number;
	login: (username: string, password: string) => Promise<DunnesTokens>;
	refresh: (username: string, refreshToken: string) => Promise<DunnesTokens>;
}): Promise<DunnesTokens> {
	const { stored, username, password, nowMs, login, refresh } = args;
	if (stored && isAccessTokenFresh(stored.expiresAtMs, nowMs)) {
		return keepRefresh(
			{
				username,
				accessToken: stored.accessToken,
				expiresAtMs: stored.expiresAtMs,
			},
			stored.refreshToken,
		);
	}
	if (stored?.refreshToken) {
		try {
			const refreshed = await refresh(username, stored.refreshToken);
			return keepRefresh(refreshed, stored.refreshToken);
		} catch {
			// Refresh tokens expire. A password grant replaces them.
		}
	}
	return login(username, password);
}

function readTokenResponse(
	body: unknown,
	username: string,
	nowMs: number,
): DunnesTokens {
	if (body === null || typeof body !== "object") {
		throw new Error("Token response was not an object");
	}
	const record = body as Record<string, unknown>;
	const accessToken = record.access_token;
	const expiresIn = record.expires_in;
	if (typeof accessToken !== "string" || accessToken.length === 0) {
		throw new Error("Token response missing access_token");
	}
	if (typeof expiresIn !== "number" || expiresIn <= 0) {
		throw new Error("Token response missing expires_in");
	}
	const tokens: DunnesTokens = {
		username,
		accessToken,
		expiresAtMs: nowMs + expiresIn * 1000 - SKEW_MS,
	};
	if (
		typeof record.refresh_token === "string" &&
		record.refresh_token.length > 0
	) {
		tokens.refreshToken = record.refresh_token;
	}
	return tokens;
}

async function postToken(
	fields: Record<string, string>,
	nowMs: number,
	username: string,
): Promise<DunnesTokens> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const response = await fetch(`${IDENTITY_URL}/connect/token`, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/x-www-form-urlencoded",
				"User-Agent": USER_AGENT,
			},
			body: new URLSearchParams(fields).toString(),
			signal: controller.signal,
			redirect: "error",
		});
		const text = await response.text();
		let json: unknown = text;
		try {
			json = JSON.parse(text) as unknown;
		} catch {
			json = text;
		}
		if (!response.ok) {
			const description =
				json !== null &&
				typeof json === "object" &&
				"error_description" in json &&
				typeof json.error_description === "string"
					? json.error_description
					: `HTTP ${response.status}`;
			throw new Error(description);
		}
		return readTokenResponse(json, username, nowMs);
	} finally {
		clearTimeout(timer);
	}
}

export function loginWithPassword(
	username: string,
	password: string,
	nowMs = Date.now(),
): Promise<DunnesTokens> {
	return postToken(
		{
			grant_type: "password",
			username,
			password,
			client_id: CLIENT_ID,
			scope: SCOPES,
		},
		nowMs,
		username,
	);
}

export function refreshAccessToken(
	username: string,
	refreshToken: string,
	nowMs = Date.now(),
): Promise<DunnesTokens> {
	return postToken(
		{
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: CLIENT_ID,
		},
		nowMs,
		username,
	);
}

async function send(
	accessToken: string,
	method: string,
	path: string,
	body?: unknown,
): Promise<DunnesHttpResult> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const response = await fetch(`${API_URL}${path}`, {
			method,
			headers: {
				Accept: "application/json; charset=utf-8",
				"Content-Type": "application/json",
				"User-Agent": USER_AGENT,
				Authorization: `Bearer ${accessToken}`,
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: controller.signal,
			redirect: "error",
		});
		const text = await response.text();
		let parsed: unknown = text.length === 0 ? null : text;
		if (text.length > 0) {
			try {
				parsed = JSON.parse(text) as unknown;
			} catch {
				parsed = text;
			}
		}
		return { status: response.status, body: parsed };
	} finally {
		clearTimeout(timer);
	}
}

// A 200 attaches the barcode to this login. 400s do not.
export function linkVoucher(
	accessToken: string,
	voucherNumber: string,
): Promise<DunnesHttpResult> {
	return send(accessToken, "POST", "/v7/voucher/LinkVoucher", {
		voucherNumber,
	});
}

function messageOf(body: unknown): string {
	if (body !== null && typeof body === "object" && "message" in body) {
		const message = (body as { message: unknown }).message;
		return typeof message === "string" ? message : "";
	}
	return "";
}

export type StoredLinkResult = "claimed" | "redeemed" | "unlinked" | "other";

export function storedLinkResult(result: DunnesHttpResult): StoredLinkResult {
	const message = messageOf(result.body);
	if (result.status >= 200 && result.status < 300) return "unlinked";
	if (message.includes("already linked")) return "claimed";
	if (message.includes("already been redeemed")) return "redeemed";
	return "other";
}

export function labelFromLink(result: DunnesHttpResult): string {
	const stored = storedLinkResult(result);
	if (stored === "unlinked") {
		return "Unlinked. This check attached the barcode to this account.";
	}
	if (stored === "claimed") {
		return "Claimed. Already linked to another VALUEclub account.";
	}
	if (stored === "redeemed") {
		return "Redeemed. Voucher has already been redeemed.";
	}
	const message = messageOf(result.body);
	if (message !== "") return message;
	return `LinkVoucher HTTP ${result.status}.`;
}
