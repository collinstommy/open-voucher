import { api } from "@open-voucher/backend/convex/_generated/api";
import type { Id } from "@open-voucher/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { getDeployment } from "@/components/EnvironmentDropdown";
import { CONVEX_SITE_URLS } from "@/lib/convexConfig";
import { useEffect, useState, useCallback, useRef } from "react";

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
	const [isInitializing, setIsInitializing] = useState(!sessionToken);
	const attemptedRef = useRef(false);

	const validateSession = useQuery(
		api.auth.validateSession,
		sessionToken ? { sessionToken } : "skip",
	);

	const devAuth = useMutation(api.auth.devAuth);

	const authenticate = useCallback(async () => {
		if (sessionToken || attemptedRef.current) return;
		attemptedRef.current = true;

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
			} finally {
				setIsInitializing(false);
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
			} finally {
				setIsInitializing(false);
			}
			return;
		}

		setIsInitializing(false);
	}, [sessionToken, devAuth]);

	useEffect(() => {
		authenticate();
	}, [authenticate]);

	// Clear invalid token reactively; then re-auth
	useEffect(() => {
		if (sessionToken && validateSession === null) {
			localStorage.removeItem(getTokenKey());
			attemptedRef.current = false;
			setSessionToken(null);
			setIsInitializing(true);
		}
	}, [sessionToken, validateSession]);

	// If we have a stored token and it validated, we're done initializing
	useEffect(() => {
		if (sessionToken && validateSession) {
			setIsInitializing(false);
		}
	}, [sessionToken, validateSession]);

	const user: UserSession | null =
		sessionToken && validateSession
			? { ...validateSession, sessionToken }
			: null;

	const isLoading =
		isInitializing || (!!sessionToken && validateSession === undefined);

	return { user, isLoading, error: authError };
}
