import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-router/backend/convex/_generated/api";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export const Route = createFileRoute("/banned")({
	component: BannedUsers,
});

function BannedUsers() {
	const { token } = useAdminAuth();

	const { data: bannedUsers, isLoading } = useQuery(
		convexQuery(api.admin.getBannedUsers, token ? { token } : "skip"),
	);

	if (isLoading) {
		return <div>Loading...</div>;
	}

	if (!bannedUsers) {
		return <div>No data available</div>;
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Banned Users</h1>
					<p className="text-muted-foreground">
						Recently banned users and ban reasons
					</p>
				</div>
			</div>

			<div className="space-y-4">
				{bannedUsers.length === 0 ? (
					<div className="rounded-lg border p-8 text-center text-muted-foreground">
						No banned users
					</div>
				) : (
					bannedUsers.map((user) => (
						<div key={user._id} className="rounded-lg border p-6 space-y-3">
							<div className="flex items-start justify-between">
								<div>
									<h3 className="font-medium">
										<Link
											to="/users/$userId"
											params={{ userId: user._id }}
											className="hover:text-blue-600 hover:underline"
										>
											{user.firstName || user.username || "Unknown User"}
											{user.username && (
												<span className="text-muted-foreground ml-2">
													@{user.username}
												</span>
											)}
										</Link>
									</h3>
									<p className="text-sm text-muted-foreground">
										Chat ID: {user.telegramChatId}
									</p>
								</div>
								{user.bannedAt && (
									<div className="text-sm text-muted-foreground">
										Banned: {new Date(user.bannedAt).toLocaleString()}
									</div>
								)}
							</div>
						</div>
					))
				)}
			</div>
		</div>
	);
}
