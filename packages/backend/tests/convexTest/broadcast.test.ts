/**
 * Broadcast audience and send flow tests
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { ADMIN_TEST_TELEGRAM_CHAT_ID } from "../../convex/lib/broadcastAudience";
import schema from "../../convex/schema";
import { modules } from "../test.setup";
import {
	createUser,
	createVoucher,
	mockTelegramResponse,
} from "./fixtures/testHelpers";

let sentMessages: { chatId: string; text?: string }[] = [];

function setupFetchMock() {
	sentMessages = [];

	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, options?: RequestInit) => {
			if (url.includes("api.telegram.org") && url.includes("/sendMessage")) {
				let body: Record<string, unknown> = {};
				if (typeof options?.body === "string") {
					body = JSON.parse(options.body);
				}
				sentMessages.push({
					chatId: String(body.chat_id),
					text: body.text as string | undefined,
				});
				return {
					ok: true,
					json: async () => mockTelegramResponse(),
				} as Response;
			}

			return { ok: false, status: 404 } as Response;
		}),
	);
}

describe("Broadcast", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
		vi.stubEnv("ADMIN_PASSWORD", "test-admin-password");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("preview counts users by recent claims and excludes banned users", async () => {
		const t = convexTest(schema, modules);
		const now = Date.now();
		const oneDayMs = 24 * 60 * 60 * 1000;
		const futureExpiry = now + 7 * oneDayMs;

		const activeClaimerId = await createUser(t, {
			telegramChatId: "active_claimer",
			coins: 100,
		});
		const bannedClaimerId = await createUser(t, {
			telegramChatId: "banned_claimer",
			coins: 100,
			isBanned: true,
		});
		const uploaderId = await createUser(t, {
			telegramChatId: "uploader",
			coins: 50,
		});

		for (let i = 0; i < 3; i++) {
			await createVoucher(t, {
				type: "10",
				uploaderId,
				status: "claimed",
				claimerId: activeClaimerId,
				claimedAt: now - i * oneDayMs,
				expiryDate: futureExpiry,
				createdAt: now - i * oneDayMs,
			});
		}

		for (let i = 0; i < 3; i++) {
			await createVoucher(t, {
				type: "5",
				uploaderId,
				status: "claimed",
				claimerId: bannedClaimerId,
				claimedAt: now - i * oneDayMs,
				expiryDate: futureExpiry,
				createdAt: now - i * oneDayMs,
			});
		}

		const loginResult = await t.mutation(api.admin.auth.login, {
			password: "test-admin-password",
		});

		const preview = await t.query(api.admin.broadcast.previewBroadcastAudience, {
			token: loginResult.token,
			minClaims: 3,
			withinDays: 7,
		});

		expect(preview.count).toBe(1);
		expect(preview.sample).toHaveLength(1);
		expect(preview.sample[0]?.telegramChatId).toBe("active_claimer");
		expect(preview.sample[0]?.claimCount).toBe(3);
		expect(preview.exceedsLimit).toBe(false);
	});

	test("test mode sends only to the hardcoded admin Telegram ID", async () => {
		vi.useFakeTimers();

		const t = convexTest(schema, modules);
		const loginResult = await t.mutation(api.admin.auth.login, {
			password: "test-admin-password",
		});

		const result = await t.mutation(api.admin.broadcast.sendBroadcast, {
			token: loginResult.token,
			messageText: "<b>Test broadcast</b>",
			minClaims: 99,
			withinDays: 1,
			testMode: true,
		});

		expect(result).toEqual({
			recipientCount: 1,
			testMode: true,
		});

		vi.runAllTimers();
		await t.finishInProgressScheduledFunctions();

		expect(sentMessages).toHaveLength(1);
		expect(sentMessages[0]?.chatId).toBe(ADMIN_TEST_TELEGRAM_CHAT_ID);
		expect(sentMessages[0]?.text).toContain("<b>Test broadcast</b>");

		vi.useRealTimers();
	});

	test("broadcast sends to matching users in batches", async () => {
		vi.useFakeTimers();

		const t = convexTest(schema, modules);
		const now = Date.now();
		const oneDayMs = 24 * 60 * 60 * 1000;
		const futureExpiry = now + 7 * oneDayMs;

		const uploaderId = await createUser(t, {
			telegramChatId: "uploader",
			coins: 50,
		});

		const claimerA = await createUser(t, {
			telegramChatId: "claimer_a",
			coins: 100,
		});
		const claimerB = await createUser(t, {
			telegramChatId: "claimer_b",
			coins: 100,
		});

		for (const claimerId of [claimerA, claimerB]) {
			for (let i = 0; i < 2; i++) {
				await createVoucher(t, {
					type: "10",
					uploaderId,
					status: "claimed",
					claimerId,
					claimedAt: now - i * oneDayMs,
					expiryDate: futureExpiry,
					createdAt: now - i * oneDayMs,
				});
			}
		}

		const loginResult = await t.mutation(api.admin.auth.login, {
			password: "test-admin-password",
		});

		const result = await t.mutation(api.admin.broadcast.sendBroadcast, {
			token: loginResult.token,
			messageText: "Hello active users",
			minClaims: 2,
			withinDays: 7,
			testMode: false,
		});

		expect(result.recipientCount).toBe(2);

		vi.runAllTimers();
		await t.finishInProgressScheduledFunctions();

		const chatIds = sentMessages.map((message) => message.chatId).sort();
		expect(chatIds).toEqual(["claimer_a", "claimer_b"]);

		vi.useRealTimers();
	});

	test("rejects broadcast when no users match criteria", async () => {
		const t = convexTest(schema, modules);
		const loginResult = await t.mutation(api.admin.auth.login, {
			password: "test-admin-password",
		});

		await expect(
			t.mutation(api.admin.broadcast.sendBroadcast, {
				token: loginResult.token,
				messageText: "Nobody here",
				minClaims: 10,
				withinDays: 7,
				testMode: false,
			}),
		).rejects.toThrow("No users match the selected criteria");
	});
});
