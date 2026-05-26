import { api } from "@open-voucher/backend/convex/_generated/api";
import type { Id } from "@open-voucher/backend/convex/_generated/dataModel";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthBootstrap } from "./useAuthBootstrap";

export type AppUser = {
	_id: Id<"users">;
	telegramChatId: string;
	firstName: string | undefined;
	username: string | undefined;
	coins: number;
	isBanned: boolean;
};

export function useUserAuth() {
	const { isAuthenticated, isLoading: convexAuthLoading } = useConvexAuth();
	const bootstrap = useAuthBootstrap();

	const user = useQuery(
		api.users.getCurrentUser,
		isAuthenticated ? {} : "skip",
	);

	const isLoading =
		convexAuthLoading ||
		bootstrap.isLoading ||
		(isAuthenticated && user === undefined);

	return {
		user: (user ?? null) as AppUser | null,
		isLoading,
		error: bootstrap.error ?? null,
	};
}
