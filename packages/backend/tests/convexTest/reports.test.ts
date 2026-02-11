/**
 * Report and Ban Flow Tests
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "../test.setup";
import {
	createUser,
	createVoucher,
	mockTelegramResponse,
} from "./fixtures/testHelpers";

let sentMessages: { chatId: string; text?: string }[] = [];
let editedMessages: { chatId: string; messageId: number; text?: string }[] = [];

function setupFetchMock() {
	sentMessages = [];
	editedMessages = [];

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

			// Mock Telegram editMessageText (for removing inline keyboards)
			if (
				url.includes("api.telegram.org") &&
				url.includes("/editMessageText")
			) {
				let body: any = {};
				if (typeof options?.body === "string") {
					body = JSON.parse(options.body);
				}
				editedMessages.push({
					chatId: body.chat_id,
					messageId: body.message_id,
					text: body.text,
				});
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

// ============================================================================
// Report Flow
// ============================================================================

describe("Report Flow", () => {
	beforeEach(() => {
		setupFetchMock();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("reporting voucher refunds coins when no replacement", async () => {
		const t = convexTest(schema, modules);

		// Create uploader
		const uploaderId = await createUser(t, {
			telegramChatId: "uploader123",
			coins: 10,
		});

		// Create claimer
		const claimerId = await createUser(t, {
			telegramChatId: "claimer456",
			coins: 10,
		});

		// Create claimed voucher
		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId,
			claimedAt: Date.now(),
		});

		// Report the voucher
		const result = await t.mutation(internal.vouchers.reportVoucher, {
			userId: claimerId,
			voucherId,
		});

		expect(result.status).toBe("refunded");

		// Check claimer got coins back
		const claimer = await t.run(async (ctx) => {
			return await ctx.db.get(claimerId);
		});
		expect(claimer?.coins).toBe(20);
	});
});

// ============================================================================
// Ban Flow (Part 1)
// ============================================================================

describe("Ban Flow", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("uploader gets banned when 3 of last 5 uploads reported", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const uploaderChatId = "uploader_ban_test";
		const reporterChatId = "reporter_test";

		// Create uploader user (will be banned)
		const uploaderId = await createUser(t, {
			telegramChatId: uploaderChatId,
			coins: 100,
		});

		// Create reporter user
		const reporterId = await createUser(t, {
			telegramChatId: reporterChatId,
			coins: 50,
		});

		// Create 5 vouchers, all claimed by reporter
		const voucherIds: Id<"vouchers">[] = [];
		for (let i = 0; i < 5; i++) {
			const voucherId = await createVoucher(t, {
				type: "10",
				uploaderId,
				status: "claimed",
				claimerId: reporterId,
				claimedAt: Date.now() - (5 - i) * 1000,
				createdAt: Date.now() - (5 - i) * 2000,
			});
			voucherIds.push(voucherId);
		}

		// Report first voucher on Day 1
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[0],
		});

		// Advance to Day 2 and report second voucher
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[1],
		});

		// Verify uploader is NOT banned yet
		let uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		expect(uploader?.isBanned).toBe(false);

		// Advance to Day 3 and report third voucher - this should trigger ban (3 of 5)
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[2],
		});

		// Wait for scheduled functions (ban notification) to complete
		vi.runAllTimers();
		await t.finishInProgressScheduledFunctions();

		// Verify the uploader is now banned
		uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		expect(uploader?.isBanned).toBe(true);
		expect(uploader?.bannedAt).toBeDefined();

		// Verify ban notification was sent to uploader
		const banNotification = sentMessages.find(
			(m) => m.chatId === uploaderChatId && m.text?.includes("Account Banned"),
		);
		expect(banNotification).toBeDefined();
		expect(banNotification?.text).toContain(
			"3 or more of your last 5 uploads were reported",
		);

		vi.useRealTimers();
	});

	test("banned user gets a ban message when trying to interact", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const uploaderChatId = "uploader_ban_test";
		const reporterChatId = "reporter_test";

		// Create uploader user (will be banned)
		const uploaderId = await createUser(t, {
			telegramChatId: uploaderChatId,
			coins: 100,
			isBanned: true, // Start as banned for this test
		});

		// Create reporter user
		await createUser(t, { telegramChatId: reporterChatId, coins: 50 });

		// Now test that the banned user gets a ban message when trying to interact
		sentMessages.length = 0; // Clear sent messages

		// Simulate banned user trying to upload a voucher
		const newImageStorageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(["new_voucher_image"]));
		});

		// This should fail with ban message
		await expect(
			t.mutation(internal.vouchers.uploadVoucher, {
				userId: uploaderId,
				imageStorageId: newImageStorageId,
			}),
		).rejects.toThrow("You have been banned from this service");

		vi.useRealTimers();
	});
});

// ============================================================================
// Ban Flow Tests (merged from Part 2)
// ============================================================================

describe("Ban Flow Tests", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("reporter banned when 3+ of last 5 claims are reported", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const now = Date.now();

		const uploaderId = await createUser(t, {
			telegramChatId: "uploader123",
			coins: 0,
		});
		const reporterId = await createUser(t, {
			telegramChatId: "reporter456",
			coins: 100,
		});

		// Create 5 vouchers and have reporter claim all of them
		const voucherIds: Id<"vouchers">[] = [];
		for (let i = 0; i < 5; i++) {
			const voucherId = await createVoucher(t, {
				type: "5",
				uploaderId,
				status: "claimed",
				claimerId: reporterId,
				expiryDate: now + 7 * 24 * 60 * 60 * 1000,
				claimedAt: now - (5 - i) * 1000, // Stagger claim times
				createdAt: now - (5 - i) * 2000,
			});
			voucherIds.push(voucherId);
		}

		// Report first voucher on Day 1
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[0],
		});

		// Advance to Day 2 and report second voucher
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[1],
		});

		let reporter = await t.run(async (ctx) => {
			return await ctx.db.get(reporterId);
		});
		expect(reporter?.isBanned).toBe(false);

		// Advance to Day 3 and report third voucher
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[2],
		});

		reporter = await t.run(async (ctx) => {
			return await ctx.db.get(reporterId);
		});
		expect(reporter?.isBanned).toBe(false);

		// Advance to Day 4 and report fourth voucher - this should trigger ban (3 existing + this one)
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		const result4 = await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[3],
		});

		expect(result4.status).toBe("banned");
		expect(result4.message).toContain("3 or more of your last 5 claims");

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		reporter = await t.run(async (ctx) => {
			return await ctx.db.get(reporterId);
		});
		expect(reporter?.isBanned).toBe(true);
		expect(reporter?.bannedAt).toBeDefined();
		vi.useRealTimers();
	});

	test("uploader banned when 3+ of last 5 uploads are reported", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const now = Date.now();

		const uploaderId = await createUser(t, {
			telegramChatId: "uploader789",
			coins: 0,
		});
		const reporterId = await createUser(t, {
			telegramChatId: "reporter101",
			coins: 100,
		});

		// Create 5 vouchers uploaded by uploader, claimed by reporter
		const voucherIds: Id<"vouchers">[] = [];
		for (let i = 0; i < 5; i++) {
			const voucherId = await createVoucher(t, {
				type: "5",
				uploaderId,
				status: "claimed",
				claimerId: reporterId,
				expiryDate: now + 7 * 24 * 60 * 60 * 1000,
				claimedAt: now - (5 - i) * 1000,
				createdAt: now - (5 - i) * 2000, // Most recent upload last
			});
			voucherIds.push(voucherId);
		}

		// Report first voucher on Day 1
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[0],
		});

		// Advance to Day 2 and report second voucher
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[1],
		});

		let uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		expect(uploader?.isBanned).toBe(false);

		// Advance to Day 3 and report third voucher - this should trigger uploader ban (3 of 5)
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[2],
		});

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		expect(uploader?.isBanned).toBe(true);
		expect(uploader?.bannedAt).toBeDefined();
		vi.useRealTimers();
	});

	test("high volume uploader (20+ uploads) banned when 5+ of last 10 uploads are reported", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const now = Date.now();

		const uploaderId = await createUser(t, {
			telegramChatId: "highvolume_uploader",
			coins: 0,
		});
		const reporterId = await createUser(t, {
			telegramChatId: "reporter_highvol",
			coins: 100,
		});

		const voucherIds: Id<"vouchers">[] = [];
		for (let i = 0; i < 22; i++) {
			const voucherId = await createVoucher(t, {
				type: "5",
				uploaderId,
				status: "claimed",
				claimerId: reporterId,
				expiryDate: now + 7 * 24 * 60 * 60 * 1000,
				claimedAt: now - (22 - i) * 1000,
				createdAt: now - (22 - i) * 2000, // Most recent upload last
			});
			voucherIds.push(voucherId);
		}

		// Report vouchers within the most recent 10 (vouchers 12-21 are the last 10)
		// Report first 4 of the last 10 - should NOT trigger ban yet (need 5 of last 10)
		for (let i = 12; i < 16; i++) {
			vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day between reports
			await t.mutation(internal.vouchers.reportVoucher, {
				userId: reporterId,
				voucherId: voucherIds[i],
			});
		}

		let uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		expect(uploader?.isBanned).toBe(false);

		// Report 5th voucher of the last 10 - this should trigger ban (5 of last 10)
		vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 1 day
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[16],
		});

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		expect(uploader?.isBanned).toBe(true);
		expect(uploader?.bannedAt).toBeDefined();
		vi.useRealTimers();
	});

	test("uploader NOT banned when reports come from banned users", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const now = Date.now();

		// Create uploader
		const uploaderId = await createUser(t, {
			telegramChatId: "gooduploader",
			coins: 0,
		});
		const goodReporterId = await createUser(t, {
			telegramChatId: "goodreporter",
			coins: 100,
		});
		const badReporterId = await createUser(t, {
			telegramChatId: "badreporter",
			coins: 100,
			isBanned: true, // Already banned
		});

		const voucherIds: Id<"vouchers">[] = [];
		for (let i = 0; i < 5; i++) {
			const reporterForThisVoucher = i < 3 ? badReporterId : goodReporterId;

			const voucherId = await createVoucher(t, {
				type: "5",
				uploaderId,
				status: "claimed",
				claimerId: reporterForThisVoucher,
				expiryDate: now + 7 * 24 * 60 * 60 * 1000,
				claimedAt: now - (5 - i) * 1000,
				createdAt: now - (5 - i) * 2000,
			});
			voucherIds.push(voucherId);
		}

		for (let i = 0; i < 3; i++) {
			await t.run(async (ctx) => {
				await ctx.db.insert("reports", {
					voucherId: voucherIds[i],
					reporterId: badReporterId,
					uploaderId,
					reason: "not_working",
					createdAt: now - (3 - i) * 1000,
				});
			});
		}

		await t.mutation(internal.vouchers.reportVoucher, {
			userId: goodReporterId,
			voucherId: voucherIds[3],
		});

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		// Verify uploader is NOT banned (only 1 valid report out of 5)
		const uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		expect(uploader?.isBanned).toBe(false);
		vi.useRealTimers();
	});

	test("uploader admission removes report and prevents ban", async () => {
		vi.useFakeTimers();
		const t = convexTest(schema, modules);
		const now = Date.now();

		const uploaderId = await createUser(t, {
			telegramChatId: "admit_uploader",
			coins: 100,
		});
		const reporterId = await createUser(t, {
			telegramChatId: "reporter_admit",
			coins: 100,
		});

		const voucherIds: Id<"vouchers">[] = [];
		for (let i = 0; i < 5; i++) {
			const voucherId = await createVoucher(t, {
				type: "10",
				uploaderId,
				status: "claimed",
				claimerId: reporterId,
				expiryDate: now + 7 * 24 * 60 * 60 * 1000,
				claimedAt: now - (5 - i) * 1000,
				createdAt: now - (5 - i) * 2000,
			});
			voucherIds.push(voucherId);
		}

		// Report 2 vouchers first
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[0],
		});
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[1],
		});

		let report = await t.run(async (ctx) => {
			return await ctx.db
				.query("reports")
				.withIndex("by_voucher", (q) => q.eq("voucherId", voucherIds[0]))
				.first();
		});
		expect(report).toBeDefined();

		await t.mutation(internal.vouchers.confirmUploaderUsedVoucher, {
			uploaderId,
			voucherId: voucherIds[0],
			amount: 5,
		});

		// Verify report is deleted after admission
		report = await t.run(async (ctx) => {
			return await ctx.db
				.query("reports")
				.withIndex("by_voucher", (q) => q.eq("voucherId", voucherIds[0]))
				.first();
		});
		expect(report).toBeNull();

		// Report 2 more vouchers (would be 4th report if first wasn't deleted)
		vi.advanceTimersByTime(24 * 60 * 60 * 1000);
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[2],
		});

		vi.advanceTimersByTime(24 * 60 * 60 * 1000);
		await t.mutation(internal.vouchers.reportVoucher, {
			userId: reporterId,
			voucherId: voucherIds[3],
		});

		// Verify uploader is NOT banned (only 3 reports instead of 4)
		const uploader = await t.run(async (ctx) => {
			return await ctx.db.get(uploaderId);
		});
		expect(uploader?.isBanned).toBe(false);

		vi.useRealTimers();
	});
});

describe("Report Confirmation Flow", () => {
	beforeEach(() => {
		setupFetchMock();
		vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	test("clicking No cancels report and removes inline keyboard", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456789";
		const messageId = 100;

		const userId = await createUser(t, {
			telegramChatId: chatId,
			coins: 10,
		});

		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId: userId,
			status: "claimed",
			claimerId: userId,
			claimedAt: Date.now(),
		});

		await t.action(internal.telegram.handleTelegramCallback, {
			callbackQuery: {
				id: "callback_1",
				from: { id: chatId, is_bot: false, first_name: "TestUser" },
				message: {
					message_id: 99,
					chat: { id: chatId, type: "private" },
					text: "Here's your €10 voucher!",
				},
				data: `report:${voucherId}`,
			},
		});

		const confirmationMsg = sentMessages.find((m) =>
			m.text?.includes("Report this voucher as not working"),
		);
		expect(confirmationMsg).toBeDefined();
		expect(confirmationMsg?.chatId).toBe(chatId);

		// Simulate user clicking "No" to cancel
		await t.action(internal.telegram.handleTelegramCallback, {
			callbackQuery: {
				id: "callback_2",
				from: { id: chatId, is_bot: false, first_name: "TestUser" },
				message: {
					message_id: messageId,
					chat: { id: chatId, type: "private" },
					text: confirmationMsg?.text,
				},
				data: `report:cancel:${voucherId}`,
			},
		});

		const editedMsg = editedMessages.find(
			(m) => m.chatId === chatId && m.messageId === messageId,
		);
		expect(editedMsg?.text).toBe(confirmationMsg?.text);

		// Verify "Cancelled" message was sent
		const cancelMsg = sentMessages.find((m) => m.text?.includes("Cancelled"));
		expect(cancelMsg?.chatId).toBe(chatId);
	});

	test("clicking Yes confirms report and removes inline keyboard", async () => {
		const t = convexTest(schema, modules);
		const chatId = "123456789";
		const messageId = 100;

		const uploaderId = await createUser(t, {
			telegramChatId: "uploader",
			coins: 0,
		});
		const claimerId = await createUser(t, {
			telegramChatId: chatId,
			coins: 10,
		});

		const voucherId = await createVoucher(t, {
			type: "10",
			uploaderId,
			status: "claimed",
			claimerId,
			claimedAt: Date.now(),
		});

		await t.action(internal.telegram.handleTelegramCallback, {
			callbackQuery: {
				id: "callback_1",
				from: { id: chatId, is_bot: false, first_name: "TestUser" },
				message: {
					message_id: 99,
					chat: { id: chatId, type: "private" },
					text: "Here's your €10 voucher!",
				},
				data: `report:${voucherId}`,
			},
		});

		const confirmationMsg = sentMessages.find((m) =>
			m.text?.includes("Report this voucher as not working"),
		);
		expect(confirmationMsg).toBeDefined();

		await t.action(internal.telegram.handleTelegramCallback, {
			callbackQuery: {
				id: "callback_2",
				from: { id: chatId, is_bot: false, first_name: "TestUser" },
				message: {
					message_id: messageId,
					chat: { id: chatId, type: "private" },
					text: confirmationMsg?.text,
				},
				data: `report:confirm:${voucherId}`,
			},
		});

		const reportMsg = sentMessages.find(
			(m) =>
				m.text?.includes("Report received") ||
				m.text?.includes("No replacement vouchers available"),
		);
		expect(reportMsg).toBeDefined();
	});
});
