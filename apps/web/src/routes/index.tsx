import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-voucher/backend/convex/_generated/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { useState } from "react";
import {
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

function formatDate(dateStr: string) {
	const date = new Date(dateStr);
	return `${date.toLocaleDateString("en-US", { month: "short" })} ${date.getDate()}`;
}

function HomeComponent() {
	const { token } = useAdminAuth();
	const convex = useConvex();
	const queryClient = useQueryClient();
	const [range, setRange] = useState<"all" | "30days">("30days");
	const [dryRun, setDryRun] = useState(true);
	const [cleanupResult, setCleanupResult] = useState<any>(null);
	const stats = useQuery(convexQuery(api.dashboard.getStats, {}));
	const userGrowth = useQuery(
		convexQuery(api.admin.getUserGrowth, token ? { token, range } : "skip"),
	);
	const weeklyVouchers = useQuery(
		convexQuery(api.dashboard.getWeeklyVouchers, {}),
	);

	const cleanupMutation = useMutation({
		mutationFn: () =>
			convex.action(api.admin.cleanupExpiredVoucherImages, {
				token: token!,
				dryRun,
			}),
		onSuccess: (data) => {
			setCleanupResult(data);
			queryClient.invalidateQueries();
		},
	});

	return (
		<div className="grid gap-6">
			<section className="rounded-lg border p-4">
				<h2 className="mb-4 font-medium">Voucher Statistics</h2>
				{stats.isLoading ? (
					<div className="text-muted-foreground text-sm">Loading stats...</div>
				) : stats.error ? (
					<div className="text-red-500 text-sm">Error loading stats</div>
				) : (
					<div className="grid gap-4">
						<div className="grid grid-cols-3 gap-4">
							<div className="rounded-md border p-3">
								<div className="mb-1 text-muted-foreground text-xs">
									€5 Available
								</div>
								<div className="font-semibold text-2xl">
									{stats.data?.vouchersByType["5"] ?? 0}
								</div>
							</div>
							<div className="rounded-md border p-3">
								<div className="mb-1 text-muted-foreground text-xs">
									€10 Available
								</div>
								<div className="font-semibold text-2xl">
									{stats.data?.vouchersByType["10"] ?? 0}
								</div>
							</div>
							<div className="rounded-md border p-3">
								<div className="mb-1 text-muted-foreground text-xs">
									€20 Available
								</div>
								<div className="font-semibold text-2xl">
									{stats.data?.vouchersByType["20"] ?? 0}
								</div>
							</div>
						</div>

						<div className="grid grid-cols-3 gap-4">
							<div className="rounded-md border p-3">
								<div className="mb-1 text-muted-foreground text-xs">
									Total Uploaded
								</div>
								<div className="font-semibold text-2xl">
									{stats.data?.totalUploaded ?? 0}
								</div>
							</div>
							<div className="rounded-md border p-3">
								<div className="mb-1 text-muted-foreground text-xs">
									Vouchers Claimed
								</div>
								<div className="font-semibold text-2xl">
									{stats.data?.claimedCount ?? 0}
								</div>
							</div>
							<div className="rounded-md border p-3">
								<div className="mb-1 text-muted-foreground text-xs">Users</div>
								<div className="font-semibold text-2xl">
									{stats.data?.userCount ?? 0}
								</div>
							</div>
						</div>
					</div>
				)}
			</section>

			<section className="rounded-lg border p-4">
				<div className="mb-4 flex items-center justify-between">
					<h2 className="font-medium">User Growth</h2>
					<select
						value={range}
						onChange={(e) => setRange(e.target.value as "all" | "30days")}
						className="rounded-md border bg-background px-3 py-1 text-sm"
					>
						<option value="30days">Last 30 Days</option>
						<option value="all">All Time</option>
					</select>
				</div>
				{userGrowth.isLoading ? (
					<div className="h-64 text-muted-foreground text-sm">
						Loading chart...
					</div>
				) : userGrowth.error ? (
					<div className="h-64 text-red-500 text-sm">Error loading chart</div>
				) : (
					<div className="h-64">
						<ResponsiveContainer width="100%" height="100%">
							<LineChart data={userGrowth.data?.data ?? []}>
								<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
								<XAxis
									dataKey="date"
									tickFormatter={formatDate}
									stroke="#6b7280"
									fontSize={12}
									tickLine={false}
									axisLine={false}
									interval={range === "30days" ? 4 : "preserveStartEnd"}
								/>
								<YAxis
									stroke="#6b7280"
									fontSize={12}
									tickLine={false}
									axisLine={false}
								/>
								<Tooltip
									contentStyle={{
										backgroundColor: "#1f2937",
										border: "none",
										borderRadius: "6px",
										color: "#fff",
									}}
									labelFormatter={(label) => formatDate(label as string)}
									formatter={(value) => [value, "Users"]}
								/>
								<Line
									type="monotone"
									dataKey="cumulative"
									stroke="#3b82f6"
									strokeWidth={2}
									dot={false}
									activeDot={{ r: 6, fill: "#3b82f6" }}
								/>
							</LineChart>
						</ResponsiveContainer>
					</div>
				)}
			</section>

			<section className="rounded-lg border p-4">
				<h2 className="mb-4 font-medium">This Week's Vouchers</h2>
				{weeklyVouchers.isLoading ? (
					<div className="text-muted-foreground text-sm">Loading...</div>
				) : weeklyVouchers.error ? (
					<div className="text-red-500 text-sm">Error loading data</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b">
									<th className="pb-2 text-left font-medium">Date</th>
									<th className="pb-2 text-right font-medium">Uploaded</th>
									<th className="pb-2 text-right font-medium">Claimed</th>
								</tr>
							</thead>
							<tbody>
								{weeklyVouchers.data?.map((day) => (
									<tr key={day.date} className="border-b">
										<td className="py-2">
											{new Date(day.date).toLocaleDateString("en-US", {
												weekday: "short",
												month: "short",
												day: "numeric",
											})}
										</td>
										<td className="py-2 text-right">{day.uploaded}</td>
										<td className="py-2 text-right">{day.claimed}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			<section className="rounded-lg border p-4">
				<h2 className="mb-4 font-medium">Expired Voucher Image Cleanup</h2>
				<p className="mb-4 text-muted-foreground text-sm">
					Deletes images from vouchers expired 90+ days (after 30-day grace
					period). Dry run previews what would happen.
				</p>
				<div className="mb-4 flex items-center gap-4">
					<label className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={dryRun}
							onChange={(e) => setDryRun(e.target.checked)}
							className="rounded"
						/>
						Dry run (preview only)
					</label>
					<Button
						onClick={() => cleanupMutation.mutate()}
						disabled={cleanupMutation.isPending || !token}
						variant={dryRun ? "outline" : "destructive"}
					>
						{cleanupMutation.isPending
							? "Running..."
							: dryRun
								? "Preview Cleanup"
								: "Run Cleanup"}
					</Button>
				</div>

				{cleanupResult && (
					<div className="rounded-md border bg-muted/50 p-4">
						<div className="mb-3 flex items-center gap-2">
							<span
								className={`rounded-full px-2 py-1 font-medium text-xs ${
									cleanupResult.dryRun
										? "bg-blue-100 text-blue-800"
										: "bg-green-100 text-green-800"
								}`}
							>
								{cleanupResult.dryRun ? "DRY RUN" : "EXECUTED"}
							</span>
						</div>
						<div className="grid grid-cols-3 gap-4 text-sm">
							<div>
								<div className="text-muted-foreground text-xs">
									To Mark ({">"} 90 days expired)
								</div>
								<div className="font-semibold text-lg">
									{cleanupResult.toMark?.length ?? 0}
								</div>
							</div>
							<div>
								<div className="text-muted-foreground text-xs">
									To Delete (marked {"<"} 30 days ago)
								</div>
								<div className="font-semibold text-lg">
									{cleanupResult.toDelete?.length ?? 0}
								</div>
							</div>
							<div>
								<div className="text-muted-foreground text-xs">Skipped</div>
								<div className="font-semibold text-lg">
									{cleanupResult.skipped ?? 0}
								</div>
							</div>
						</div>
						{!cleanupResult.dryRun && (
							<div className="mt-3 border-t pt-3 text-sm">
								<span className="text-green-600">
									Marked: {cleanupResult.marked}
								</span>
								{" · "}
								<span className="text-red-600">
									Deleted: {cleanupResult.deleted}
								</span>
							</div>
						)}
					</div>
				)}
			</section>
		</div>
	);
}
