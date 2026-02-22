import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-voucher/backend/convex/_generated/api";
import type { Id } from "@open-voucher/backend/convex/_generated/dataModel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export const Route = createFileRoute("/users/")({
	component: UsersPage,
});

type SortField =
	| "coins"
	| "uploadCount"
	| "claimCount"
	| "uploadReportCount"
	| "claimReportCount"
	| "uploadReportRatio"
	| "claimReportRatio"
	| "banScore";
type SortDirection = "asc" | "desc";

function UsersPage() {
	const { token } = useAdminAuth();
	const convex = useConvex();
	const queryClient = useQueryClient();
	const [sortField, setSortField] = useState<SortField>("banScore");
	const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

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

	const handleSort = (field: SortField) => {
		if (sortField === field) {
			setSortDirection(sortDirection === "asc" ? "desc" : "asc");
		} else {
			setSortField(field);
			setSortDirection("desc");
		}
	};

	if (isLoading) {
		return <div className="text-muted-foreground">Loading users...</div>;
	}

	if (error) {
		return <div className="text-red-500">Error loading users</div>;
	}

	const users = (data?.users ?? [])
		.map((user) => {
			const uploadReportRatio =
				user.uploadReportCount < 2
					? 0
					: user.uploadCount > 0
						? user.uploadReportCount / user.uploadCount
						: Number.POSITIVE_INFINITY;
			const claimReportRatio =
				user.claimReportCount < 2
					? 0
					: user.claimCount > 0
						? user.claimReportCount / user.claimCount
						: Number.POSITIVE_INFINITY;
			return {
				...user,
				uploadReportRatio,
				claimReportRatio,
				banScore: uploadReportRatio + claimReportRatio,
			};
		})
		.sort((a, b) => {
			const aValue = a[sortField];
			const bValue = b[sortField];
			const multiplier = sortDirection === "asc" ? 1 : -1;
			return (aValue - bValue) * multiplier;
		});

	return (
		<div>
			<div className="mb-6 flex items-center justify-between">
				<h1 className="font-semibold text-xl">Users ({users.length})</h1>
			</div>
			<div className="overflow-x-auto">
				<table className="w-full border-collapse">
					<thead>
						<tr className="border-b text-left">
							<th className="pr-4 pb-3 font-medium">User</th>
							<th className="pr-4 pb-3 font-medium">
								<button
									onClick={() => handleSort("coins")}
									className="flex items-center gap-1 hover:text-foreground"
								>
									Coins
									{sortField === "coins" ? (
										sortDirection === "asc" ? (
											<span>↑</span>
										) : (
											<span>↓</span>
										)
									) : (
										<span className="opacity-30">⇅</span>
									)}
								</button>
							</th>
							<th className="pr-4 pb-3 font-medium">
								<button
									onClick={() => handleSort("uploadCount")}
									className="flex items-center gap-1 hover:text-foreground"
								>
									Uploaded
									{sortField === "uploadCount" ? (
										sortDirection === "asc" ? (
											<span>↑</span>
										) : (
											<span>↓</span>
										)
									) : (
										<span className="opacity-30">⇅</span>
									)}
								</button>
							</th>
							<th className="pr-4 pb-3 font-medium">
								<button
									onClick={() => handleSort("claimCount")}
									className="flex items-center gap-1 hover:text-foreground"
								>
									Claimed
									{sortField === "claimCount" ? (
										sortDirection === "asc" ? (
											<span>↑</span>
										) : (
											<span>↓</span>
										)
									) : (
										<span className="opacity-30">⇅</span>
									)}
								</button>
							</th>
							<th className="pr-4 pb-3 font-medium">
								<button
									onClick={() => handleSort("uploadReportCount")}
									className="flex items-center gap-1 hover:text-foreground"
								>
									Upload Reports
									{sortField === "uploadReportCount" ? (
										sortDirection === "asc" ? (
											<span>↑</span>
										) : (
											<span>↓</span>
										)
									) : (
										<span className="opacity-30">⇅</span>
									)}
								</button>
							</th>
							<th className="pr-4 pb-3 font-medium">
								<button
									onClick={() => handleSort("claimReportCount")}
									className="flex items-center gap-1 hover:text-foreground"
								>
									Claim Reports
									{sortField === "claimReportCount" ? (
										sortDirection === "asc" ? (
											<span>↑</span>
										) : (
											<span>↓</span>
										)
									) : (
										<span className="opacity-30">⇅</span>
									)}
								</button>
							</th>
							<th className="pr-4 pb-3 font-medium">
								<button
									onClick={() => handleSort("uploadReportRatio")}
									className="flex items-center gap-1 hover:text-foreground"
								>
									Upload Report Ratio
									{sortField === "uploadReportRatio" ? (
										sortDirection === "asc" ? (
											<span>↑</span>
										) : (
											<span>↓</span>
										)
									) : (
										<span className="opacity-30">⇅</span>
									)}
								</button>
							</th>
							<th className="pr-4 pb-3 font-medium">
								<button
								type="button"
									onClick={() => handleSort("claimReportRatio")}
									className="flex items-center gap-1 hover:text-foreground"
								>
									Claim Report Ratio
									{sortField === "claimReportRatio" ? (
										sortDirection === "asc" ? (
											<span>↑</span>
										) : (
											<span>↓</span>
										)
									) : (
										<span className="opacity-30">⇅</span>
									)}
								</button>
							</th>
							<th className="pr-4 pb-3 font-medium">
								<button
									type="button"
									onClick={() => handleSort("banScore")}
									className="flex items-center gap-1 hover:text-foreground"
								>
									Ban Score
									{sortField === "banScore" ? (
										sortDirection === "asc" ? (
											<span>↑</span>
										) : (
											<span>↓</span>
										)
									) : (
										<span className="opacity-30">⇅</span>
									)}
								</button>
							</th>
							<th className="pb-3 font-medium">Actions</th>
						</tr>
					</thead>
					<tbody>
						{users.map((user) => (
							<tr key={user._id} className="border-b">
								<td className="py-3 pr-4">
									<Link to="/users/$userId" params={{ userId: user._id }}>
										<div className="cursor-pointer hover:underline">
											<div className="font-medium">
												{user.username || user.firstName || "Unknown"}
											</div>
											<div className="text-muted-foreground text-xs">
												{user.telegramChatId}
											</div>
										</div>
									</Link>
								</td>
								<td className="py-3 pr-4">{user.coins}</td>
								<td className="py-3 pr-4">{user.uploadCount}</td>
								<td className="py-3 pr-4">{user.claimCount}</td>
								<td className="py-3 pr-4">
									<span
										className={
											user.uploadReportCount > 0
												? "font-medium text-red-500"
												: ""
										}
									>
										{user.uploadReportCount}
									</span>
								</td>
								<td className="py-3 pr-4">
									<span
										className={
											user.claimReportCount > 0
												? "font-medium text-orange-500"
												: ""
										}
									>
										{user.claimReportCount}
									</span>
								</td>
								<td className="py-3 pr-4">
									<span
										className={
											user.uploadReportRatio > 1.5
												? "font-bold text-red-600"
												: user.uploadReportRatio > 1.0
													? "font-medium text-orange-500"
													: user.uploadReportRatio === Number.POSITIVE_INFINITY
														? "font-bold text-red-600"
														: ""
										}
									>
										{user.uploadReportRatio === Number.POSITIVE_INFINITY
											? "∞"
											: user.uploadReportRatio.toFixed(2)}
									</span>
								</td>
								<td className="py-3 pr-4">
									<span
										className={
											user.claimReportRatio > 1.5
												? "font-bold text-red-600"
												: user.claimReportRatio > 1.0
													? "font-medium text-orange-500"
													: user.claimReportRatio === Number.POSITIVE_INFINITY
														? "font-bold text-red-600"
														: ""
										}
									>
										{user.claimReportRatio === Number.POSITIVE_INFINITY
											? "∞"
											: user.claimReportRatio.toFixed(2)}
									</span>
								</td>
								<td className="py-3 pr-4">
									<span
										className={
											user.banScore > 3.0
												? "font-bold text-red-600"
												: user.banScore > 2.0
													? "font-medium text-orange-500"
													: ""
										}
									>
										{user.banScore === Number.POSITIVE_INFINITY
											? "∞"
											: user.banScore.toFixed(2)}
									</span>
								</td>
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
