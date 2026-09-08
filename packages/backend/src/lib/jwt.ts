import * as jose from "jose";
import type { Id } from "../../convex/_generated/dataModel";
import type { AppClient } from "./client";

const ISSUER = "https://www.openvouchers.org";
const AUDIENCE = "open-voucher";
const KID = "open-voucher-key-1";
export const JWT_EXPIRY = "30d";

/**
 * Session JWT. `client` is an app-surface claim (android|ios|web), not
 * Telegram — the bot webhook never uses this token. Queries/mutations read it
 * from ctx.auth.getUserIdentity(); they cannot see HTTP headers.
 */
export async function issueJwt(
	userId: Id<"users">,
	client?: AppClient,
): Promise<string> {
	const privateKeyPem = process.env.JWT_PRIVATE_KEY;
	if (!privateKeyPem) throw new Error("JWT_PRIVATE_KEY not configured");

	const privateKey = await jose.importPKCS8(privateKeyPem, "RS256");

	const payload: Record<string, string> = {};
	if (client !== undefined) {
		payload.client = client;
	}

	return await new jose.SignJWT(payload)
		.setProtectedHeader({ alg: "RS256", kid: KID })
		.setSubject(userId)
		.setIssuer(ISSUER)
		.setAudience(AUDIENCE)
		.setIssuedAt()
		.setExpirationTime(JWT_EXPIRY)
		.sign(privateKey);
}
