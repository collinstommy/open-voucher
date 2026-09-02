// Auth E2E on the stage-0 harness: POST /api/google-auth runs over real HTTP
// against the local dev backend. Google ID tokens are locally signed (jose)
// and verified by the production code path through the fake server's JWKS
// endpoint (GOOGLE_JWKS_URL). Granular conflict-matrix/cap/expiry coverage
// lives at unit layer (tests/convexTest); here we prove the HTTP mapping,
// the bot /link round trip, the fork merge, and the rate limit.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Id } from "../../convex/_generated/dataModel";
import { SIGNUP_BONUS } from "../../src/lib/constants";
import { GOOGLE_AUTH_RATE_LIMIT } from "../../src/lib/rateLimit";
import { type E2EEnv, releaseE2EEnv, useE2EEnv } from "./e2eTestEnv";
import { messageText } from "./fixtures/telegramUpdates";

let env: E2EEnv;

beforeAll(async () => {
	env = await useE2EEnv();
}, 120_000);

afterAll(async () => {
	await releaseE2EEnv();
});

// Chat ids, google subs, and emails unique per run (the local backend DB
// persists between runs).
const CHAT_BASE = 790_000_000 + Math.floor(Math.random() * 90_000);
const SUB_BASE = `e2e-google-${Date.now()}`;
let chatCounter = 0;
let subCounter = 0;
function freshChatId(): number {
	return CHAT_BASE + ++chatCounter;
}
function freshGoogleSub(): string {
	return `${SUB_BASE}-${++subCounter}`;
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

/** Grows a Telegram user through /start and the tutorial (like the real flow). */
async function growTelegramUser(chatId: number) {
	const res = await env.postWebhook(messageText(chatId, "/start"));
	expect(res.status).toBe(200);
	let user = await pollUntil(
		async () => await env.getUserByChatId(String(chatId)),
	);
	if (!user) throw new Error(`User for chat ${chatId} not found in DB`);
	expect(user.coins).toBe(SIGNUP_BONUS);

	// Finish the tutorial: /start leaves the user in onboarding state, which
	// would swallow subsequent commands like /link.
	const tutorialRes = await env.postWebhook(messageText(chatId, "10"));
	expect(tutorialRes.status).toBe(200);
	await env.fake.waitForCall(
		(call) =>
			call.kind === "api" &&
			call.method === "sendMessage" &&
			String(call.body?.chat_id) === String(chatId) &&
			String(call.body?.text ?? "").includes("You are now ready to go"),
	);
	user = await pollUntil(async () => {
		const refreshed = await env.getUserByChatId(String(chatId));
		return refreshed && refreshed.telegramState === undefined ? refreshed : null;
	});
	if (!user) throw new Error(`Tutorial never cleared for chat ${chatId}`);
	return user;
}

/** Extracts the 8-char code from the bot's /link reply, captured at the fake API. */
async function issueLinkCode(chatId: number): Promise<string> {
	const res = await env.postWebhook(messageText(chatId, "/link"));
	expect(res.status).toBe(200);
	const call = await env.fake.waitForCall(
		(call) =>
			call.kind === "api" &&
			call.method === "sendMessage" &&
			String(call.body?.chat_id) === String(chatId) &&
			String(call.body?.text ?? "").includes("Link the Open Vouchers app"),
	);
	const match = String(call.body?.text ?? "").match(
		/<code>([2-9A-HJKMNP-TV-Z]{8})<\/code>/,
	);
	if (!match) {
		throw new Error(`No link code in bot reply: ${call.body?.text}`);
	}
	return match[1];
}

describe("E2E: POST /api/google-auth", () => {
	test("bare lookup of an unknown sub returns known:false and creates nothing", async () => {
		const sub = freshGoogleSub();
		const res = await env.postGoogleAuth({
			idToken: await env.signGoogleIdToken({
				sub,
				email: `${sub}@example.com`,
			}),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ known: false });
		expect(await env.getAuthIdentity(sub)).toBeNull();
	}, 45_000);

	test("intent:create creates a 10-coin chatless user and a verifiable session JWT", async () => {
		const sub = freshGoogleSub();
		const res = await env.postGoogleAuth({
			idToken: await env.signGoogleIdToken({
				sub,
				email: `${sub}@example.com`,
				name: "E2E Google User",
			}),
			intent: "create",
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			user: {
				_id: string;
				coins: number;
				telegramChatId: string | null;
				isBanned: boolean;
			};
			jwt: string;
			created: boolean;
		};
		expect(body.created).toBe(true);
		expect(body.user.coins).toBe(SIGNUP_BONUS);
		expect(body.user.telegramChatId).toBeNull();
		expect(body.user.isBanned).toBe(false);

		// Session JWT: real signature check against the E2E key, sub = user id.
		const payload = await env.verifyIssuedJwt(body.jwt);
		expect(payload.sub).toBe(body.user._id);

		const identity = await env.getAuthIdentity(sub);
		expect(String(identity?.userId)).toBe(body.user._id);
		expect(identity?.email).toBe(`${sub}@example.com`);
	}, 45_000);

	test("re-login without intent returns the same user", async () => {
		const sub = freshGoogleSub();
		const created = await env.postGoogleAuth({
			idToken: await env.signGoogleIdToken({ sub }),
			intent: "create",
		});
		expect(created.status).toBe(200);
		const createdBody = (await created.json()) as { user: { _id: string } };

		const again = await env.postGoogleAuth({
			idToken: await env.signGoogleIdToken({ sub }),
		});
		expect(again.status).toBe(200);
		const againBody = (await again.json()) as {
			user: { _id: string };
			created: boolean;
		};
		expect(againBody.created).toBe(false);
		expect(againBody.user._id).toBe(createdBody.user._id);
	}, 45_000);

	test("/link issues a code that redeems a google account into the telegram account", async () => {
		const chatId = freshChatId();
		const telegramUser = await growTelegramUser(chatId);
		const code = await issueLinkCode(chatId);

		const sub = freshGoogleSub();
		const res = await env.postGoogleAuth({
			idToken: await env.signGoogleIdToken({
				sub,
				email: `${sub}@example.com`,
			}),
			linkCode: code,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			user: { _id: string };
			jwt: string;
			created: boolean;
			merged?: boolean;
		};
		expect(body.created).toBe(false);
		expect(body.merged).toBeUndefined();
		expect(body.user._id).toBe(String(telegramUser._id));

		const payload = await env.verifyIssuedJwt(body.jwt);
		expect(payload.sub).toBe(String(telegramUser._id));
		const identity = await env.getAuthIdentity(sub);
		expect(identity?.userId).toBe(telegramUser?._id);

		// Next login needs no code: the sub now resolves to the same user.
		const relogin = await env.postGoogleAuth({
			idToken: await env.signGoogleIdToken({ sub }),
		});
		expect(relogin.status).toBe(200);
		const reloginBody = (await relogin.json()) as { user: { _id: string } };
		expect(reloginBody.user._id).toBe(telegramUser?._id);
	}, 45_000);

	test("fork merge: a chatless google-only account is absorbed with a clawback", async () => {
		const chatId = freshChatId();
		const telegramUser = await growTelegramUser(chatId);

		// The user forked themselves: signed in and chose "new account".
		const forkSub = freshGoogleSub();
		const forkRes = await env.postGoogleAuth({
			idToken: await env.signGoogleIdToken({ sub: forkSub }),
			intent: "create",
		});
		expect(forkRes.status).toBe(200);
		// The wire id is a string; brand it once for the typed devTest calls.
		const forkBody = (await forkRes.json()) as { user: { _id: Id<"users"> } };
		const strayId = forkBody.user._id;
		expect((await env.getUser(strayId))?.coins).toBe(SIGNUP_BONUS);

		// Recovery: /link code proves Telegram ownership; the stray is absorbed.
		const code = await issueLinkCode(chatId);
		const res = await env.postGoogleAuth({
			idToken: await env.signGoogleIdToken({ sub: forkSub }),
			linkCode: code,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			user: { _id: string };
			merged: boolean;
			warning?: unknown;
		};
		expect(body.merged).toBe(true);
		expect(body.user._id).toBe(String(telegramUser._id));
		// The stray held only the untouched bonus: nothing to warn about.
		expect(body.warning).toBeUndefined();

		// Signup bonus clawed back from the stray; identity repointed.
		const stray = await pollUntil(async () => {
			const user = await env.getUser(strayId);
			return user && user.coins === 0 ? user : null;
		});
		expect(stray?._id).toBe(strayId);
		const identity = await env.getAuthIdentity(forkSub);
		expect(String(identity?.userId)).toBe(String(telegramUser._id));

		// The forked sub now logs in as the telegram user.
		const relogin = await env.postGoogleAuth({
			idToken: await env.signGoogleIdToken({ sub: forkSub }),
		});
		const reloginBody = (await relogin.json()) as { user: { _id: string } };
		expect(reloginBody.user._id).toBe(telegramUser?._id);
	}, 45_000);

	test("a google sub linked to another telegram user conflicts with 409; code stays usable", async () => {
		const sub = freshGoogleSub();

		const chatA = freshChatId();
		const userA = await growTelegramUser(chatA);
		const codeA = await issueLinkCode(chatA);
		expect(userA.coins).toBe(SIGNUP_BONUS);
		const linkA = await env.postGoogleAuth({
			idToken: await env.signGoogleIdToken({ sub }),
			linkCode: codeA,
		});
		expect(linkA.status).toBe(200);

		// Same sub, code from a different telegram user -> 409.
		const chatB = freshChatId();
		await growTelegramUser(chatB);
		const codeB = await issueLinkCode(chatB);
		const conflict = await env.postGoogleAuth({
			idToken: await env.signGoogleIdToken({ sub }),
			linkCode: codeB,
		});
		expect(conflict.status).toBe(409);
		expect(await conflict.json()).toEqual({
			error: "google_linked_to_other_user",
		});

		// codeB was not consumed: a different sub redeems it successfully.
		const otherSub = freshGoogleSub();
		const retry = await env.postGoogleAuth({
			idToken: await env.signGoogleIdToken({ sub: otherSub }),
			linkCode: codeB,
		});
		expect(retry.status).toBe(200);
		const retryBody = (await retry.json()) as { user: { _id: string } };
		const userB = await env.getUserByChatId(String(chatB));
		if (!userB) throw new Error(`User for chat ${chatB} not found in DB`);
		expect(retryBody.user._id).toBe(String(userB._id));
	}, 45_000);

	test("invalid and wrong-audience google tokens are rejected with 401", async () => {
		const bad = await env.postGoogleAuth({ idToken: "not-a-jwt" });
		expect(bad.status).toBe(401);
		expect(await bad.json()).toEqual({ error: "invalid_token" });

		const wrongAud = await env.postGoogleAuth({
			idToken: await env.signGoogleIdToken({
				sub: freshGoogleSub(),
				aud: "some-other-app.apps.googleusercontent.com",
			}),
		});
		expect(wrongAud.status).toBe(401);
		expect(await wrongAud.json()).toEqual({ error: "wrong_audience" });
	}, 45_000);

	test("dead link codes return 400", async () => {
		const res = await env.postGoogleAuth({
			idToken: await env.signGoogleIdToken({ sub: freshGoogleSub() }),
			linkCode: "ZZZZZZZZ",
		});
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "code_invalid_or_expired" });
	}, 45_000);

	test("rate limit: 429 after the per-sub threshold", async () => {
		const sub = freshGoogleSub();
		const idToken = await env.signGoogleIdToken({ sub });

		for (let i = 0; i < GOOGLE_AUTH_RATE_LIMIT; i++) {
			const res = await env.postGoogleAuth({ idToken });
			expect(res.status).toBe(200);
		}

		const limited = await env.postGoogleAuth({ idToken });
		expect(limited.status).toBe(429);
		const body = (await limited.json()) as { error: string };
		expect(body.error).toBe("rate_limited");
		expect(limited.headers.get("Retry-After")).not.toBeNull();

		// A different sub still has its own budget.
		const otherSub = freshGoogleSub();
		const other = await env.postGoogleAuth({
			idToken: await env.signGoogleIdToken({ sub: otherSub }),
		});
		expect(other.status).toBe(200);
	}, 60_000);
});
