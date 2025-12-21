import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-router/backend/convex/_generated/api";
import type { Id } from "@open-router/backend/convex/_generated/dataModel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useConvex } from "convex/react";

export const Route = createFileRoute("/admin/users")({
	component: UsersPage,
});

function UsersPage() {
	const { token } = useAdminAuth();
	const convex = useConvex();
	const queryClient = useQueryClient();

	const { data, isLoading, error } = useQuery(
		convexQuery(api.admin.getUsersWithStats, token ? { token } : "skip"),
	);

	const banMutation = useMutation({
		mutationFn: (userId: Id<"users">) =>
			convex.mutation(api.admin.banUser, { token: token!, userId }),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	const unbanMutation = useMutation({
		mutationFn: (userId: Id<"users">) =>
			convex.mutation(api.admin.unbanUser, { token: token!, userId }),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	if (isLoading) {
		return <div className="text-muted-foreground">Loading users...</div>;
	}

	if (error) {
		return <div className="text-red-500">Error loading users</div>;
	}

	const users = data?.users ?? [];

	return (
		<div>
			<h1 className="mb-6 text-xl font-semibold">Users ({users.length})</h1>
			<div className="overflow-x-auto">
				<table className="w-full border-collapse">
					<thead>
						<tr className="border-b text-left">
							<th className="pb-3 pr-4 font-medium">User</th>
							<th className="pb-3 pr-4 font-medium">Coins</th>
							<th className="pb-3 pr-4 font-medium">Uploaded</th>
							<th className="pb-3 pr-4 font-medium">Claimed</th>
							<th className="pb-3 font-medium">Actions</th>
						</tr>
					</thead>
					<tbody>
						{users.map((user) => (
							<tr key={user._id} className="border-b">
								<td className="py-3 pr-4">
									<div>
										<div className="font-medium">
											{user.username || user.firstName || "Unknown"}
										</div>
										<div className="text-muted-foreground text-xs">
											{user.telegramChatId}
										</div>
									</div>
								</td>
								<td className="py-3 pr-4">{user.coins}</td>
								<td className="py-3 pr-4">{user.uploadCount}</td>
								<td className="py-3 pr-4">{user.claimCount}</td>
								<td className="py-3">
									{user.isBanned ? (
										<Button
											variant="outline"
											size="sm"
											onClick={() => unbanMutation.mutate(user._id)}
											disabled={unbanMutation.isPending}
										>
											Unban
										</Button>
									) : (
										<Button
											variant="destructive"
											size="sm"
											onClick={() => banMutation.mutate(user._id)}
											disabled={banMutation.isPending}
										>
											Ban
										</Button>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
