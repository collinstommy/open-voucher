import { getDeployment } from "@/components/EnvironmentDropdown";
import { CONVEX_SITE_URLS } from "@/lib/convexConfig";

export function getJwtKey() {
	return `jwt-${getDeployment()}`;
}

export function readStoredJwt(): string | null {
	if (typeof window === "undefined") return null;
	return localStorage.getItem(getJwtKey());
}

export function writeStoredJwt(jwt: string) {
	localStorage.setItem(getJwtKey(), jwt);
}

export function clearStoredJwt() {
	localStorage.removeItem(getJwtKey());
}

function getSiteUrl() {
	return CONVEX_SITE_URLS[getDeployment()] ?? CONVEX_SITE_URLS.prod;
}

export function isJwtExpired(jwt: string): boolean {
	try {
		const payload = JSON.parse(atob(jwt.split(".")[1] ?? "")) as {
			exp?: number;
		};
		if (!payload.exp) return true;
		return payload.exp * 1000 < Date.now();
	} catch {
		return true;
	}
}

/** Fetch JWT from HTTP (Telegram or dev). Persists to localStorage. */
export async function fetchJwt(): Promise<string> {
	const existing = readStoredJwt();
	if (existing && !isJwtExpired(existing)) return existing;
	if (existing) clearStoredJwt();

	if (window.location.hostname === "localhost") {
		const res = await fetch(`${getSiteUrl()}/api/dev-auth`, { method: "POST" });
		const data = await res.json();
		if (!res.ok) throw new Error(data.error ?? "Dev auth failed");
		writeStoredJwt(data.jwt);
		return data.jwt;
	}

	const tg = (window as Window & { Telegram?: { WebApp?: { initData?: string } } })
		.Telegram?.WebApp;
	if (!tg?.initData) {
		throw new Error("Open this page in Telegram");
	}

	const res = await fetch(`${getSiteUrl()}/api/telegram-auth`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ initData: tg.initData }),
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? "Authentication failed");

	writeStoredJwt(data.jwt);
	return data.jwt;
}
