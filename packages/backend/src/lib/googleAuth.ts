// Trust boundary for Google sign-in: verify a Google ID token (RS256) against
// a remote JWKS and return the verified claims, or a typed error. No db, no
// scheduling — HTTP mapping lives in convex/http.ts, identity decisions live
// in src/lib/authIdentities.ts.

import * as jose from "jose";

export interface GoogleClaims {
	/** Google account id. Stable across email changes; the lookup key. */
	sub: string;
	/** Last seen email, display only — never used for lookup. */
	email?: string;
	emailVerified: boolean;
	displayName?: string;
}

export type GoogleTokenError = "invalid_token" | "wrong_audience" | "expired";

export type GoogleVerifyResult = GoogleClaims | { error: GoogleTokenError };

export const DEFAULT_GOOGLE_JWKS_URL =
	"https://www.googleapis.com/oauth2/v3/certs";

const GOOGLE_ISSUERS = ["https://accounts.google.com"];

// One key set per URL, built lazily at first use (the URL comes from env, and
// createRemoteJWKSet itself caches keys and refreshes them on kid mismatch).
const jwksCache = new Map<string, jose.JWTVerifyGetKey>();

function getRemoteJwks(url: string): jose.JWTVerifyGetKey {
	let jwks = jwksCache.get(url);
	if (!jwks) {
		jwks = jose.createRemoteJWKSet(new URL(url));
		jwksCache.set(url, jwks);
	}
	return jwks;
}

/**
 * Verify a Google ID token. Pass `jwks` to inject a local key set (offline
 * tests); otherwise the JWKS URL is read from GOOGLE_JWKS_URL, defaulting to
 * Google's real cert endpoint.
 */
export async function verifyGoogleIdToken(
	idToken: string,
	opts: { clientId: string; jwks?: jose.JWTVerifyGetKey; jwksUrl?: string },
): Promise<GoogleVerifyResult> {
	const jwks =
		opts.jwks ??
		getRemoteJwks(
			opts.jwksUrl ?? process.env.GOOGLE_JWKS_URL ?? DEFAULT_GOOGLE_JWKS_URL,
		);

	try {
		const { payload } = await jose.jwtVerify(idToken, jwks, {
			issuer: GOOGLE_ISSUERS,
			audience: opts.clientId,
		});

		if (typeof payload.sub !== "string" || payload.sub.length === 0) {
			return { error: "invalid_token" };
		}

		return {
			sub: payload.sub,
			email: typeof payload.email === "string" ? payload.email : undefined,
			emailVerified: payload.email_verified === true,
			displayName: typeof payload.name === "string" ? payload.name : undefined,
		};
	} catch (error) {
		if (error instanceof jose.errors.JWTExpired) {
			return { error: "expired" };
		}
		if (
			error instanceof jose.errors.JWTClaimValidationFailed &&
			error.claim === "aud"
		) {
			return { error: "wrong_audience" };
		}
		return { error: "invalid_token" };
	}
}
