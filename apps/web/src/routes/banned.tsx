import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-voucher/backend/convex/_generated/api";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useConvex } from "convex/react";
import type { Id } from "@open-voucher/backend/convex/_generated/dataModel";

export const Route = createFileRoute("/banned")({
	component: BannedUsers,
});

function BannedUsers() {
	const { token } = useAdminAuth();
	const convex = useConvex();
	const queryClient = useQueryClient();

	const { data: bannedUsers, isLoading: bannedLoading } = useQuery(
		convexQuery(api.admin.getBannedUsers, token ? { token } : "skip"),
	);

	const { data: flaggedUsers, isLoading: flaggedLoading } = useQuery(
		convexQuery(api.admin.getFlaggedUsers, token ? { token } : "skip"),
	);

	const banMutation = useMutation({
		mutationFn: (userId: Id<"users">) =>
			convex.mutation(api.admin.banUser, { token: token!, userId }),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	const dismissMutation = useMutation({
		mutationFn: (userId: Id<"users">) =>
			convex.mutation(api.admin.dismissFlag, { token: token!, userId }),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	const unbanMutation = useMutation({
		mutationFn: (userId: Id<"users">) =>
			convex.mutation(api.admin.unbanUser, { token: token!, userId }),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	if (bannedLoading || flaggedLoading) {
		return <div>Loading...</div>;
	}

	return (
		<div className="space-y-10">
			{/* Flagged for Review */}
			<div className="space-y-6">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-bold">Flagged for Review</h1>
						<p className="text-muted-foreground">
							Users automatically flagged by the system. Review and either ban or
							dismiss.
						</p>
					</div>
				</div>

				<div className="space-y-4">
					{!flaggedUsers || flaggedUsers.length === 0 ? (
						<div className="rounded-lg border p-8 text-center text-muted-foreground">
							No users flagged for review
						</div>
					) : (
						flaggedUsers.map((user) => (
							<div
								key={user._id}
								className="rounded-lg border p-6 space-y-3"
							>
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
										<div className="mt-2 flex gap-4 text-sm text-muted-foreground">
											<span>Uploads: {user.uploadCount}</span>
											<span>Claims: {user.claimCount}</span>
											<span>
												Upload Reports: {user.uploadReportCount}
											</span>
											<span>
												Claim Reports: {user.claimReportCount}
											</span>
										</div>
									</div>
									<div className="text-sm text-muted-foreground">
										Flagged: {formatDateTime(user.flaggedForReviewAt!)}
									</div>
								</div>
								<div className="flex gap-2">
									<Button
										variant="destructive"
										size="sm"
										onClick={() => banMutation.mutate(user._id)}
										disabled={banMutation.isPending}
									>
										Ban User
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => dismissMutation.mutate(user._id)}
										disabled={dismissMutation.isPending}
									>
										Dismiss
									</Button>
								</div>
							</div>
						))
					)}
				</div>
			</div>

			{/* Banned Users */}
			<div className="space-y-6">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-2xl font-bold">Banned Users</h2>
						<p className="text-muted-foreground">
							Users who have been banned from the service
						</p>
					</div>
				</div>

				<div className="space-y-4">
					{!bannedUsers || bannedUsers.length === 0 ? (
						<div className="rounded-lg border p-8 text-center text-muted-foreground">
							No banned users
						</div>
					) : (
						bannedUsers.map((user) => (
							<div
								key={user._id}
								className="rounded-lg border p-6 space-y-3"
							>
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
											Banned: {formatDateTime(user.bannedAt)}
										</div>
									)}
								</div>
								<Button
									variant="outline"
									size="sm"
									onClick={() => unbanMutation.mutate(user._id)}
									disabled={unbanMutation.isPending}
								>
									Unban User
								</Button>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
}
