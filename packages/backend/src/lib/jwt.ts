import * as jose from "jose";
import type { Id } from "../../convex/_generated/dataModel";

const ISSUER = "https://www.openvouchers.org";
const AUDIENCE = "open-voucher";
const KID = "open-voucher-key-1";
export const JWT_EXPIRY = "30d";

export async function issueJwt(userId: Id<"users">): Promise<string> {
	const privateKeyPem = process.env.JWT_PRIVATE_KEY;
	if (!privateKeyPem) throw new Error("JWT_PRIVATE_KEY not configured");

	const privateKey = await jose.importPKCS8(privateKeyPem, "RS256");

	return await new jose.SignJWT({})
		.setProtectedHeader({ alg: "RS256", kid: KID })
		.setSubject(userId)
		.setIssuer(ISSUER)
		.setAudience(AUDIENCE)
		.setIssuedAt()
		.setExpirationTime(JWT_EXPIRY)
		.sign(privateKey);
}
