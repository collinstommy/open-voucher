import { describe, expect, test } from "vitest";
import { classifyInboundMessage } from "./messageIntent";

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
				userState: "waiting_for_feedback_message",
			}),
		).toBe("state_feedback");
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
});
