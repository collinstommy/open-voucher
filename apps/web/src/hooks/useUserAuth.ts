import { api } from "@open-voucher/backend/convex/_generated/api";
import type { Id } from "@open-voucher/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { getDeployment } from "@/components/EnvironmentDropdown";
import { CONVEX_SITE_URLS } from "@/lib/convexConfig";
import { useEffect, useState, useRef } from "react";

export interface UserSession {
	_id: Id<"users">;
	telegramChatId: string;
	firstName: string | undefined;
	username: string | undefined;
	coins: number;
	isBanned: boolean;
	sessionToken: string;
}

function getTokenKey(): string {
	return `user-session-${getDeployment()}`;
}

function getConvexHttpUrl(): string {
	const deployment = getDeployment();
	return CONVEX_SITE_URLS[deployment] || CONVEX_SITE_URLS.prod;
}

export function useUserAuth() {
	const [sessionToken, setSessionToken] = useState<string | null>(() => {
		if (typeof window === "undefined") return null;
		return localStorage.getItem(getTokenKey());
	});

	const [authError, setAuthError] = useState<Error | null>(null);
	const authRanRef = useRef(false);
	const storedToken = sessionToken;

	const validateSession = useQuery(
		api.auth.validateSession,
		storedToken ? { sessionToken: storedToken } : "skip",
	);

	const devAuth = useMutation(api.auth.devAuth);

	// One-time auth: only runs if no stored token and auth hasn't been attempted
	useEffect(() => {
		if (authRanRef.current || storedToken) return;
		authRanRef.current = true;

		async function authenticate() {
			if (
				typeof window !== "undefined" &&
				window.location.hostname === "localhost"
			) {
				try {
					const result = await devAuth({});
					localStorage.setItem(getTokenKey(), result.sessionToken);
					setSessionToken(result.sessionToken);
				} catch (e) {
					setAuthError(e instanceof Error ? e : new Error(String(e)));
				}
				return;
			}

			const tg = (window as any).Telegram?.WebApp;
			if (tg?.initData) {
				try {
					const response = await fetch(
						`${getConvexHttpUrl()}/api/telegram-auth`,
						{
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ initData: tg.initData }),
						},
					);
					const result = await response.json();
					if (!response.ok) {
						throw new Error(result.error || "Authentication failed");
					}
					localStorage.setItem(getTokenKey(), result.sessionToken);
					setSessionToken(result.sessionToken);
				} catch (e) {
					setAuthError(e instanceof Error ? e : new Error(String(e)));
				}
			}
		}

		authenticate();
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// If stored token is invalid, clear it and allow re-auth attempt
	useEffect(() => {
		if (storedToken && validateSession === null) {
			localStorage.removeItem(getTokenKey());
			authRanRef.current = false;
			setSessionToken(null);
		}
	}, [storedToken, validateSession]);

	const user: UserSession | null =
		storedToken && validateSession
			? { ...validateSession, sessionToken: storedToken }
			: null;

	// Loading: we have a token that's being validated, OR we have no token but auth hasn't run yet
	const isLoading =
		!!storedToken && validateSession === undefined ||
		(!storedToken && !authRanRef.current);

	return { user, isLoading, error: authError };
}
