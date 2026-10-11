import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-voucher/backend/convex/_generated/api";
import type { Id } from "@open-voucher/backend/convex/_generated/dataModel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { useState } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export const Route = createFileRoute("/admin/users/")({
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

function ratioClass(value: number) {
	if (!Number.isFinite(value) || value > 1.5) return "sev-red";
	if (value > 1) return "sev-amber";
	return "";
}

function formatRatio(value: number) {
	if (value === Number.POSITIVE_INFINITY) return "∞";
	return value.toFixed(2);
}

function scoreWidth(score: number) {
	if (!Number.isFinite(score)) return 100;
	return Math.min(100, score * 80);
}

function scoreColor(score: number) {
	if (!Number.isFinite(score) || score > 2) return "var(--red)";
	if (score > 1) return "var(--gold)";
	return "var(--green)";
}

function UsersPage() {
	const { token } = useAdminAuth();
	const convex = useConvex();
	const queryClient = useQueryClient();
	const [sortField, setSortField] = useState<SortField>("banScore");
	const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

	const { data, isLoading, error } = useQuery(
		convexQuery(api.adminUsers.getUsersWithStats, token ? { token } : "skip"),
	);

	const banMutation = useMutation({
		mutationFn: (userId: Id<"users">) => {
			if (!token) {
				throw new Error("Not signed in");
			}
			return convex.mutation(api.adminUsers.banUser, { token, userId });
		},
		onSuccess: () => queryClient.invalidateQueries(),
	});

	const unbanMutation = useMutation({
		mutationFn: (userId: Id<"users">) => {
			if (!token) {
				throw new Error("Not signed in");
			}
			return convex.mutation(api.adminUsers.unbanUser, { token, userId });
		},
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
		return <p className="muted">Loading users...</p>;
	}

	if (error) {
		return <p className="warn">Error loading users</p>;
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
			<div className="masthead">
				<div>
					<h1 className="display">Users</h1>
					<p className="lede">Every account, worst behaviour first.</p>
				</div>
				<div className="stamp">
					<b className="num">{users.length}</b> accounts
				</div>
			</div>

			<section className="panel">
				<div className="panel-head">
					<h2>Accounts by ban score</h2>
					<span className="note">
						Ratios count only once a user has 2 or more reports
					</span>
				</div>
				<div className="panel-body tight table-scroll">
					<table className="users-table">
						<thead>
							<tr>
								<th>User</th>
								<SortHeader
									label="Coins"
									field="coins"
									sortField={sortField}
									sortDirection={sortDirection}
									onSort={handleSort}
								/>
								<SortHeader
									label="Uploaded"
									field="uploadCount"
									sortField={sortField}
									sortDirection={sortDirection}
									onSort={handleSort}
								/>
								<SortHeader
									label="Claimed"
									field="claimCount"
									sortField={sortField}
									sortDirection={sortDirection}
									onSort={handleSort}
								/>
								<SortHeader
									label="Upload reports"
									field="uploadReportCount"
									sortField={sortField}
									sortDirection={sortDirection}
									onSort={handleSort}
								/>
								<SortHeader
									label="Claim reports"
									field="claimReportCount"
									sortField={sortField}
									sortDirection={sortDirection}
									onSort={handleSort}
								/>
								<SortHeader
									label="Upload ratio"
									field="uploadReportRatio"
									sortField={sortField}
									sortDirection={sortDirection}
									onSort={handleSort}
								/>
								<SortHeader
									label="Claim ratio"
									field="claimReportRatio"
									sortField={sortField}
									sortDirection={sortDirection}
									onSort={handleSort}
								/>
								<SortHeader
									label="Ban score"
									field="banScore"
									sortField={sortField}
									sortDirection={sortDirection}
									onSort={handleSort}
								/>
								<th>Action</th>
							</tr>
						</thead>
						<tbody>
							{users.map((user) => (
								<tr key={user._id}>
									<td>
										<Link
											to="/admin/users/$userId"
											params={{ userId: user._id }}
										>
											<div className="u-name">
												{user.username || user.firstName || "Unknown"}
											</div>
											<div className="u-id">{user.telegramChatId}</div>
										</Link>
									</td>
									<td className="num">{user.coins}</td>
									<td className="num">{user.uploadCount}</td>
									<td className="num">{user.claimCount}</td>
									<td
										className={
											user.uploadReportCount > 0 ? "num sev-red" : "num"
										}
									>
										{user.uploadReportCount}
									</td>
									<td
										className={
											user.claimReportCount > 0 ? "num sev-amber" : "num"
										}
									>
										{user.claimReportCount}
									</td>
									<td className={`num ${ratioClass(user.uploadReportRatio)}`}>
										{formatRatio(user.uploadReportRatio)}
									</td>
									<td className={`num ${ratioClass(user.claimReportRatio)}`}>
										{formatRatio(user.claimReportRatio)}
									</td>
									<td>
										<span
											className={`banscore num ${
												!Number.isFinite(user.banScore) || user.banScore > 3
													? "sev-red"
													: user.banScore > 2
														? "sev-amber"
														: ""
											}`}
										>
											{formatRatio(user.banScore)}
											<span className="micro" aria-hidden="true">
												<span
													style={{
														width: `${scoreWidth(user.banScore)}%`,
														background: scoreColor(user.banScore),
													}}
												/>
											</span>
										</span>
									</td>
									<td>
										{user.isBanned ? (
											<button
												type="button"
												className="btn btn-xs btn-quiet"
												onClick={() => unbanMutation.mutate(user._id)}
												disabled={unbanMutation.isPending}
											>
												Unban
											</button>
										) : (
											<button
												type="button"
												className="btn btn-xs btn-danger"
												onClick={() => banMutation.mutate(user._id)}
												disabled={banMutation.isPending}
											>
												Ban
											</button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}

function SortHeader({
	label,
	field,
	sortField,
	sortDirection,
	onSort,
}: {
	label: string;
	field: SortField;
	sortField: SortField;
	sortDirection: SortDirection;
	onSort: (field: SortField) => void;
}) {
	const active = sortField === field;
	return (
		<th>
			<button type="button" onClick={() => onSort(field)}>
				<span className={active ? "active-sort" : undefined}>
					{label}
					{active ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
				</span>
			</button>
		</th>
	);
}
