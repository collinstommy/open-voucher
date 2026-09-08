import { describe, expect, test } from "vitest";
import {
	APP_CLIENT_HEADER,
	deliversViaTelegram,
	parseAppClientClaim,
	parseAppClientHeader,
	requireAppClient,
} from "../../src/lib/client";

describe("deliversViaTelegram", () => {
	test("only the telegram client delivers Bot API messages", () => {
		expect(deliversViaTelegram("telegram")).toBe(true);
		expect(deliversViaTelegram("android")).toBe(false);
		expect(deliversViaTelegram("ios")).toBe(false);
		expect(deliversViaTelegram("web")).toBe(false);
	});
});

describe("parseAppClientClaim", () => {
	test("accepts app clients and rejects telegram", () => {
		expect(parseAppClientClaim("android")).toBe("android");
		expect(parseAppClientClaim("ios")).toBe("ios");
		expect(parseAppClientClaim("web")).toBe("web");
		expect(parseAppClientClaim("telegram")).toBeUndefined();
		expect(parseAppClientClaim("nope")).toBeUndefined();
	});
});

describe("requireAppClient", () => {
	test("returns the claim or throws", () => {
		expect(requireAppClient("android")).toBe("android");
		expect(() => requireAppClient(undefined)).toThrow(
			"Missing app client claim",
		);
	});
});

describe("parseAppClientHeader", () => {
	test("requires a valid X-OpenVoucher-Client app client", () => {
		expect(parseAppClientHeader(new Headers()).ok).toBe(false);
		expect(
			parseAppClientHeader(new Headers({ [APP_CLIENT_HEADER]: "   " })).ok,
		).toBe(false);
		expect(
			parseAppClientHeader(new Headers({ [APP_CLIENT_HEADER]: "android" })),
		).toEqual({ ok: true, client: "android" });
		expect(
			parseAppClientHeader(new Headers({ [APP_CLIENT_HEADER]: "web" })),
		).toEqual({ ok: true, client: "web" });
		expect(
			parseAppClientHeader(new Headers({ [APP_CLIENT_HEADER]: "telegram" })).ok,
		).toBe(false);
		expect(
			parseAppClientHeader(new Headers({ [APP_CLIENT_HEADER]: "nope" })).ok,
		).toBe(false);
	});
});
