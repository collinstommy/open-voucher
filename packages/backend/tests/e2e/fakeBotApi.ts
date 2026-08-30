// In-memory fake Telegram Bot API server for E2E tests.
//
// Records every request (API methods and file downloads) and serves canned
// responses shaped like the real Bot API, so the bot's outbound traffic is
// capturable and assertable. Nothing persists and nothing reaches Telegram.

export interface RecordedCall {
	kind: "api" | "file";
	token: string | null;
	/** Bot API method ("sendMessage", "getFile", ...) or, for file downloads, the file path. */
	method: string;
	url: string;
	/** Parsed JSON body or form fields. File uploads are recorded as metadata objects. */
	body: Record<string, unknown> | null;
	contentType: string | null;
	timestamp: number;
}

export interface FakeBotApi {
	port: number;
	baseUrl: string;
	calls: ReadonlyArray<RecordedCall>;
	callsFor(method: string): RecordedCall[];
	/** Polls recorded calls until one matches, then returns it. Throws on timeout. */
	waitForCall(
		match: (call: RecordedCall) => boolean,
		timeoutMs?: number,
	): Promise<RecordedCall>;
	reset(): void;
	stop(): Promise<void>;
}

// 1x1 white JPEG, valid enough for the bot's fetch -> blob -> FormData path.
const DEFAULT_IMAGE_BASE64 =
	"/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";

export const TEST_IMAGE_BYTES = Uint8Array.from(
	atob(DEFAULT_IMAGE_BASE64),
	(c) => c.charCodeAt(0),
);

export async function startFakeBotApi(): Promise<FakeBotApi> {
	const calls: RecordedCall[] = [];
	const imageBytes = TEST_IMAGE_BYTES;
	let messageIdCounter = 1000;
	let filePathCounter = 0;

	function apiResponseFor(
		method: string,
		body: Record<string, unknown> | null,
	): Record<string, unknown> {
		switch (method) {
			case "getMe":
				return {
					ok: true,
					result: {
						id: 42,
						is_bot: true,
						first_name: "Fake Bot",
						username: "fake_test_bot",
					},
				};
			case "getFile":
				return {
					ok: true,
					result: {
						file_id: body?.file_id ?? "unknown-file-id",
						file_unique_id: `uniq-${++filePathCounter}`,
						file_size: imageBytes.length,
						file_path: `photos/test-${filePathCounter}.jpg`,
					},
				};
			case "sendMessage":
			case "sendPhoto":
				return {
					ok: true,
					result: {
						message_id: ++messageIdCounter,
						chat: { id: Number(body?.chat_id ?? 0), type: "private" },
						date: Math.floor(Date.now() / 1000),
						...(method === "sendPhoto" ? { photo: [{}] } : {}),
					},
				};
			default:
				return { ok: true, result: true };
		}
	}

	async function parseBody(req: Request): Promise<{
		body: Record<string, unknown> | null;
		contentType: string | null;
	}> {
		const contentType = req.headers.get("content-type");
		if (!contentType) return { body: null, contentType };
		if (contentType.includes("application/json")) {
			return {
				body: (await req.json()) as Record<string, unknown>,
				contentType,
			};
		}
		if (contentType.includes("multipart/form-data")) {
			const form = await req.formData();
			const fields: Record<string, unknown> = {};
			for (const [key, value] of form.entries()) {
				fields[key] =
					value instanceof File
						? {
								__file: true,
								filename: value.name,
								type: value.type,
								size: value.size,
							}
						: value;
			}
			return { body: fields, contentType };
		}
		return { body: null, contentType };
	}

	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(req) {
			const url = new URL(req.url);
			const path = url.pathname;

			if (path === "/__calls") {
				return Response.json(calls);
			}
			if (path === "/__image") {
				return new Response(imageBytes, {
					headers: { "Content-Type": "image/jpeg" },
				});
			}

			const botMatch = path.match(/^\/bot([^/]+)\/(.+)$/);
			if (botMatch && (req.method === "POST" || req.method === "GET")) {
				const { body, contentType } = await parseBody(req);
				const method = botMatch[2];
				// GET API calls (e.g. getFile) carry arguments as query params.
				const fullBody =
					body ?? Object.fromEntries(url.searchParams.entries()) ?? null;
				calls.push({
					kind: "api",
					token: decodeURIComponent(botMatch[1]),
					method,
					url: req.url,
					body: fullBody,
					contentType,
					timestamp: Date.now(),
				});
				return Response.json(apiResponseFor(method, fullBody));
			}

			const fileMatch = path.match(/^\/file\/bot([^/]+)\/(.+)$/);
			if (fileMatch && req.method === "GET") {
				calls.push({
					kind: "file",
					token: decodeURIComponent(fileMatch[1]),
					method: fileMatch[2],
					url: req.url,
					body: null,
					contentType: null,
					timestamp: Date.now(),
				});
				return new Response(imageBytes, {
					headers: { "Content-Type": "image/jpeg" },
				});
			}

			return Response.json(
				{ ok: false, description: "Not Found" },
				{ status: 404 },
			);
		},
	});

	async function waitForCall(
		match: (call: RecordedCall) => boolean,
		timeoutMs = 15000,
	): Promise<RecordedCall> {
		const deadline = Date.now() + timeoutMs;
		for (;;) {
			const found = calls.find(match);
			if (found) return found;
			if (Date.now() > deadline) {
				throw new Error(
					`Timed out after ${timeoutMs}ms waiting for a call matching the predicate. Recorded methods: ${calls.map((c) => (c.kind === "api" ? c.method : `file:${c.method}`)).join(", ") || "(none)"}`,
				);
			}
			await Bun.sleep(50);
		}
	}

	return {
		port: server.port ?? 0,
		baseUrl: `http://127.0.0.1:${server.port ?? 0}`,
		calls,
		callsFor: (method: string) =>
			calls.filter((c) => c.kind === "api" && c.method === method),
		waitForCall,
		reset: () => calls.splice(0, calls.length),
		stop: async () => server.stop(true),
	};
}
