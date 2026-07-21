import { describe, expect, test } from "vitest";
import { classifyInboundMessage } from "../../src/lib/messageIntent";

describe("classifyInboundMessage", () => {
	test("classifies image uploads", () => {
		expect(
			classifyInboundMessage({ text: "", messageType: "image" }),
		).toBe("image");
	});

	test("classifies user state flows", () => {
		expect(
			classifyInboundMessage({
				text: "anything here",
				messageType: "text",
				userState: "waiting_for_ban_appeal",
			}),
		).toBe("state_ban_appeal");
	});

	test("classifies standard commands", () => {
		expect(
			classifyInboundMessage({ text: "help", messageType: "text" }),
		).toBe("help");
		expect(
			classifyInboundMessage({ text: "/balance", messageType: "text" }),
		).toBe("balance");
		expect(
			classifyInboundMessage({
				text: "feedback great bot",
				messageType: "text",
			}),
		).toBe("feedback_with_text");
	});

	test("classifies voucher claims when message is short", () => {
		expect(classifyInboundMessage({ text: "5", messageType: "text" })).toBe(
			"claim_5",
		);
		expect(classifyInboundMessage({ text: "10", messageType: "text" })).toBe(
			"claim_10",
		);
		expect(classifyInboundMessage({ text: " 20 ", messageType: "text" })).toBe(
			"claim_20",
		);
	});

	test("does not classify long messages with embedded amounts as claims", () => {
		expect(
			classifyInboundMessage({
				text: "please send me a 5 voucher",
				messageType: "text",
			}),
		).toBe("unknown");
	});

	test("classifies unrecognized text as unknown", () => {
		expect(
			classifyInboundMessage({
				text: "how do I get coins?",
				messageType: "text",
			}),
		).toBe("unknown");
	});

	test("does not classify known commands as unknown", () => {
		const knownCommands = [
			{ text: "help", expected: "help" },
			{ text: "/help", expected: "help" },
			{ text: "balance", expected: "balance" },
			{ text: "/balance", expected: "balance" },
			{ text: "start", expected: "start" },
			{ text: "faq", expected: "faq" },
			{ text: "donate", expected: "donate" },
			{ text: "app", expected: "app" },
			{ text: "share", expected: "share" },
			{ text: "feedback", expected: "feedback" },
			{ text: "5", expected: "claim_5" },
			{ text: "10", expected: "claim_10" },
			{ text: "20", expected: "claim_20" },
		];

		for (const { text, expected } of knownCommands) {
			const result = classifyInboundMessage({ text, messageType: "text" });
			expect(result).toBe(expected);
			expect(result).not.toBe("unknown");
		}
	});
});
