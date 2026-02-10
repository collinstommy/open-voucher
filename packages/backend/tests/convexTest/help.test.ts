/**
 * Help Callback Menu Tests
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "../test.setup";
import {
	createTelegramCallback,
	createTelegramMessage,
	createUser,
	createVoucher,
	mockTelegramResponse,
} from "./fixtures/testHelpers";

let sentMessages: { chatId: string; text?: string; replyMarkup?: any }[] = [];

function setupFetchMock() {
	sentMessages = [];

	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, options?: RequestInit) => {
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

			if (url.includes("convex.cloud") || url.includes("convex.site")) {
				return {
					ok: true,
					arrayBuffer: async () => new ArrayBuffer(100),
					blob: async () => new Blob(["voucher-image"], { type: "image/jpeg" }),
				} as Response;
			}

			console.warn(`Unmocked fetch: ${url}`);
			return { ok: false, status: 404 } as Response;
		}),
	);
}

describe("Help Command", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("help command shows inline keyboard menu with all buttons", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456";

		await createUser(t, { telegramChatId: chatId, coins: 100 });

		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage({ text: "help", chatId }),
		});

		const helpMsg = sentMessages.find((m) => m.chatId === chatId);
		expect(helpMsg).toBeDefined();

		const replyMarkup = JSON.parse(helpMsg?.replyMarkup || "{}");
		expect(replyMarkup.inline_keyboard).toBeDefined();

		const buttons = replyMarkup.inline_keyboard.flat();
		const buttonTexts = buttons.map((b: any) => b.text);

		expect(buttonTexts).toContain("Balance");
		expect(buttonTexts).toContain("Support");
		expect(buttonTexts).toContain("Give feedback");
		expect(buttonTexts).not.toContain("Faq");
		expect(buttonTexts).toContain("Voucher Availability");
		expect(buttonTexts).toContain("How to upload?");
		expect(buttonTexts).toContain("How to claim?");
	});
});

describe("Help Callback Responses", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("balance callback shows user coin balance", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456";
		const userId = await createUser(t, { telegramChatId: chatId, coins: 42 });

		await t.action(internal.telegram.handleTelegramCallback, {
			callbackQuery: createTelegramCallback({ data: "help:balance", chatId }),
		});

		const balanceMsg = sentMessages.find(
			(m) => m.chatId === chatId && m.text?.includes("42"),
		);
		expect(balanceMsg).toBeDefined();
		expect(balanceMsg?.text).toContain("coins");
	});

	test("support callback prompts user for support message", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456";
		await createUser(t, { telegramChatId: chatId, coins: 100 });

		await t.action(internal.telegram.handleTelegramCallback, {
			callbackQuery: createTelegramCallback({ data: "help:support", chatId }),
		});

		const supportMsg = sentMessages.find(
			(m) => m.chatId === chatId && m.text?.toLowerCase().includes("help"),
		);
		expect(supportMsg).toBeDefined();
		expect(supportMsg?.text).toContain("message");
	});

	test("feedback callback prompts user for feedback message", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456";
		await createUser(t, { telegramChatId: chatId, coins: 100 });

		await t.action(internal.telegram.handleTelegramCallback, {
			callbackQuery: createTelegramCallback({ data: "help:feedback", chatId }),
		});

		const feedbackMsg = sentMessages.find(
			(m) => m.chatId === chatId && m.text?.toLowerCase().includes("feedback"),
		);
		expect(feedbackMsg).toBeDefined();
		expect(feedbackMsg?.text).toContain("message");
	});

	test("voucher availability callback shows none for €5, low for €10, good for €20", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456";
		const userId = await createUser(t, { telegramChatId: chatId, coins: 100 });

		await createVoucher(t, {
			type: "10",
			uploaderId: userId,
			status: "available",
		});
		await createVoucher(t, {
			type: "10",
			uploaderId: userId,
			status: "available",
		});
		await createVoucher(t, {
			type: "10",
			uploaderId: userId,
			status: "available",
		});
		for (let i = 0; i < 10; i++) {
			await createVoucher(t, {
				type: "20",
				uploaderId: userId,
				status: "available",
			});
		}

		await t.action(internal.telegram.handleTelegramCallback, {
			callbackQuery: createTelegramCallback({
				data: "help:availability",
				chatId,
			}),
		});

		const availMsg = sentMessages.find((m) => m.chatId === chatId);
		expect(availMsg).toBeDefined();
		expect(availMsg?.text).toContain("€5 vouchers: 🔴 none");
		expect(availMsg?.text).toContain("€10 vouchers: 🟡 low");
		expect(availMsg?.text).toContain("€20 vouchers: 🟢 good availability");
	});

	test("upload callback shows instruction text on how to upload", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456";
		await createUser(t, { telegramChatId: chatId, coins: 100 });

		await t.action(internal.telegram.handleTelegramCallback, {
			callbackQuery: createTelegramCallback({ data: "help:upload", chatId }),
		});

		const uploadMsg = sentMessages.find(
			(m) => m.chatId === chatId && m.text?.toLowerCase().includes("upload"),
		);
		expect(uploadMsg).toBeDefined();
		expect(uploadMsg?.text).toContain("screenshot");
	});

	test("claim callback shows instruction text on how to claim", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456";
		await createUser(t, { telegramChatId: chatId, coins: 100 });

		await t.action(internal.telegram.handleTelegramCallback, {
			callbackQuery: createTelegramCallback({ data: "help:claim", chatId }),
		});

		const claimMsg = sentMessages.find(
			(m) => m.chatId === chatId && m.text?.toLowerCase().includes("claim"),
		);
		expect(claimMsg).toBeDefined();
		expect(claimMsg?.text).toContain("5") ||
			claimMsg?.text?.toLowerCase().includes("send");
	});
});

describe("Voucher Availability Query", () => {
	test("getVoucherAvailability returns correct counts per type", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456";
		const userId = await createUser(t, { telegramChatId: chatId, coins: 100 });

		await createVoucher(t, {
			type: "5",
			uploaderId: userId,
			status: "available",
		});
		await createVoucher(t, {
			type: "5",
			uploaderId: userId,
			status: "available",
		});
		await createVoucher(t, {
			type: "10",
			uploaderId: userId,
			status: "available",
		});
		await createVoucher(t, {
			type: "10",
			uploaderId: userId,
			status: "claimed",
		});
		await createVoucher(t, {
			type: "20",
			uploaderId: userId,
			status: "available",
		});

		const result = await t.run(async (ctx) => {
			return await ctx.runQuery(internal.vouchers.getAvailableVoucherCount);
		});

		expect(result).toEqual({ "5": 2, "10": 1, "20": 1 });
	});
});
