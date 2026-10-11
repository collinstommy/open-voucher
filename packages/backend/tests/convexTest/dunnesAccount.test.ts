import { describe, expect, test } from "vitest";
import {
	ensureDunnesTokens,
	labelFromLink,
	storedLinkResult,
	type DunnesTokens,
} from "../../src/dunnes/account";

const tokens = (overrides: Partial<DunnesTokens> = {}): DunnesTokens => ({
	username: "a@b.c",
	accessToken: "access",
	refreshToken: "refresh",
	expiresAtMs: 2_000,
	...overrides,
});

describe("storedLinkResult", () => {
	test("maps the three Dunnes answers", () => {
		expect(
			storedLinkResult({
				status: 400,
				body: {
					message:
						"This voucher is already linked to another VALUEclub account.",
				},
			}),
		).toBe("claimed");
		expect(
			storedLinkResult({
				status: 400,
				body: { message: "Voucher has already been redeemed." },
			}),
		).toBe("redeemed");
		expect(
			storedLinkResult({
				status: 200,
				body: { message: "Voucher successfully added." },
			}),
		).toBe("unlinked");
	});

	test("stores any other response as other", () => {
		expect(
			storedLinkResult({
				status: 400,
				body: { message: "Unrecognised barcode." },
			}),
		).toBe("other");
	});
});

describe("labelFromLink", () => {
	test("names the three LinkVoucher results", () => {
		expect(
			labelFromLink({
				status: 400,
				body: {
					message:
						"This voucher is already linked to another VALUEclub account.",
				},
			}),
		).toBe("Claimed. Already linked to another VALUEclub account.");
		expect(
			labelFromLink({
				status: 400,
				body: { message: "Voucher has already been redeemed." },
			}),
		).toBe("Redeemed. Voucher has already been redeemed.");
		expect(labelFromLink({ status: 200, body: { message: "success" } })).toBe(
			"Unlinked. This check attached the barcode to this account.",
		);
	});

	test("keeps an unexpected Dunnes message", () => {
		expect(
			labelFromLink({
				status: 400,
				body: {
					message:
						"Unrecognised barcode. Please ensure this is a supported voucher type.",
				},
			}),
		).toBe(
			"Unrecognised barcode. Please ensure this is a supported voucher type.",
		);
	});
});

describe("ensureDunnesTokens", () => {
	test("reuses a fresh access token", async () => {
		let logins = 0;
		const next = await ensureDunnesTokens({
			stored: {
				accessToken: "live",
				refreshToken: "refresh",
				expiresAtMs: 5_000,
			},
			username: "a@b.c",
			password: "secret",
			nowMs: 1_000,
			login: async () => {
				logins += 1;
				return tokens();
			},
			refresh: async () => tokens({ accessToken: "refreshed" }),
		});
		expect(next.accessToken).toBe("live");
		expect(logins).toBe(0);
	});

	test("refreshes an expired token and falls back to the password", async () => {
		let logins = 0;
		const next = await ensureDunnesTokens({
			stored: { accessToken: "old", refreshToken: "refresh", expiresAtMs: 500 },
			username: "a@b.c",
			password: "secret",
			nowMs: 1_000,
			login: async () => {
				logins += 1;
				return tokens({
					accessToken: "from-password",
					refreshToken: "new-refresh",
				});
			},
			refresh: async () => {
				throw new Error("expired refresh");
			},
		});
		expect(next.accessToken).toBe("from-password");
		expect(logins).toBe(1);
	});
});
