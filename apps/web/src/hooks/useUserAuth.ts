import { api } from "@open-voucher/backend/convex/_generated/api";
import type { Id } from "@open-voucher/backend/convex/_generated/dataModel";
import { useConvex } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { getDeployment } from "@/components/EnvironmentDropdown";

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
	return "user-session";
}

function getConvexHttpUrl(): string {
	const deployment = getDeployment();
	const urls: Record<string, string> = {
		dev: "https://fastidious-okapi-116.convex.cloud",
		prod: "https://whimsical-kudu-895.convex.cloud",
	};
	return urls[deployment] || urls.prod;
}

export function useUserAuth() {
	const convex = useConvex();
	const [user, setUser] = useState<UserSession | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function authenticate() {
			try {
				// 1. Check for stored session token
				const storedToken = localStorage.getItem(getTokenKey());
				if (storedToken) {
					const sessionUser = await convex.query(
						api.userApp.validateSession,
						{ sessionToken: storedToken },
					);
					if (sessionUser) {
						setUser({ ...sessionUser, sessionToken: storedToken });
						setIsLoading(false);
						return;
					}
					// Invalid/expired token — clear it
					localStorage.removeItem(getTokenKey());
				}

				// 2. Localhost dev mode
				if (
					typeof window !== "undefined" &&
					window.location.hostname === "localhost"
				) {
					const result = await convex.mutation(api.userApp.devAuth, {});
					localStorage.setItem(getTokenKey(), result.sessionToken);
					setUser({ ...result.user, sessionToken: result.sessionToken });
					setIsLoading(false);
					return;
				}

				// 3. Telegram WebApp initData
				const tg = (window as any).Telegram?.WebApp;
				if (tg?.initData) {
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
					setUser({ ...result.user, sessionToken: result.sessionToken });
					setIsLoading(false);
					return;
				}

				// No auth available
				setIsLoading(false);
			} catch (err) {
				setError(
					err instanceof Error
						? err.message
						: "Authentication failed",
				);
				setIsLoading(false);
			}
		}

		authenticate();
	}, [convex]);

	const logout = useCallback(async () => {
		const token = localStorage.getItem(getTokenKey());
		if (token) {
			try {
				await convex.mutation(api.userApp.logoutUser, {
					sessionToken: token,
				});
			} catch {
				// ignore
			}
		}
		localStorage.removeItem(getTokenKey());
		setUser(null);
	}, [convex]);

	return { user, isLoading, error, logout };
}
