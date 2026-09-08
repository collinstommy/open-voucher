import { describe, expect, test } from "vitest";
import { deliversViaTelegram } from "../../src/lib/client";

describe("deliversViaTelegram", () => {
	test("only the telegram client delivers Bot API messages", () => {
		expect(deliversViaTelegram("telegram")).toBe(true);
		expect(deliversViaTelegram("android")).toBe(false);
		expect(deliversViaTelegram("ios")).toBe(false);
		expect(deliversViaTelegram("web")).toBe(false);
	});
});
