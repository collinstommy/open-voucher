import { useCallback, useEffect, useState } from "react";

export interface UserSession {
	userId: string;
	telegramChatId: string;
	firstName: string;
	coins: number;
	isBanned: boolean;
	sessionToken: string;
}

function getTokenKey(): string {
	return "user-session-dev";
}

/**
 * Reads ?mode= from URL to simulate auth states during development.
 *
 * Modes:
 *   telegram   — pretends WebApp.initData is present (auto-authenticated)
 *   browser    — pretends we're in a regular browser with no token
 *   returning  — pretends a valid session token exists in localStorage
 *   (none)     — real auth flow (requires backend + Telegram Mini App)
 */
function getDevMode(): "telegram" | "browser" | "returning" | null {
	if (typeof window === "undefined") return null;
	const params = new URLSearchParams(window.location.search);
	const mode = params.get("mode");
	if (mode === "telegram" || mode === "browser" || mode === "returning") {
		return mode;
	}
	return null;
}

/** Mock user data returned when in dev mode. */
const MOCK_USER: Omit<UserSession, "sessionToken"> = {
	userId: "mock-user-1",
	telegramChatId: "123456789",
	firstName: "TestUser",
	coins: 25,
	isBanned: false,
};

/** Mock voucher data for the vouchers list. */
export interface MockVoucher {
	_id: string;
	type: "5" | "10" | "20";
	expiryDate: number;
	claimedAt: number;
	imageUrl: string;
}

export const MOCK_VOUCHERS: MockVoucher[] = [
	{
		_id: "v1",
		type: "10",
		expiryDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
		claimedAt: Date.now() - 2 * 60 * 60 * 1000,
		imageUrl: "",
	},
	{
		_id: "v2",
		type: "20",
		expiryDate: Date.now() + 3 * 24 * 60 * 60 * 1000,
		claimedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
		imageUrl: "",
	},
	{
		_id: "v3",
		type: "5",
		expiryDate: Date.now() + 14 * 24 * 60 * 60 * 1000,
		claimedAt: Date.now() - 5 * 60 * 60 * 1000,
		imageUrl: "",
	},
];

export function useUserAuth() {
	const [user, setUser] = useState<UserSession | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const devMode = getDevMode();

	useEffect(() => {
		// ---- DEV / MOCK MODE ----
		if (devMode) {
			if (devMode === "telegram") {
				// Pretend initData was verified, create a fresh session
				const token = `mock-session-${Date.now()}`;
				const session: UserSession = { ...MOCK_USER, sessionToken: token };
				localStorage.setItem(getTokenKey(), token);
				setUser(session);
				setIsLoading(false);
				return;
			}

			if (devMode === "returning") {
				// Pretend a valid token exists in localStorage
				const token = `mock-session-returning`;
				localStorage.setItem(getTokenKey(), token);
				const session: UserSession = { ...MOCK_USER, sessionToken: token };
				setUser(session);
				setIsLoading(false);
				return;
			}

			if (devMode === "browser") {
				// No WebApp, no token
				localStorage.removeItem(getTokenKey());
				setIsLoading(false);
				return;
			}
		}

		// ---- REAL AUTH FLOW ----
		// Check for stored session token first
		const storedToken = localStorage.getItem(getTokenKey());
		if (storedToken) {
			// TODO: call validateSession({ sessionToken: storedToken })
			// For now, no backend → fall through to error
			setError("Backend not available (no real auth yet)");
			setIsLoading(false);
			return;
		}

		// Check for Telegram WebApp initData
		if (
			typeof window !== "undefined" &&
			"Telegram" in window &&
			(window as any).Telegram?.WebApp?.initData
		) {
			// TODO: send initData to validateInitData
			// For now, no backend → fall through to error
			setError("Backend not available (no real auth yet)");
			setIsLoading(false);
			return;
		}

		// Neither token nor WebApp
		setIsLoading(false);
	}, [devMode]);

	const logout = useCallback(() => {
		localStorage.removeItem(getTokenKey());
		setUser(null);
	}, []);

	return { user, isLoading, error, logout, devMode };
}
