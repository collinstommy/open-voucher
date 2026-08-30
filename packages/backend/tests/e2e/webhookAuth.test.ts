// Webhook entry point auth and malformed-payload behavior, over real HTTP.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type E2EEnv, releaseE2EEnv, useE2EEnv } from "./e2eTestEnv";

let env: E2EEnv;

beforeAll(async () => {
	env = await useE2EEnv();
}, 120_000);

afterAll(async () => {
	await releaseE2EEnv();
});

describe("POST /telegram/webhook auth", () => {
	test("missing secret header returns 403", async () => {
		const res = await env.postWebhook({ update_id: 1 }, null);
		expect(res.status).toBe(403);
	});

	test("wrong secret header returns 403", async () => {
		const res = await env.postWebhook(
			{ update_id: 2 },
			`${env.webhookSecret}-wrong`,
		);
		expect(res.status).toBe(403);
	});
});

describe("POST /telegram/webhook malformed payloads", () => {
	test("non-JSON body still returns 200 (webhook never fails)", async () => {
		const res = await fetch(`${env.siteUrl}/telegram/webhook`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-telegram-bot-api-secret-token": env.webhookSecret,
			},
			body: "not json at all",
		});
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("OK");
	});

	test("JSON without message or callback_query returns 200 and does nothing", async () => {
		env.fake.reset();
		const res = await env.postWebhook({ update_id: 3 });
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("OK");
		// No outbound traffic and (after a short beat) no late sends.
		await Bun.sleep(500);
		expect(env.fake.callsFor("sendMessage")).toHaveLength(0);
	});
});
