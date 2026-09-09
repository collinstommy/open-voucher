import * as jose from "jose";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { issueJwt } from "../../src/lib/jwt";

describe("issueJwt", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("embeds the app client claim", async () => {
		const { publicKey, privateKey } = await jose.generateKeyPair("RS256", {
			extractable: true,
			modulusLength: 2048,
		});
		vi.stubEnv("JWT_PRIVATE_KEY", await jose.exportPKCS8(privateKey));

		const userId = "jd7d0example000000000000" as Id<"users">;
		const token = await issueJwt(userId, "android");
		const { payload } = await jose.jwtVerify(token, publicKey, {
			issuer: "https://www.openvouchers.org",
			audience: "open-voucher",
		});
		expect(payload.sub).toBe(userId);
		expect(payload.client).toBe("android");
	});
});
