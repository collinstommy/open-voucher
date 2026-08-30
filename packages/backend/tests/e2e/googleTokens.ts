// Locally generated Google signing keys for E2E: the fake Bot API server
// hosts the public half as a JWKS endpoint, the backend's GOOGLE_JWKS_URL
// points at it, and tests sign real RS256 ID tokens with the private half.
// Token verification therefore runs the production code path (jose remote
// JWKS) with DNS as the only fake.

import * as jose from "jose";

/** The audience the backend expects (GOOGLE_ANDROID_CLIENT_ID in the E2E env). */
export const GOOGLE_TEST_AUDIENCE =
	"e2e-open-voucher-test-client.apps.googleusercontent.com";

const KID = "e2e-google-test-key";

export interface GoogleTestKeys {
	privateKey: CryptoKey;
	/** The JWKS document served by the fake server. */
	jwksDoc: { keys: Array<Record<string, unknown>> };
}

export async function generateGoogleTestKeys(): Promise<GoogleTestKeys> {
	const { publicKey, privateKey } = await jose.generateKeyPair("RS256", {
		extractable: true,
		modulusLength: 2048,
	});
	const publicJwk = await jose.exportJWK(publicKey);
	return {
		privateKey,
		jwksDoc: {
			keys: [{ ...publicJwk, kid: KID, alg: "RS256", use: "sig" }],
		},
	};
}

export interface GoogleIdTokenClaims {
	sub: string;
	email?: string;
	name?: string;
	/** Defaults to GOOGLE_TEST_AUDIENCE; override to test wrong_audience. */
	aud?: string;
}

/** Sign a Google-shaped ID token with the E2E private key. */
export async function signGoogleIdToken(
	privateKey: CryptoKey,
	claims: GoogleIdTokenClaims,
): Promise<string> {
	return await new jose.SignJWT({
		email: claims.email,
		email_verified: claims.email !== undefined,
		name: claims.name,
	})
		.setProtectedHeader({ alg: "RS256", kid: KID })
		.setSubject(claims.sub)
		.setIssuer("https://accounts.google.com")
		.setAudience(claims.aud ?? GOOGLE_TEST_AUDIENCE)
		.setIssuedAt()
		.setExpirationTime("10m")
		.sign(privateKey);
}

export interface JwtSigningKeys {
	/** For verifying tokens issued by the backend in tests. */
	publicKey: CryptoKey;
	/** PKCS8 PEM for the backend's JWT_PRIVATE_KEY (src/lib/jwt.ts). */
	pkcs8Pem: string;
}

/**
 * A fresh signing key for the session JWT pipeline (issueJwt) on the local
 * backend. The real private key lives only in the cloud deployment's env, so
 * E2E verifies issued tokens locally instead of through the committed
 * auth.config.ts JWKS — that cross-check happens live in stage 2.
 */
export async function generateJwtSigningKeys(): Promise<JwtSigningKeys> {
	const { publicKey, privateKey } = await jose.generateKeyPair("RS256", {
		extractable: true,
		modulusLength: 2048,
	});
	return { publicKey, pkcs8Pem: await jose.exportPKCS8(privateKey) };
}

/** Verify a backend-issued session JWT against the E2E signing key's public half. */
export async function verifySessionJwt(
	publicKey: CryptoKey,
	token: string,
): Promise<jose.JWTPayload> {
	// Issuer/audience pinned by src/lib/jwt.ts (ISSUER/AUDIENCE constants).
	const { payload } = await jose.jwtVerify(token, publicKey, {
		issuer: "https://www.openvouchers.org",
		audience: "open-voucher",
	});
	return payload;
}
