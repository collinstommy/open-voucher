import {
	ConvexProviderWithAuth,
	type ConvexReactClient,
} from "convex/react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import { getJwtKey, readStoredJwt, clearStoredJwt, isJwtExpired } from "./jwtStorage";

type JwtAuthContextValue = {
	jwt: string | null;
	setJwt: (jwt: string | null) => void;
};

const JwtAuthContext = createContext<JwtAuthContextValue | null>(null);

export function useJwtAuth() {
	const ctx = useContext(JwtAuthContext);
	if (!ctx) throw new Error("useJwtAuth must be used within JwtAuthProvider");
	return ctx;
}

function useConvexAuthFromJwt() {
	const { jwt } = useJwtAuth();
	return useMemo(
		() => ({
			isLoading: false,
			isAuthenticated: !!jwt,
			fetchAccessToken: async () => jwt,
		}),
		[jwt],
	);
}

export function JwtAuthProvider({
	client,
	children,
}: {
	client: ConvexReactClient;
	children: ReactNode;
}) {
	const [jwt, setJwtState] = useState<string | null>(() => {
		const stored = readStoredJwt();
		if (stored && isJwtExpired(stored)) {
			clearStoredJwt();
			return null;
		}
		return stored;
	});

	const setJwt = useCallback((value: string | null) => {
		setJwtState(value);
		if (value) localStorage.setItem(getJwtKey(), value);
		else localStorage.removeItem(getJwtKey());
	}, []);

	useEffect(() => {
		const onStorage = (e: StorageEvent) => {
			if (e.key === getJwtKey()) setJwtState(e.newValue);
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, []);

	return (
		<JwtAuthContext.Provider value={{ jwt, setJwt }}>
			<ConvexProviderWithAuth client={client} useAuth={useConvexAuthFromJwt}>
				{children}
			</ConvexProviderWithAuth>
		</JwtAuthContext.Provider>
	);
}

export function useLogout() {
	const { setJwt } = useJwtAuth();
	return () => setJwt(null);
}
