/**
 * User Signup Flow Tests
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "../test.setup";
import {
	createTelegramMessage,
	mockTelegramResponse,
} from "./fixtures/testHelpers";

let sentMessages: { chatId: string; text?: string }[] = [];

function setupFetchMock() {
	sentMessages = [];

	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, options?: RequestInit) => {
			// Mock Telegram sendMessage
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

			// Mock Telegram answerCallbackQuery
			if (
				url.includes("api.telegram.org") &&
				url.includes("/answerCallbackQuery")
			) {
				return {
					ok: true,
					json: async () => ({ ok: true, result: true }),
				} as Response;
			}

			// Mock Convex storage
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

	test("new user with valid invite code is created via Telegram message", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456789";

		const inviteCode = await t.run(async (ctx) => {
			const codeId = await ctx.db.insert("inviteCodes", {
				code: "TESTCODE",
				maxUses: 100,
				usedCount: 0,
				createdAt: Date.now(),
			});
			return "TESTCODE";
		});

		// Simulate sending "code TESTCODE"
		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage({ text: `code ${inviteCode}`, chatId }),
		});

		// Check user created
		const user = await t.run(async (ctx) => {
			return await ctx.db
				.query("users")
				.withIndex("by_chat_id", (q) => q.eq("telegramChatId", chatId))
				.first();
		});

		expect(user).toBeDefined();
		expect(user?.isBanned).toBe(false);

		// Verify welcome message
		const welcomeMsg = sentMessages.find(
			(m) =>
				m.chatId === chatId &&
				m.text?.includes("Welcome to Dunnes Voucher Bot!"),
		);
		expect(welcomeMsg).toBeDefined();
	});

	test("validate invite code increments usage via Telegram message", async () => {
		const t = convexTest(schema, modules);
		const chatId = "987654321";

		await t.run(async (ctx) => {
			await ctx.db.insert("inviteCodes", {
				code: "SINGLEUSE",
				maxUses: 1,
				usedCount: 0,
				createdAt: Date.now(),
			});
		});

		// First use: Should succeed (uses mock message)
		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage({ text: "code SINGLEUSE", chatId }),
		});

		const user = await t.run(async (ctx) => {
			return await ctx.db
				.query("users")
				.withIndex("by_chat_id", (q) => q.eq("telegramChatId", chatId))
				.first();
		});
		expect(user).toBeDefined();

		// Second use: Should fail (new user from different chat)
		const chatId2 = "987654322";
		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage({ text: "code SINGLEUSE", chatId: chatId2 }),
		});

		// Verify failure message
		const errorMsg = sentMessages.find(
			(m) => m.chatId === chatId2 && m.text?.includes("limit"),
		);
		expect(errorMsg).toBeDefined();
	});

	test("invalid invite code returns error via Telegram message", async () => {
		const t = convexTest(schema, modules);
		const chatId = "111222333";

		await t.action(internal.telegram.handleTelegramMessage, {
			message: createTelegramMessage({ text: "code DOESNOTEXIST", chatId }),
		});

		// Verify failure message
		const errorMsg = sentMessages.find(
			(m) => m.chatId === chatId && m.text?.includes("Invalid"),
		);
		expect(errorMsg).toBeDefined();

		// Verify user NOT created
		const user = await t.run(async (ctx) => {
			return await ctx.db
				.query("users")
				.withIndex("by_chat_id", (q) => q.eq("telegramChatId", chatId))
				.first();
		});
		expect(user).toBeNull();
	});
});
