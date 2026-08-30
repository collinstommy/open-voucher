// Happy-path journeys over real HTTP: webhook POSTs go in the real front door
// of the local dev backend, outbound sends are captured at the fake Bot API,
// and DB/storage state is read back through the devTest seam.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { reportData } from "../../src/telegram/router";
import { type E2EEnv, releaseE2EEnv, useE2EEnv } from "./e2eTestEnv";
import {
	callbackQuery,
	messagePhoto,
	messageText,
} from "./fixtures/telegramUpdates";

let env: E2EEnv;

beforeAll(async () => {
	env = await useE2EEnv();
}, 120_000);

afterAll(async () => {
	await releaseE2EEnv();
});

// Chat ids unique per run (the local backend DB persists between runs).
const CHAT_BASE = 700_000_000 + Math.floor(Math.random() * 90_000_000);
let chatCounter = 0;
function freshChatId(): number {
	return CHAT_BASE + ++chatCounter;
}

async function pollUntil<T>(
	fn: () => T | null | undefined | false,
	timeoutMs = 25_000,
	stepMs = 250,
): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const value = await fn();
		if (value) return value;
		if (Date.now() > deadline) {
			throw new Error(`pollUntil timed out after ${timeoutMs}ms`);
		}
		await Bun.sleep(stepMs);
	}
}

/** Grows a brand-new user through the real onboarding flow. */
async function growNewUser(chatId: number) {
	const startRes = await env.postWebhook(messageText(chatId, "/start"));
	expect(startRes.status).toBe(200);

	const user = await pollUntil(
		async () => await env.getUserByChatId(String(chatId)),
	);
	expect(user?.isBanned).toBe(false);

	// Finish the tutorial so the account can claim vouchers.
	const tutorialRes = await env.postWebhook(messageText(chatId, "10"));
	expect(tutorialRes.status).toBe(200);
	await env.fake.waitForCall(
		(call) =>
			call.kind === "api" &&
			call.method === "sendMessage" &&
			String(call.body?.chat_id) === String(chatId) &&
			String(call.body?.text ?? "").includes("You are now ready to go"),
	);
	return user;
}

async function mustGetUser(chatId: string) {
	const user = await env.getUserByChatId(chatId);
	if (!user) throw new Error(`User for chat ${chatId} not found in DB`);
	return user;
}

describe("E2E: Telegram bot happy paths", () => {
	test("new user journey: /start grows a user, welcome and tutorial sends recorded", async () => {
		const chatId = freshChatId();

		const res = await env.postWebhook(messageText(chatId, "/start"));
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("OK");

		await env.fake.waitForCall(
			(call) =>
				call.kind === "api" &&
				call.method === "sendMessage" &&
				String(call.body?.chat_id) === String(chatId) &&
				String(call.body?.text ?? "").includes("Welcome to Dunnes Voucher Bot"),
		);
		await env.fake.waitForCall(
			(call) =>
				call.kind === "api" &&
				call.method === "sendMessage" &&
				String(call.body?.chat_id) === String(chatId) &&
				String(call.body?.text ?? "").includes(
					"Let's show you how to use the bot",
				),
		);

		const user = await pollUntil(
			async () => await env.getUserByChatId(String(chatId)),
		);
		expect(user).not.toBeNull();
		expect(user?.coins).toBe(10); // SIGNUP_BONUS
	}, 45_000);

	test("upload journey: photo message stores asset and creates an available voucher", async () => {
		const chatId = freshChatId();
		await growNewUser(chatId);
		const user = await mustGetUser(String(chatId));

		const fileId = `e2e-photo-${chatId}`;
		const res = await env.postWebhook(messagePhoto(chatId, fileId));
		expect(res.status).toBe(200);

		// Bot API traffic: getFile for the file_id, then the file download.
		await env.fake.waitForCall(
			(call) =>
				call.kind === "api" &&
				call.method === "getFile" &&
				call.body?.file_id === fileId,
		);
		await env.fake.waitForCall((call) => call.kind === "file");

		// Real dev storage got the asset, and a voucher row references it.
		const voucher = await pollUntil(async () => {
			const vouchers = await env.getVouchersByUploader(user._id);
			return vouchers.find((v) => v.status === "available") ?? null;
		});
		expect(voucher?.type).toBe("10");
		expect(String(voucher?.barcodeNumber)).toStartWith("DEV-");
		if (!voucher) throw new Error("Available voucher never appeared");
		const storageUrl = await env.getStorageUrl(voucher.imageStorageId);
		expect(storageUrl).not.toBeNull();

		// OCR bypass completed and the user was rewarded.
		await env.fake.waitForCall(
			(call) =>
				call.kind === "api" &&
				call.method === "sendMessage" &&
				String(call.body?.chat_id) === String(chatId) &&
				String(call.body?.text ?? "").includes("Voucher Accepted"),
		);
		const rewarded = await pollUntil(
			async () => (await env.getUser(user._id))?.coins === 20,
		);
		expect(rewarded).toBe(true);
	}, 60_000);

	test("claim journey: seeded voucher is claimed, photo delivered, coins spent", async () => {
		const chatId = freshChatId();
		await growNewUser(chatId);
		const user = await mustGetUser(String(chatId));

		// +10 days so the seeded voucher expires sooner than any DEV- voucher
		// created by the upload journey (+14 days).
		const seeded = await env.seedVoucher({ type: "10", expiryInDays: 10 });

		const res = await env.postWebhook(messageText(chatId, "10"));
		expect(res.status).toBe(200);

		await env.fake.waitForCall(
			(call) =>
				call.kind === "api" &&
				call.method === "sendPhoto" &&
				String(call.body?.chat_id) === String(chatId) &&
				String(call.body?.caption ?? "").includes("Here is your €10 voucher"),
		);

		const voucher = await pollUntil(async () => {
			const fresh = await env.getVoucher(seeded.voucherId);
			return fresh?.status === "claimed" ? fresh : null;
		});
		expect(voucher?.claimerId).toBe(user?._id);

		const spent = await pollUntil(
			async () => (await env.getUser(user._id))?.coins === 0,
		);
		expect(spent).toBe(true);
	}, 60_000);

	test("report journey: claimer reports a voucher, uploader is notified, coins refund", async () => {
		// Uploader grows a user and uploads a voucher.
		const uploaderChat = freshChatId();
		await growNewUser(uploaderChat);
		const uploader = await mustGetUser(String(uploaderChat));
		await env.postWebhook(
			messagePhoto(uploaderChat, `e2e-photo-${uploaderChat}`),
		);
		await pollUntil(async () => {
			const vouchers = await env.getVouchersByUploader(uploader._id);
			return vouchers.find((v) => v.status === "available") ?? null;
		});

		// Claimer grows a user and claims the soonest-expiring type-10 voucher.
		const claimerChat = freshChatId();
		await growNewUser(claimerChat);
		const claimer = await mustGetUser(String(claimerChat));
		await env.postWebhook(messageText(claimerChat, "10"));

		const claimed = await pollUntil(async () => {
			const vouchers = await env.getVouchersByClaimer(claimer._id);
			return vouchers[0] ?? null;
		});
		if (!claimed) throw new Error("Claimer never claimed a voucher");
		const voucherId = claimed._id;
		const voucher = await env.getVoucher(voucherId);
		if (!voucher) throw new Error("Claimed voucher not found in DB");
		const voucherUploader = await env.getUser(voucher.uploaderId);
		const uploaderChatId = String(voucherUploader?.telegramChatId);

		// report_init: confirmation prompt with keyboard. Captured updates
		// show this callback arrives on the claimed voucher's photo message.
		await env.postWebhook(
			callbackQuery({
				chatId: claimerChat,
				messageId: 6001,
				data: reportData("report_init", String(voucherId)),
				isPhoto: true,
			}),
		);
		await env.fake.waitForCall(
			(call) => call.kind === "api" && call.method === "answerCallbackQuery",
		);
		await env.fake.waitForCall(
			(call) =>
				call.kind === "api" &&
				call.method === "sendMessage" &&
				String(call.body?.chat_id) === String(claimerChat) &&
				String(call.body?.text ?? "").includes(
					"Report this voucher as not working?",
				),
		);

		// report_confirm: report recorded, replacement question, uploader pinged.
		await env.postWebhook(
			callbackQuery({
				chatId: claimerChat,
				messageId: 6001,
				data: reportData("report_confirm", String(voucherId)),
			}),
		);
		await env.fake.waitForCall(
			(call) =>
				call.kind === "api" &&
				call.method === "editMessageText" &&
				String(call.body?.chat_id) === String(claimerChat),
		);
		await env.fake.waitForCall(
			(call) =>
				call.kind === "api" &&
				call.method === "sendMessage" &&
				String(call.body?.chat_id) === String(claimerChat) &&
				String(call.body?.text ?? "").includes("Report received"),
		);

		const reported = await pollUntil(async () => {
			const fresh = await env.getVoucher(voucherId);
			return fresh?.status === "reported" ? fresh : null;
		});
		expect(reported).not.toBeNull();

		// Uploader receives the report notice as a photo message.
		await env.fake.waitForCall(
			(call) =>
				call.kind === "api" &&
				call.method === "sendPhoto" &&
				String(call.body?.chat_id) === uploaderChatId &&
				String(call.body?.caption ?? "").includes(
					"Someone has reported one of your vouchers as not working",
				),
		);

		// Declining a replacement refunds the claimer's coins.
		await env.postWebhook(
			callbackQuery({
				chatId: claimerChat,
				messageId: 6001,
				data: reportData("report_replacement_no", String(voucherId)),
			}),
		);
		await env.fake.waitForCall(
			(call) =>
				call.kind === "api" &&
				call.method === "sendMessage" &&
				String(call.body?.chat_id) === String(claimerChat) &&
				String(call.body?.text ?? "").includes("coins have been refunded"),
		);
		const refunded = await pollUntil(
			async () => (await env.getUser(claimer._id))?.coins === 10,
		);
		expect(refunded).toBe(true);
	}, 90_000);
});
