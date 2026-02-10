import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-voucher/backend/convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
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
	const [range, setRange] = useState<"all" | "30days">("30days");
	const stats = useQuery(convexQuery(api.dashboard.getStats, {}));
	const userGrowth = useQuery(
		convexQuery(api.admin.getUserGrowth, token ? { token, range } : "skip"),
	);

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
		</div>
	);
}
