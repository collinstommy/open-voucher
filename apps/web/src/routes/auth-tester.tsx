// Stage-2 auth tester: temporary route that drives the real
// POST /api/google-auth on the DEV deployment with a real Google ID token,
// minted in-browser by Google Identity Services (no playground, no secret).
// Test instrument — park or delete once the stage-3 app absorbs the flow.
//
// Requirements for the GIS button to issue tokens:
// - GOOGLE_TEST_CLIENT_ID below must be a *Web application* OAuth client with
//   authorized JavaScript origin http://localhost:3001
// - Its client id must equal GOOGLE_ANDROID_CLIENT_ID on the deployment,
//   otherwise the server answers 401 wrong_audience (that 401 is itself a
//   useful negative test).

import { api } from "@open-voucher/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CONVEX_SITE_URLS } from "@/lib/convexConfig";

export const Route = createFileRoute("/auth-tester")({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Auth Tester - Open Vouchers" },
		],
	}),
	component: AuthTester,
});

// Keep in sync with GOOGLE_ANDROID_CLIENT_ID on the target deployment.
const GOOGLE_TEST_CLIENT_ID =
	"975332129644-ltsmsjl4bmconkph4oqj71cbdnehq1mq.apps.googleusercontent.com";
// The tester always runs against dev (the deployment stage 1 is live on).
const SITE_URL = CONVEX_SITE_URLS.dev;

interface GsiIdApi {
	initialize(config: {
		client_id: string;
		callback: (response: { credential: string }) => void;
	}): void;
	renderButton(el: HTMLElement, options: Record<string, unknown>): void;
	disableAutoSelect(): void;
}

declare global {
	interface Window {
		google?: { accounts?: { id?: GsiIdApi } };
	}
}

interface AuthUser {
	_id: string;
	telegramChatId: string | null;
	firstName?: string | null;
	username?: string | null;
	coins: number;
	isBanned: boolean;
}

interface LoginSuccess {
	user: AuthUser;
	jwt: string;
	created?: boolean;
	idempotent?: boolean;
	merged?: boolean;
	warning?: { coinsLost: number; activeVouchers: number };
}

type Screen = "sign-in" | "choice" | "logged-in";

interface LogEntry {
	id: number;
	label: string;
	status: number | null;
	body: string;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
	try {
		const payload = jwt.split(".")[1];
		if (!payload) return null;
		const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
		return JSON.parse(atob(padded)) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function AuthTester() {
	const [screen, setScreen] = useState<Screen>("sign-in");
	const [idToken, setIdToken] = useState<string>("");
	const [login, setLogin] = useState<LoginSuccess | null>(null);
	const [linkCode, setLinkCode] = useState("");
	const [busy, setBusy] = useState(false);
	const [log, setLog] = useState<LogEntry[]>([]);
	const [convexCheck, setConvexCheck] = useState<string | null>(null);
	const buttonRef = useRef<HTMLDivElement>(null);
	const logId = useRef(0);
	// Latest credential handler, so the one-time GIS effect can stay mounted
	// without re-initializing Google Identity Services on every render.
	const onCredentialRef = useRef<(credential: string) => void>(() => {});

	function appendLog(label: string, status: number | null, body: string) {
		logId.current += 1;
		setLog((entries) => [
			{ id: logId.current, label, status, body },
			...entries,
		]);
	}

	/** POST /api/google-auth and log the exchange. Returns parsed JSON or null. */
	async function callGoogleAuth(
		label: string,
		body: Record<string, unknown>,
	): Promise<Record<string, unknown> | null> {
		setBusy(true);
		try {
			const response = await fetch(`${SITE_URL}/api/google-auth`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const text = await response.text();
			appendLog(label, response.status, text || "(empty body)");
			try {
				return JSON.parse(text) as Record<string, unknown>;
			} catch {
				return null;
			}
		} catch (error) {
			appendLog(
				label,
				null,
				`network error: ${error instanceof Error ? error.message : String(error)}`,
			);
			return null;
		} finally {
			setBusy(false);
		}
	}

	function handleLoginSuccess(data: LoginSuccess) {
		setLogin(data);
		setScreen("logged-in");
	}

	/** Narrow the wire response to a login success (single boundary cast). */
	function asLoginSuccess(
		data: Record<string, unknown> | null,
	): LoginSuccess | null {
		if (
			!data ||
			typeof data.jwt !== "string" ||
			typeof data.user !== "object" ||
			data.user === null
		) {
			return null;
		}
		return data as unknown as LoginSuccess;
	}

	// Google Identity Services: load the script once, render the sign-in button.
	useEffect(() => {
		let cancelled = false;
		if (window.google?.accounts?.id) {
			renderButton();
			return;
		}
		const script = document.createElement("script");
		script.id = "gsi-client";
		script.src = "https://accounts.google.com/gsi/client";
		script.async = true;
		script.onload = () => {
			if (!cancelled) renderButton();
		};
		document.head.appendChild(script);

		function renderButton() {
			const gsi = window.google?.accounts?.id;
			if (!gsi || !buttonRef.current || cancelled) return;
			gsi.initialize({
				client_id: GOOGLE_TEST_CLIENT_ID,
				callback: (response) => {
					onCredentialRef.current(response.credential);
				},
			});
			gsi.renderButton(buttonRef.current, {
				theme: "filled_black",
				size: "large",
				text: "signin_with",
				width: 280,
			});
		}

		return () => {
			cancelled = true;
		};
	}, []);

	// Keep the ref current on every render.
	useEffect(() => {
		onCredentialRef.current = handleCredential;
	});

	async function handleCredential(credential: string) {
		setIdToken(credential);
		// Bare lookup: never creates anything (choice-screen contract).
		const data = await callGoogleAuth("lookup {idToken}", {
			idToken: credential,
		});
		if (data?.known === false) {
			setScreen("choice");
			return;
		}
		const success = asLoginSuccess(data);
		if (success) handleLoginSuccess(success);
	}

	async function createAccount() {
		const data = await callGoogleAuth("create {idToken, intent}", {
			idToken,
			intent: "create",
		});
		const success = asLoginSuccess(data);
		if (success) handleLoginSuccess(success);
	}

	async function redeemLinkCode() {
		const code = linkCode.trim().toUpperCase();
		if (!code) return;
		const data = await callGoogleAuth("redeem {idToken, linkCode}", {
			idToken,
			linkCode: code,
		});
		const success = asLoginSuccess(data);
		if (success) {
			setLinkCode("");
			handleLoginSuccess(success);
		}
	}

	// Prove the issued JWT authenticates against the real backend (customJwt
	// pipeline): setAuth + a userQuery, exactly like the app would.
	useEffect(() => {
		if (!login?.jwt) {
			setConvexCheck(null);
			return;
		}
		let cancelled = false;
		const client = new ConvexHttpClient(
			"https://fastidious-okapi-116.convex.cloud",
		);
		client.setAuth(login.jwt);
		client
			.query(api.users.getCurrentUser, {})
			.then((user) => {
				if (!cancelled) {
					setConvexCheck(
						`getCurrentUser OK: ${user._id} · ${user.coins} coins · chat ${user.telegramChatId ?? "none"}`,
					);
				}
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					setConvexCheck(
						`getCurrentUser FAILED: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [login?.jwt]);

	function reset() {
		window.google?.accounts?.id?.disableAutoSelect();
		setScreen("sign-in");
		setIdToken("");
		setLogin(null);
		setLinkCode("");
		setConvexCheck(null);
	}

	return (
		<div className="min-h-screen space-y-6 bg-zinc-950 p-6 font-mono text-sm text-zinc-100">
			<header className="space-y-1">
				<h1 className="font-bold text-lg">Auth tester · stage 2</h1>
				<p className="text-zinc-400">
					POST {SITE_URL}/api/google-auth — real endpoint, real Google token,
					raw responses below.
				</p>
			</header>

			{screen === "sign-in" && (
				<Card className="border-zinc-800 bg-zinc-900">
					<CardContent className="space-y-4 p-6">
						<p>
							Sign in with Google. First-time accounts land on the choice
							screen; known accounts go straight in.
						</p>
						<div ref={buttonRef} />
						<p className="text-xs text-zinc-500">
							Client id is hardcoded at the top of this file. It must be a
							Web-type OAuth client with authorized origin http://localhost:3001
							and must match GOOGLE_ANDROID_CLIENT_ID on dev, or the server
							answers 401 wrong_audience.
						</p>
					</CardContent>
				</Card>
			)}

			{screen === "choice" && (
				<Card className="border-zinc-800 bg-zinc-900">
					<CardContent className="space-y-4 p-6">
						<p className="text-zinc-400">
							{`Google account is new here. What do you want to do? (server returned {"known":false} and created nothing)`}
						</p>
						<div className="flex max-w-md flex-col gap-3">
							<Button
								onClick={() => void createAccount()}
								disabled={busy}
								className="w-full"
							>
								New here? Create an account and claim 10 coins
							</Button>
							<div className="space-y-2 rounded-md border border-zinc-800 p-3">
								<p>I use the Telegram bot. Link my account.</p>
								<div className="flex gap-2">
									<Input
										value={linkCode}
										onChange={(event) =>
											setLinkCode(event.target.value.toUpperCase())
										}
										placeholder="8-char code from /link"
										maxLength={8}
										className="border-zinc-800 bg-zinc-950 font-mono"
									/>
									<Button
										onClick={() => void redeemLinkCode()}
										disabled={busy || linkCode.trim().length === 0}
									>
										Link
									</Button>
								</div>
								<p className="text-xs text-zinc-500">
									Send /link in the dev Telegram bot to get a code. Valid 10
									minutes, single use, 5 wrong attempts kill it.
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{screen === "logged-in" && login && (
				<Card className="border-zinc-800 bg-zinc-900">
					<CardContent className="space-y-4 p-6">
						<p className="text-green-400">
							{login.created
								? "Account created."
								: login.merged
									? "Fork merged into your Telegram account."
									: login.idempotent
										? "Already linked to this account."
										: "Signed in."}
						</p>
						{login.warning && (
							<p className="text-amber-400">
								Warning: the duplicate account kept{" "}
								{login.warning.activeVouchers} active voucher(s) and{" "}
								{login.warning.coinsLost} coin(s) — these will not be carried
								over.
							</p>
						)}
						<div>
							<p className="mb-1 text-zinc-400">user</p>
							<pre className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 p-3">
								{JSON.stringify(login.user, null, 2)}
							</pre>
						</div>
						<div>
							<p className="mb-1 text-zinc-400">jwt payload</p>
							<pre className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 p-3">
								{JSON.stringify(decodeJwtPayload(login.jwt), null, 2)}
							</pre>
							<details className="mt-1">
								<summary className="cursor-pointer text-zinc-500">
									raw jwt
								</summary>
								<pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-zinc-800 bg-zinc-950 p-3">
									{login.jwt}
								</pre>
							</details>
						</div>
						{convexCheck && (
							<p
								className={
									convexCheck.startsWith("getCurrentUser OK")
										? "text-green-400"
										: "text-red-400"
								}
							>
								{convexCheck}
							</p>
						)}
						<Button variant="outline" onClick={reset}>
							Start over
						</Button>
					</CardContent>
				</Card>
			)}

			<section className="space-y-2">
				<h2 className="text-zinc-400">Response log (newest first)</h2>
				{log.length === 0 && <p className="text-zinc-600">No requests yet.</p>}
				{log.map((entry) => (
					<details
						key={entry.id}
						open
						className="rounded-md border border-zinc-800 bg-zinc-900"
					>
						<summary className="cursor-pointer px-3 py-2">
							<span
								className={
									entry.status === null
										? "text-red-400"
										: entry.status < 300
											? "text-green-400"
											: "text-amber-400"
								}
							>
								{entry.status ?? "ERR"}
							</span>{" "}
							{entry.label}
						</summary>
						<pre className="overflow-x-auto px-3 pb-3 text-zinc-300">
							{entry.body}
						</pre>
					</details>
				))}
			</section>
		</div>
	);
}
