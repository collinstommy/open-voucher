interface TelegramUser {
	id: number;
	first_name?: string;
	last_name?: string;
	username?: string;
	language_code?: string;
	is_premium?: boolean;
}

interface VerifyResult {
	success: true;
	user: TelegramUser;
}

interface VerifyError {
	success: false;
	error: string;
	status: number;
}

export async function verifyTelegramInitData(
	initData: string,
	botToken: string,
): Promise<VerifyResult | VerifyError> {
	const params = new URLSearchParams(initData);
	const receivedHash = params.get("hash");
	if (!receivedHash) {
		return { success: false, error: "Missing hash in initData", status: 400 };
	}
	params.delete("hash");

	// Check auth_date freshness (1 hour)
	const authDate = params.get("auth_date");
	if (authDate) {
		const authDateMs = Number.parseInt(authDate, 10) * 1000;
		const now = Date.now();
		if (now - authDateMs > 60 * 60 * 1000) {
			return { success: false, error: "initData expired", status: 400 };
		}

	// Build data_check_string
	const entries = Array.from(params.entries()).sort(([a], [b]) =>
		a.localeCompare(b),
	);
	const dataCheckString = entries
		.map(([key, value]) => `${key}=${value}`)
		.join("\n");

	// Compute HMAC
	const encoder = new TextEncoder();

	// secret_key = HMAC_SHA256(bot_token, "WebAppData")
	const secretKeyData = await crypto.subtle.importKey(
		"raw",
		encoder.encode(botToken),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const secretKey = await crypto.subtle.sign(
		"HMAC",
		secretKeyData,
		encoder.encode("WebAppData"),
	);

	// computed_hash = HMAC_SHA256(data_check_string, secret_key)
	const computedHashKey = await crypto.subtle.importKey(
		"raw",
		secretKey,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const computedHash = await crypto.subtle.sign(
		"HMAC",
		computedHashKey,
		encoder.encode(dataCheckString),
	);
	const computedHashHex = Array.from(new Uint8Array(computedHash))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	if (computedHashHex !== receivedHash) {
		return { success: false, error: "Invalid initData hash", status: 403 };
	}

	// Extract user
	const userJson = params.get("user");
	if (!userJson) {
		return { success: false, error: "Missing user in initData", status: 400 };
	}

	const user = JSON.parse(userJson) as TelegramUser;
	return { success: true, user };
}
