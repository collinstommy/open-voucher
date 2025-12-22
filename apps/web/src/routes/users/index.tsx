import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-router/backend/convex/_generated/api";
import type { Id } from "@open-router/backend/convex/_generated/dataModel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { useConvex } from "convex/react";
import { useState } from "react";

export const Route = createFileRoute("/users/")({
	component: UsersPage,
});

type SortField =
	| "coins"
	| "uploadCount"
	| "claimCount"
	| "uploadReportCount"
	| "claimReportCount"
	| "uploadReportRatio";
type SortDirection = "asc" | "desc";

function UsersPage() {
	const { token } = useAdminAuth();
	const convex = useConvex();
	const queryClient = useQueryClient();
	const [sortField, setSortField] = useState<SortField>("uploadCount");
	const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
	const [deployment, setDeployment] = useState<"dev" | "prod">(() => {
		if (typeof window === "undefined") return "prod";
		return (
			(localStorage.getItem("convex-deployment") as "dev" | "prod") || "prod"
		);
	});

	const handleDeploymentChange = (value: string) => {
		localStorage.setItem("convex-deployment", value);
		window.location.reload();
	};

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
		.map((user) => ({
			...user,
			uploadReportRatio:
				user.uploadCount > 0
					? user.uploadReportCount / user.uploadCount
					: user.uploadReportCount > 0
						? Number.POSITIVE_INFINITY
						: 0,
		}))
		.sort((a, b) => {
			const aValue = a[sortField];
			const bValue = b[sortField];
			const multiplier = sortDirection === "asc" ? 1 : -1;
			return (aValue - bValue) * multiplier;
		});

	return (
		<div>
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-xl font-semibold">Users ({users.length})</h1>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm">
							{deployment === "dev" ? "Development" : "Production"}
							<ChevronDownIcon />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuRadioGroup
							value={deployment}
							onValueChange={handleDeploymentChange}
						>
							<DropdownMenuRadioItem value="dev">
								Development
							</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="prod">
								Production
							</DropdownMenuRadioItem>
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<div className="overflow-x-auto">
				<table className="w-full border-collapse">
					<thead>
						<tr className="border-b text-left">
							<th className="pb-3 pr-4 font-medium">User</th>
							<th className="pb-3 pr-4 font-medium">
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
							<th className="pb-3 pr-4 font-medium">
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
							<th className="pb-3 pr-4 font-medium">
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
							<th className="pb-3 pr-4 font-medium">
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
							<th className="pb-3 pr-4 font-medium">
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
							<th className="pb-3 pr-4 font-medium">
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
												? "text-red-500 font-medium"
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
												? "text-orange-500 font-medium"
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
												? "text-red-600 font-bold"
												: user.uploadReportRatio > 1.0
													? "text-orange-500 font-medium"
													: user.uploadReportRatio === Number.POSITIVE_INFINITY
														? "text-red-600 font-bold"
														: ""
										}
									>
										{user.uploadReportRatio === Number.POSITIVE_INFINITY
											? "∞"
											: user.uploadReportRatio.toFixed(2)}
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
