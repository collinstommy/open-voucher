/**
 * End-to-end tests for unknown-message classification.
 * Verifies that known commands do not trigger the Gemini-based classifier.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "../test.setup";
import {
	createTelegramMessage,
	createUser,
	mockTelegramResponse,
} from "./fixtures/testHelpers";

let sentMessages: { chatId: string; text?: string; replyMarkup?: any }[] = [];
let geminiCalls: string[] = [];

function setupFetchMock() {
	sentMessages = [];
	geminiCalls = [];

	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, options?: RequestInit) => {
			if (url.includes("generativelanguage.googleapis.com")) {
				geminiCalls.push(url);
				throw new Error(
					`Gemini API should not be called for known commands: ${url}`,
				);
			}

			if (url.includes("api.telegram.org") && url.includes("/sendMessage")) {
				let body: any = {};
				if (options?.body instanceof FormData) {
					body = Object.fromEntries(options.body as any);
				} else if (typeof options?.body === "string") {
					body = JSON.parse(options.body);
				}
				sentMessages.push({
					chatId: body.chat_id,
					text: body.text,
					replyMarkup: body.reply_markup,
				});
				return {
					ok: true,
					json: async () => mockTelegramResponse(),
				} as Response;
			}

			if (
				url.includes("api.telegram.org") &&
				url.includes("/answerCallbackQuery")
			) {
				return {
					ok: true,
					json: async () => ({ ok: true, result: true }),
				} as Response;
			}

			console.warn(`Unmocked fetch: ${url}`);
			return { ok: false, status: 404 } as Response;
		}),
	);
}

describe("Known message classification", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
		vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-gemini-key");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("does not call Gemini for 'help' command", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456";
		await createUser(t, { telegramChatId: chatId, coins: 100 });

		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage({ text: "help", chatId }),
		});

		expect(geminiCalls).toHaveLength(0);

		const storedMessages = await t.run(async (ctx) => {
			return await ctx.db
				.query("messages")
				.filter((q) => q.eq(q.field("telegramChatId"), chatId))
				.collect();
		});

		expect(storedMessages).toHaveLength(1);
		expect(storedMessages[0].intent).toBe("help");
		expect(storedMessages[0].classifiedIntent).toBeUndefined();
	});

	test("does not call Gemini for '10' voucher claim", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456";
		await createUser(t, { telegramChatId: chatId, coins: 100 });

		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage({ text: "10", chatId }),
		});

		expect(geminiCalls).toHaveLength(0);

		const storedMessages = await t.run(async (ctx) => {
			return await ctx.db
				.query("messages")
				.filter((q) => q.eq(q.field("telegramChatId"), chatId))
				.collect();
		});

		expect(storedMessages).toHaveLength(1);
		expect(storedMessages[0].intent).toBe("claim_10");
		expect(storedMessages[0].classifiedIntent).toBeUndefined();
	});

	test("does not call Gemini for '/balance' command", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456";
		await createUser(t, { telegramChatId: chatId, coins: 42 });

		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage({ text: "/balance", chatId }),
		});

		expect(geminiCalls).toHaveLength(0);

		const storedMessages = await t.run(async (ctx) => {
			return await ctx.db
				.query("messages")
				.filter((q) => q.eq(q.field("telegramChatId"), chatId))
				.collect();
		});

		expect(storedMessages).toHaveLength(1);
		expect(storedMessages[0].intent).toBe("balance");
		expect(storedMessages[0].classifiedIntent).toBeUndefined();
	});
});
