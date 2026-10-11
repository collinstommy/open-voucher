import { useEffect, useRef, useState } from "react";
import { getDeployment } from "@/components/EnvironmentDropdown";
import { Button } from "@/components/ui/button";
import { CONVEX_SITE_URLS } from "@/lib/convexConfig";

// Must equal GOOGLE_ANDROID_CLIENT_ID on the target deployment, or the server rejects the token audience.
const GOOGLE_WEB_CLIENT_ID =
	"975332129644-ltsmsjl4bmconkph4oqj71cbdnehq1mq.apps.googleusercontent.com";

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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function GoogleSignInButton({
	onSignedIn,
}: {
	onSignedIn: (jwt: string) => void;
}) {
	const buttonRef = useRef<HTMLDivElement>(null);
	const onSignedInRef = useRef(onSignedIn);
	const handleCredentialRef = useRef<(credential: string) => void>(() => {});

	const [idToken, setIdToken] = useState<string | null>(null);
	const [unknownAccount, setUnknownAccount] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function callGoogleAuth(body: { idToken: string; intent?: "create" }) {
		setBusy(true);
		setError(null);
		try {
			const res = await fetch(
				`${CONVEX_SITE_URLS[getDeployment()]}/api/google-auth`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-OpenVoucher-Client": "web",
					},
					body: JSON.stringify(body),
				},
			);
			const data: unknown = await res.json().catch(() => null);
			if (!isRecord(data)) {
				setError(`Sign-in failed (${res.status})`);
				return;
			}
			if (!res.ok) {
				setError(
					typeof data.error === "string"
						? data.error
						: `Sign-in failed (${res.status})`,
				);
				return;
			}
			if (typeof data.jwt === "string") {
				onSignedInRef.current(data.jwt);
				return;
			}
			if (data.known === false) {
				setUnknownAccount(true);
				return;
			}
			setError("Unexpected response from /api/google-auth");
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	}

	function handleCredential(credential: string) {
		setIdToken(credential);
		setUnknownAccount(false);
		void callGoogleAuth({ idToken: credential });
	}

	useEffect(() => {
		onSignedInRef.current = onSignedIn;
	});

	useEffect(() => {
		handleCredentialRef.current = handleCredential;
	});

	useEffect(() => {
		let cancelled = false;

		function renderButton() {
			const gsi = window.google?.accounts?.id;
			if (!gsi || !buttonRef.current || cancelled) return;
			gsi.initialize({
				client_id: GOOGLE_WEB_CLIENT_ID,
				callback: (response) =>
					handleCredentialRef.current(response.credential),
			});
			gsi.renderButton(buttonRef.current, {
				theme: "filled_black",
				size: "large",
				text: "signin_with",
				width: 280,
			});
		}

		if (window.google?.accounts?.id) {
			renderButton();
		} else {
			const script = document.createElement("script");
			script.src = "https://accounts.google.com/gsi/client";
			script.async = true;
			script.onload = renderButton;
			document.head.appendChild(script);
		}

		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<div className="space-y-3">
			<div ref={buttonRef} />
			{unknownAccount && idToken && (
				<Button
					type="button"
					variant="outline"
					disabled={busy}
					onClick={() => void callGoogleAuth({ idToken, intent: "create" })}
				>
					{busy ? "Creating…" : "Create account with this Google login"}
				</Button>
			)}
			{error && <p className="text-red-400">{error}</p>}
		</div>
	);
}
