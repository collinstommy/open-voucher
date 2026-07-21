import { api } from "@open-voucher/backend/convex/_generated/api";
import { useConvex } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { getDeployment } from "@/components/EnvironmentDropdown";

function getTokenKey(): string {
	return `admin-token-${getDeployment()}`;
}

export function useAdminAuth() {
	const convex = useConvex();
	const [token, setToken] = useState<string | null>(null);
	const [isValid, setIsValid] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const tokenKey = getTokenKey();
		const storedToken = localStorage.getItem(tokenKey);
		if (!storedToken) {
			setIsLoading(false);
			return;
		}

		convex
			.query(api.admin.checkSession, { token: storedToken })
			.then((session) => {
				if (session?.valid) {
					setToken(storedToken);
					setIsValid(true);
				} else {
					localStorage.removeItem(tokenKey);
				}
			})
			.catch(() => {
				localStorage.removeItem(tokenKey);
			})
			.finally(() => {
				setIsLoading(false);
			});
	}, [convex]);

	const login = useCallback(
		async (password: string) => {
			const result = await convex.mutation(api.admin.login, { password });
			localStorage.setItem(getTokenKey(), result.token);
			setToken(result.token);
			setIsValid(true);
			return result;
		},
		[convex],
	);

	const logout = useCallback(async () => {
		if (token) {
			await convex.mutation(api.admin.logout, { token });
		}
		localStorage.removeItem(getTokenKey());
		setToken(null);
		setIsValid(false);
	}, [convex, token]);

	return { token, isValid, isLoading, login, logout };
}
