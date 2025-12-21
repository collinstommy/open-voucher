import { api } from "@open-router/backend/convex/_generated/api";
import { useConvex } from "convex/react";
import { useCallback, useEffect, useState } from "react";

const TOKEN_KEY = "admin-token";

export function useAdminAuth() {
	const convex = useConvex();
	const [token, setToken] = useState<string | null>(null);
	const [isValid, setIsValid] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const storedToken = localStorage.getItem(TOKEN_KEY);
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
					localStorage.removeItem(TOKEN_KEY);
				}
			})
			.catch(() => {
				localStorage.removeItem(TOKEN_KEY);
			})
			.finally(() => {
				setIsLoading(false);
			});
	}, [convex]);

	const login = useCallback(
		async (password: string) => {
			const result = await convex.mutation(api.admin.login, { password });
			localStorage.setItem(TOKEN_KEY, result.token);
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
		localStorage.removeItem(TOKEN_KEY);
		setToken(null);
		setIsValid(false);
	}, [convex, token]);

	return { token, isValid, isLoading, login, logout };
}
