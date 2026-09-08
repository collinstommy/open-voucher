import { describe, expect, test } from "vitest";
import {
	APP_CLIENT_HEADER,
	deliversViaTelegram,
	parseAppClientClaim,
	parseAppClientHeader,
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
		expect(parseAppClientClaim("telegram")).toBeUndefined();
		expect(parseAppClientClaim("nope")).toBeUndefined();
	});
});

describe("parseAppClientHeader", () => {
	test("reads X-OpenVoucher-Client", () => {
		expect(parseAppClientHeader(new Headers()).ok).toBe(true);
		expect(
			parseAppClientHeader(new Headers({ [APP_CLIENT_HEADER]: "android" })),
		).toEqual({ ok: true, client: "android" });
		expect(
			parseAppClientHeader(new Headers({ [APP_CLIENT_HEADER]: "telegram" })).ok,
		).toBe(false);
	});
});
