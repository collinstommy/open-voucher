/**
 * verifyGoogleIdToken unit tests: aud/iss/exp/malformed branches against a
 * locally generated JWKS (no network, no env).
 */

import * as jose from "jose";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	type GoogleClaims,
	verifyGoogleIdToken,
} from "../../src/lib/googleAuth";

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const ISSUER = "https://accounts.google.com";

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let localJwks: jose.JWTVerifyGetKey;

function isClaims(
	result: Awaited<ReturnType<typeof verifyGoogleIdToken>>,
): result is GoogleClaims {
	return !("error" in result);
}

beforeEach(async () => {
	// One keypair: public half becomes the JWKS, private half signs tokens.
	const { publicKey, privateKey: signing } = await jose.generateKeyPair(
		"RS256",
		{ extractable: true, modulusLength: 2048 },
	);
	privateKey = signing;
	const jwk = await jose.exportJWK(publicKey);
	localJwks = jose.createLocalJWKSet({
		keys: [{ ...jwk, kid: "unit-test-key", alg: "RS256", use: "sig" }],
	});
	const other = await jose.generateKeyPair("RS256", {
		extractable: true,
		modulusLength: 2048,
	});
	otherPrivateKey = other.privateKey;
});

afterEach(() => {
	vi.unstubAllEnvs();
});

async function signToken(
	privateKeyToUse: CryptoKey,
	overrides: {
		aud?: string;
		iss?: string;
		exp?: string | number;
		sub?: string;
	},
) {
	return await new jose.SignJWT({ email: "user@example.com" })
		.setProtectedHeader({ alg: "RS256", kid: "unit-test-key" })
		.setSubject(overrides.sub ?? "google-sub-123")
		.setIssuer(overrides.iss ?? ISSUER)
		.setAudience(overrides.aud ?? CLIENT_ID)
		.setIssuedAt()
		.setExpirationTime(overrides.exp ?? "10m")
		.sign(privateKeyToUse);
}

describe("verifyGoogleIdToken", () => {
	test("accepts a valid token and extracts claims", async () => {
		const token = await new jose.SignJWT({
			email: "user@example.com",
			email_verified: true,
			name: "Test User",
		})
			.setProtectedHeader({ alg: "RS256", kid: "unit-test-key" })
			.setSubject("google-sub-123")
			.setIssuer(ISSUER)
			.setAudience(CLIENT_ID)
			.setIssuedAt()
			.setExpirationTime("10m")
			.sign(privateKey);

		const result = await verifyGoogleIdToken(token, {
			clientId: CLIENT_ID,
			jwks: localJwks,
		});

		expect(isClaims(result)).toBe(true);
		if (isClaims(result)) {
			expect(result.sub).toBe("google-sub-123");
			expect(result.email).toBe("user@example.com");
			expect(result.emailVerified).toBe(true);
			expect(result.displayName).toBe("Test User");
		}
	});

	test("rejects a wrong audience as wrong_audience", async () => {
		const token = await signToken(privateKey, {
			aud: "another-app.apps.googleusercontent.com",
		});
		const result = await verifyGoogleIdToken(token, {
			clientId: CLIENT_ID,
			jwks: localJwks,
		});
		expect(result).toEqual({ error: "wrong_audience" });
	});

	test("rejects an expired token as expired", async () => {
		const token = await signToken(privateKey, { exp: "-10m" });
		const result = await verifyGoogleIdToken(token, {
			clientId: CLIENT_ID,
			jwks: localJwks,
		});
		expect(result).toEqual({ error: "expired" });
	});

	test("rejects a wrong issuer as invalid_token", async () => {
		const token = await signToken(privateKey, { iss: "https://evil.example" });
		const result = await verifyGoogleIdToken(token, {
			clientId: CLIENT_ID,
			jwks: localJwks,
		});
		expect(result).toEqual({ error: "invalid_token" });
	});

	test("rejects a token signed by another key as invalid_token", async () => {
		const token = await signToken(otherPrivateKey, {});
		const result = await verifyGoogleIdToken(token, {
			clientId: CLIENT_ID,
			jwks: localJwks,
		});
		expect(result).toEqual({ error: "invalid_token" });
	});

	test("rejects malformed input as invalid_token", async () => {
		const result = await verifyGoogleIdToken("not-a-jwt", {
			clientId: CLIENT_ID,
			jwks: localJwks,
		});
		expect(result).toEqual({ error: "invalid_token" });
	});

	test("uses GOOGLE_JWKS_URL-based remote jwks when no jwks is injected", async () => {
		// The remote fetch goes to a nonexistent endpoint: the failure mode is
		// invalid_token (JWKS fetch error), not a thrown network error. This
		// pins that the env var is honored when no jwks is injected.
		vi.stubEnv("GOOGLE_JWKS_URL", "http://127.0.0.1:9/never-up");
		const token = await signToken(privateKey, {});
		const result = await verifyGoogleIdToken(token, { clientId: CLIENT_ID });
		expect(result).toEqual({ error: "invalid_token" });
	});
});
