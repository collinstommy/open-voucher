import { api } from "@open-voucher/backend/convex/_generated/api";
import type { Id } from "@open-voucher/backend/convex/_generated/dataModel";
import { useConvex } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { getDeployment } from "@/components/EnvironmentDropdown";
import { CONVEX_SITE_URLS } from "@/lib/convexConfig";

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

async function authenticate(convex: ReturnType<typeof useConvex>): Promise<UserSession | null> {
	const storedToken = localStorage.getItem(getTokenKey());
	if (storedToken) {
		const sessionUser = await convex.query(
			api.auth.validateSession,
			{ sessionToken: storedToken },
		);
		if (sessionUser) {
			return { ...sessionUser, sessionToken: storedToken };
		}
		localStorage.removeItem(getTokenKey());
	}

	// dev override
	if (
		typeof window !== "undefined" &&
		window.location.hostname === "localhost"
	) {
		const result = await convex.mutation(api.auth.devAuth, {});
		localStorage.setItem(getTokenKey(), result.sessionToken);
		return { ...result.user, sessionToken: result.sessionToken };
	}

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
		return { ...result.user, sessionToken: result.sessionToken };
	}

	return null;
}

export function useUserAuth() {
	const convex = useConvex();

	const { data: user, isLoading, error } = useQuery({
		queryKey: ["userAuth", getDeployment()] as const,
		queryFn: () => authenticate(convex),
		staleTime: Infinity,
		retry: false,
	});

	return { user: user ?? null, isLoading, error };
}
