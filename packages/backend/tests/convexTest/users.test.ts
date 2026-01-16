/**
 * User Signup Flow Tests (No Invite Codes)
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

let sentMessages: { chatId: string; text?: string }[] = [];

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
				sentMessages.push({ chatId: body.chat_id, text: body.text });
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

describe("User Signup Flow", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("new user is created via Telegram message", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456789";
		const username = "testuser";
		const firstName = "Test";

		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage({ text: "/start", chatId, username }),
		});

		const user = await t.run(async (ctx) => {
			return await ctx.db
				.query("users")
				.withIndex("by_chat_id", (q) => q.eq("telegramChatId", chatId))
				.first();
		});

		expect(user?.telegramChatId).toBe(chatId);
		expect(user?.username).toBe(username);
		expect(user?.firstName).toBe(firstName);
		expect(user?.isBanned).toBe(false);

		// Verify welcome message was sent
		const welcomeMsg = sentMessages.find(
			(m) =>
				m.chatId === chatId &&
				m.text?.includes("Welcome to Dunnes Voucher Bot!"),
		);
		expect(welcomeMsg).toBeDefined();
	});

	test("existing user is recognized and redirected properly", async () => {
		const t = convexTest(schema, modules);
		const chatId = "987654321";
		const username = "existinguser";

		await createUser(t, {
			telegramChatId: chatId,
			username,
			firstName: "Existing",
		});

		sentMessages = [];

		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage({ text: "hello", chatId, username }),
		});

		const users = await t.run(async (ctx) => {
			return await ctx.db
				.query("users")
				.withIndex("by_chat_id", (q) => q.eq("telegramChatId", chatId))
				.collect();
		});

		expect(users).toHaveLength(1);

		const welcomeMsg = sentMessages.find(
			(m) =>
				m.chatId === chatId &&
				m.text?.includes("Welcome to Dunnes Voucher Bot!"),
		);
		expect(welcomeMsg).toBeUndefined();
	});

	test("user receives signup bonus and transaction is recorded", async () => {
		const t = convexTest(schema, modules);
		const chatId = "111222333";
		const SIGNUP_BONUS = 10; // Matches constants.ts

		await t.mutation(internal.users.createUser, {
			telegramChatId: chatId,
			username: "bonususer",
			firstName: "Bonus",
		});

		const transactions = await t.run(async (ctx) => {
			const user = await ctx.db
				.query("users")
				.withIndex("by_chat_id", (q) => q.eq("telegramChatId", chatId))
				.first();
			if (!user) return [];
			return await ctx.db
				.query("transactions")
				.withIndex("by_user", (q) => q.eq("userId", user._id))
				.collect();
		});

		expect(transactions).toHaveLength(1);
		expect(transactions[0]).toMatchObject({
			type: "signup_bonus",
			amount: SIGNUP_BONUS,
		});

		const user = await t.run(async (ctx) => {
			return await ctx.db
				.query("users")
				.withIndex("by_chat_id", (q) => q.eq("telegramChatId", chatId))
				.first();
		});

		expect(user?.coins).toBe(SIGNUP_BONUS);
	});

	test("onboarding step is set after signup", async () => {
		const t = convexTest(schema, modules);
		const chatId = "333444555";

		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage({ text: "/start", chatId }),
		});

		const user = await t.run(async (ctx) => {
			return await ctx.db
				.query("users")
				.withIndex("by_chat_id", (q) => q.eq("telegramChatId", chatId))
				.first();
		});

		expect(user?.onboardingStep).toBe(1);
	});

	test("multiple new users can sign up independently", async () => {
		const t = convexTest(schema, modules);

		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage({ text: "/start", chatId: "user1" }),
		});

		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage({ text: "/start", chatId: "user2" }),
		});

		const users = await t.run(async (ctx) => {
			return await ctx.db.query("users").collect();
		});

		expect(users).toHaveLength(2);

		const welcomeMessages = sentMessages.filter((m) =>
			m.text?.includes("Welcome to Dunnes Voucher Bot!"),
		);
		expect(welcomeMessages).toHaveLength(2);
	});

	test("returns existing user data when creating duplicate user", async () => {
		const t = convexTest(schema, modules);
		const chatId = "duplicate123";

		const result1 = await t.mutation(internal.users.createUser, {
			telegramChatId: chatId,
			firstName: "First",
		});

		const result2 = await t.mutation(internal.users.createUser, {
			telegramChatId: chatId,
			firstName: "Second",
		});

		// Verify user has correct coins
		expect(result1._id).toBe(result2._id);

		const users = await t.run(async (ctx) => {
			return await ctx.db
				.query("users")
				.withIndex("by_chat_id", (q) => q.eq("telegramChatId", chatId))
				.collect();
		});

		expect(users).toHaveLength(1);
		expect(users[0].firstName).toBe("First");
	});
});
