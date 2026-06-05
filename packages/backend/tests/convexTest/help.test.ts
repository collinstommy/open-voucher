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

	test("help command shows slim inline keyboard menu", async () => {
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

		expect(buttonTexts).toContain("💰 Balance");
		expect(buttonTexts).toContain("📱 My Account");
		expect(buttonTexts).toContain("📸 How to Upload");
		expect(buttonTexts).toContain("🎫 How to Claim");
		expect(buttonTexts).toContain("🔗 Share Bot");
		expect(buttonTexts).toContain("☕ Donate");
		expect(buttonTexts).not.toContain("❓ FAQ");
		expect(buttonTexts).not.toContain("📊 Voucher Availability");
		expect(buttonTexts).not.toContain("📋 View Transactions");
		expect(buttonTexts).not.toContain("🆕 View updates");

		const myAccount = buttons.find((b: { text: string }) => b.text === "📱 My Account");
		expect(myAccount?.web_app?.url).toBe("https://openvouchers.org/app");
	});
});

describe("Account command", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("account command sends My Account web_app button", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456";

		await createUser(t, { telegramChatId: chatId, coins: 100 });

		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage({ text: "account", chatId }),
		});

		const accountMsg = sentMessages.find(
			(m) => m.chatId === chatId && m.text?.includes("My Account"),
		);
		expect(accountMsg).toBeDefined();

		const replyMarkup = JSON.parse(accountMsg?.replyMarkup || "{}");
		const button = replyMarkup.inline_keyboard.flat()[0];
		expect(button.text).toBe("📱 Open My Account");
		expect(button.web_app.url).toBe("https://openvouchers.org/app");
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
			callbackQuery: createTelegramCallback({ data: JSON.stringify({ k: "help", a: "balance" }), chatId }),
		});

		const balanceMsg = sentMessages.find(
			(m) => m.chatId === chatId && m.text?.includes("42"),
		);
		expect(balanceMsg).toBeDefined();
		expect(balanceMsg?.text).toContain("coins");
	});

	test("upload callback shows instruction text on how to upload", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456";
		await createUser(t, { telegramChatId: chatId, coins: 100 });

		await t.action(internal.telegram.handleTelegramCallback, {
			callbackQuery: createTelegramCallback({ data: JSON.stringify({ k: "help", a: "upload" }), chatId }),
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
			callbackQuery: createTelegramCallback({ data: JSON.stringify({ k: "help", a: "claim" }), chatId }),
		});

		const claimMsg = sentMessages.find(
			(m) => m.chatId === chatId && m.text?.toLowerCase().includes("claim"),
		);
		expect(claimMsg).toBeDefined();
		expect(claimMsg?.text).toContain("5");
	});

});

describe("getAvailableVoucherCount", () => {
	test("returns correct counts per type", async () => {
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
