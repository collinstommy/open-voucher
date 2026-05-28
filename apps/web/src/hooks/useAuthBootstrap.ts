import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchJwt } from "@/auth/jwtStorage";
import { useJwtAuth } from "@/auth/JwtAuthProvider";
import { getDeployment } from "@/components/EnvironmentDropdown";

export function useAuthBootstrap() {
	const { jwt, setJwt } = useJwtAuth();

	const bootstrap = useQuery({
		queryKey: ["auth", "bootstrap", getDeployment()] as const,
		queryFn: fetchJwt,
		enabled: !jwt,
		retry: false,
		staleTime: Infinity,
	});

	useEffect(() => {
		if (bootstrap.data) setJwt(bootstrap.data);
	}, [bootstrap.data, setJwt]);

	return bootstrap;
}
