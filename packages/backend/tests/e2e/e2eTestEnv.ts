// Shared E2E environment: starts the fake Bot API and the local Convex dev
// backend, wires TELEGRAM_API_BASE at the fake, and exposes helpers for
// webhook posts and devTest state assertions.
//
// The local backend must already be provisioned once (writes .env.local with a
// local: deployment). `bun test tests/e2e/` runs all files in one process, so
// the environment is a refcounted singleton: each test file acquires it in
// beforeAll and releases it in afterAll.

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import {
	type FakeBotApi,
	startFakeBotApi,
	TEST_IMAGE_BYTES,
} from "./fakeBotApi";

const BACKEND_DIR = join(import.meta.dir, "../..");
const CONVEX_BIN = join(BACKEND_DIR, "node_modules/.bin/convex");
const ENV_FILE = join(BACKEND_DIR, ".env.local");
const PID_FILE = join(import.meta.dir, ".backend.pid");

const BOT_TOKEN = "e2e-fake-bot-token";
const WEBHOOK_SECRET = "e2e-webhook-secret";

type DevUser = NonNullable<
	FunctionReturnType<typeof api.devTest.getUserByChatId>
>;
type DevVoucher = NonNullable<
	FunctionReturnType<typeof api.devTest.getVoucher>
>;
type SeedResult = FunctionReturnType<typeof api.devTest.seedVoucher>;

export interface E2EEnv {
	fake: FakeBotApi;
	/** Convex functions URL (ConvexHttpClient). */
	convexUrl: string;
	/** HTTP actions URL (webhook etc). */
	siteUrl: string;
	botToken: string;
	webhookSecret: string;
	client: ConvexHttpClient;
	postWebhook(update: unknown, secret?: string | null): Promise<Response>;
	seedVoucher(args?: {
		type?: "5" | "10" | "20";
		expiryInDays?: number;
	}): Promise<SeedResult>;
	getUserByChatId(chatId: string): Promise<DevUser | null>;
	getUser(userId: DevUser["_id"]): Promise<DevUser | null>;
	getVoucher(voucherId: DevVoucher["_id"]): Promise<DevVoucher | null>;
	getVouchersByUploader(uploaderId: DevUser["_id"]): Promise<Array<DevVoucher>>;
	getVouchersByClaimer(claimerId: DevUser["_id"]): Promise<Array<DevVoucher>>;
	getStorageUrl(
		storageId: DevVoucher["imageStorageId"],
	): Promise<string | null>;
}

function readEnvFile(): Record<string, string> {
	try {
		const text = readFileSync(ENV_FILE, "utf8");
		const out: Record<string, string> = {};
		for (const line of text.split("\n")) {
			const match = line.match(/^([A-Z_]+)=(.*)$/);
			if (match) out[match[1]] = match[2].trim();
		}
		return out;
	} catch {
		return {};
	}
}

function convexSync(args: string[], allowFailure = false): string {
	const result = Bun.spawnSync([CONVEX_BIN, ...args], {
		cwd: BACKEND_DIR,
		stdout: "pipe",
		stderr: "pipe",
	});
	if (result.exitCode !== 0 && !allowFailure) {
		throw new Error(
			`convex ${args.join(" ")} failed (${result.exitCode}): ${result.stderr.toString()}`,
		);
	}
	return result.stdout.toString();
}

// The `convex dev` CLI spawns the actual backend binary as a child, so killing
// the CLI alone orphans the backend and its port. Kill the whole process group,
// and reap orphans from crashed runs via the pidfile (matched against this
// worktree's storage path so other checkouts' backends are never touched).
function killProcessTree(pid: number) {
	try {
		process.kill(-pid, "SIGKILL");
	} catch {
		/* already gone */
	}
}

function reapStaleBackend() {
	if (!existsSync(PID_FILE)) return;
	const pid = Number(readFileSync(PID_FILE, "utf8").trim());
	rmSync(PID_FILE, { force: true });
	if (!pid || !Number.isFinite(pid)) return;
	try {
		process.kill(pid, 0);
	} catch {
		return; // not running
	}
	// Belt and braces: the backend binary identifies itself with this
	// worktree's storage path on its command line.
	Bun.spawnSync(["pkill", "-9", "-f", `${BACKEND_DIR}/.convex`]);
	killProcessTree(pid);
}

let current: Promise<E2EEnv> | null = null;
let refs = 0;
let backendChild: ChildProcess | null = null;

export async function useE2EEnv(): Promise<E2EEnv> {
	refs++;
	if (!current) current = start();
	return current;
}

export async function releaseE2EEnv(): Promise<void> {
	refs--;
	if (refs > 0 || !current) return;
	const env = await current.catch(() => null);
	current = null;
	if (backendChild?.pid) killProcessTree(backendChild.pid);
	backendChild = null;
	rmSync(PID_FILE, { force: true });
	if (env) await env.fake.stop();
}

async function start(): Promise<E2EEnv> {
	reapStaleBackend();
	const fake = await startFakeBotApi();

	// Long-running watch process; killed when the last test file releases the env.
	let stdout = "";
	const child: ChildProcess = spawn(
		CONVEX_BIN,
		["dev", "--typecheck", "disable", "--tail-logs", "disable"],
		{ cwd: BACKEND_DIR, stdio: ["ignore", "pipe", "pipe"], detached: true },
	);
	backendChild = child;
	writeFileSync(PID_FILE, String(child.pid));
	child.stdout?.on("data", (chunk: Buffer) => {
		stdout += chunk.toString();
		if (stdout.length > 20_000) stdout = stdout.slice(-10_000);
	});
	child.stderr?.on("data", (chunk: Buffer) => {
		stdout += chunk.toString();
		if (stdout.length > 20_000) stdout = stdout.slice(-10_000);
	});

	const waitReady = (async () => {
		const deadline = Date.now() + 120_000;
		while (Date.now() < deadline) {
			if (stdout.includes("Convex functions ready")) return;
			await Bun.sleep(200);
		}
		throw new Error(
			`Local dev backend did not become ready. Output:\n${stdout}`,
		);
	})();
	await waitReady;

	// Ports may have changed since provisioning; read them from the env file now.
	const envFile = readEnvFile();
	const convexUrl = envFile.CONVEX_URL;
	const siteUrl = envFile.CONVEX_SITE_URL;
	if (!convexUrl || !siteUrl) {
		throw new Error(
			`CONVEX_URL/CONVEX_SITE_URL missing from ${ENV_FILE}. Is the local deployment provisioned? Output:\n${stdout}`,
		);
	}

	// Function env vars for the local backend. The fake Bot API port changes per
	// run, so TELEGRAM_API_BASE is re-pointed every time.
	convexSync(["env", "set", "TELEGRAM_BOT_TOKEN", BOT_TOKEN]);
	convexSync(["env", "set", "TELEGRAM_WEBHOOK_SECRET", WEBHOOK_SECRET]);
	convexSync(["env", "set", "ENVIRONMENT", "development"]);
	convexSync(["env", "set", "TELEGRAM_API_BASE", fake.baseUrl]);
	// Make sure the dev OCR bypass is active (set OCR_BYPASS=1).
	convexSync(["env", "set", "OCR_BYPASS", "1"]);

	// HTTP actions endpoint health check (404 on unknown paths is fine).
	{
		const deadline = Date.now() + 60_000;
		let lastError: unknown = null;
		for (;;) {
			try {
				const res = await fetch(`${siteUrl}/telegram/webhook`, {
					method: "GET",
				});
				if (res.status < 500) break;
			} catch (error) {
				lastError = error;
			}
			if (Date.now() > deadline) {
				throw new Error(
					`HTTP actions at ${siteUrl} never became reachable: ${lastError}`,
				);
			}
			await Bun.sleep(200);
		}
	}

	const client = new ConvexHttpClient(convexUrl);

	const env: E2EEnv = {
		fake,
		convexUrl,
		siteUrl,
		botToken: BOT_TOKEN,
		webhookSecret: WEBHOOK_SECRET,
		client,
		async postWebhook(update, secret: string | null = WEBHOOK_SECRET) {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
			};
			if (secret) headers["x-telegram-bot-api-secret-token"] = secret;
			return await fetch(`${siteUrl}/telegram/webhook`, {
				method: "POST",
				headers,
				body: JSON.stringify(update),
			});
		},
		async seedVoucher(args) {
			const expiryInDays = args?.expiryInDays ?? 14;
			const expiryDate = Date.now() + expiryInDays * 24 * 60 * 60 * 1000;
			return await client.action(api.devTest.seedVoucher, {
				bytes: Array.from(TEST_IMAGE_BYTES),
				type: args?.type ?? "10",
				expiryDate,
			});
		},
		getUserByChatId: (chatId) =>
			client.query(api.devTest.getUserByChatId, { telegramChatId: chatId }),
		getUser: (userId) => client.query(api.devTest.getUser, { userId }),
		getVoucher: (voucherId) =>
			client.query(api.devTest.getVoucher, { voucherId }),
		getVouchersByUploader: (uploaderId) =>
			client.query(api.devTest.getVouchersByUploader, { uploaderId }),
		getVouchersByClaimer: (claimerId) =>
			client.query(api.devTest.getVouchersByClaimer, { claimerId }),
		getStorageUrl: (storageId) =>
			client.query(api.devTest.getStorageUrl, { storageId }),
	};

	return env;
}

process.on("exit", () => {
	// Safety net: if a test file forgot to release, still kill the backend child.
	if (backendChild?.pid) killProcessTree(backendChild.pid);
});
