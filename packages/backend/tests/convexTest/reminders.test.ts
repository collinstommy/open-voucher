/**
 * Reminder Flow Tests
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
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

describe("Reminder Flow", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("sends reminders to users who claimed vouchers yesterday", async () => {
		vi.useFakeTimers();

		const now = Date.now();
		const oneDayMs = 24 * 60 * 60 * 1000;
		const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
		const yesterday = now - oneDayMs;
		const twoDaysAgo = now - 2 * oneDayMs;
		const futureExpiry = now + sevenDaysMs;

		const t = convexTest(schema, modules);

		const claimerId = await createUser(t, {
			telegramChatId: "claimer123",
			coins: 100,
		});
		const uploaderId = await createUser(t, {
			telegramChatId: "uploader456",
			coins: 50,
		});

		// Create voucher claimed yesterday (should trigger reminder)
		await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId,
			claimedAt: yesterday,
			expiryDate: futureExpiry,
			createdAt: yesterday,
		});

		// Create voucher claimed today (should NOT trigger)
		await createVoucher(t, {
			type: "5",
			uploaderId,
			status: "claimed",
			claimerId,
			claimedAt: now,
			expiryDate: futureExpiry,
			createdAt: now,
		});

		// Create voucher claimed 2 days ago (should NOT trigger)
		await createVoucher(t, {
			type: "20",
			uploaderId,
			status: "claimed",
			claimerId,
			claimedAt: twoDaysAgo,
			expiryDate: futureExpiry,
			createdAt: twoDaysAgo,
		});

		const chatIds = await t.query(
			internal.reminders.getUsersWhoClaimedYesterday,
			{},
		);

		expect(chatIds).toHaveLength(1);
		expect(chatIds[0]).toBe("claimer123");

		sentMessages.length = 0;
		await t.action(internal.reminders.sendDailyUploadReminders, {});

		vi.runAllTimers();
		await t.finishInProgressScheduledFunctions();

		const reminderMessage = sentMessages.find(
			(m) =>
				m.chatId === "claimer123" &&
				m.text?.includes("Upload your new vouchers"),
		);
		expect(reminderMessage).toBeDefined();

		const uploaderMessage = sentMessages.find(
			(m) => m.chatId === "uploader456",
		);
		expect(uploaderMessage).toBeUndefined();

		vi.useRealTimers();
	});
});
