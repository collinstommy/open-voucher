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
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export const Route = createFileRoute("/admin/")({
	component: HomeComponent,
});

type CleanupResult = {
	dryRun: boolean;
	marked: number;
	deleted: number;
	skipped: number;
	toMark: unknown[];
	toDelete: unknown[];
};

function formatDate(dateStr: string) {
	const date = new Date(dateStr);
	return `${date.toLocaleDateString("en-US", { month: "short" })} ${date.getDate()}`;
}

function formatCount(value: number) {
	return value.toLocaleString("en-IE");
}

function shareOf(count: number, total: number) {
	if (total <= 0) return 0;
	return Math.round((count / total) * 100);
}

function rateColor(rate: number) {
	if (rate >= 30) return "var(--red)";
	if (rate >= 15) return "var(--gold)";
	return "var(--green)";
}

function todayKey() {
	return new Date().toISOString().split("T")[0];
}

function HomeComponent() {
	const { token } = useAdminAuth();
	const convex = useConvex();
	const queryClient = useQueryClient();
	const [range, setRange] = useState<"all" | "30days">("30days");
	const [dryRun, setDryRun] = useState(true);
	const [deepStats, setDeepStats] = useState(false);
	const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(
		null,
	);
	// Only the inventory reads live on dashboard load; the coupon-shaped
	// queries below full-table scans stay skipped until "Load full stats".
	const inventory = useQuery(
		convexQuery(
			api.adminDashboard.getVoucherInventory,
			token ? { token } : "skip",
		),
	);
	const lifetimeStats = useQuery(
		convexQuery(
			api.adminDashboard.getLifetimeStats,
			deepStats && token ? { token } : "skip",
		),
	);
	const userGrowth = useQuery(
		convexQuery(
			api.adminAnalytics.getUserGrowth,
			deepStats && token ? { token, range } : "skip",
		),
	);
	const weeklyVouchers = useQuery(
		convexQuery(
			api.adminDashboard.getWeeklyVouchers,
			deepStats && token ? { token } : "skip",
		),
	);
	const weeklyFailures = useQuery(
		convexQuery(
			api.adminDashboard.getWeeklyFailureStats,
			deepStats && token ? { token } : "skip",
		),
	);
	const weeklyUploadAverage = useQuery(
		convexQuery(
			api.adminDashboard.getWeeklyUploadAverage,
			deepStats && token ? { token } : "skip",
		),
	);

	const cleanupMutation = useMutation({
		mutationFn: () => {
			if (!token) {
				throw new Error("Not signed in");
			}
			return convex.mutation(api.adminDashboard.cleanupExpiredVoucherImages, {
				token,
				dryRun,
			});
		},
		onSuccess: (data) => {
			setCleanupResult(data);
			queryClient.invalidateQueries();
		},
	});

	const five = inventory.data?.vouchersByType["5"] ?? 0;
	const ten = inventory.data?.vouchersByType["10"] ?? 0;
	const twenty = inventory.data?.vouchersByType["20"] ?? 0;
	const available = five + ten + twenty;
	const totalUploaded = lifetimeStats.data?.totalUploaded ?? 0;
	const claimedCount = lifetimeStats.data?.claimedCount ?? 0;
	const claimRate =
		totalUploaded > 0
			? Math.round((claimedCount / totalUploaded) * 1000) / 10
			: 0;
	const failureWeeks = weeklyFailures.data ?? [];
	const failureAverage =
		failureWeeks.length > 0
			? Math.round(
					(failureWeeks.reduce((sum, week) => sum + week.rate, 0) /
						failureWeeks.length) *
						10,
				) / 10
			: 0;
	const weekDays = weeklyVouchers.data ?? [];
	const weekPeak = Math.max(
		1,
		...weekDays.map((day) => Math.max(day.uploaded, day.claimed)),
	);
	const weekUploaded = weekDays.reduce((sum, day) => sum + day.uploaded, 0);
	const weekClaimed = weekDays.reduce((sum, day) => sum + day.claimed, 0);
	const growth = userGrowth.data?.data ?? [];
	const growthLatest = growth.at(-1)?.cumulative ?? 0;
	const uploadWeeks = weeklyUploadAverage.data?.weeks ?? [];
	const uploadAverage = weeklyUploadAverage.data?.average ?? 0;

	return (
		<div className="stack">
			<div className="masthead">
				<div>
					<h1 className="display">Home</h1>
					<p className="lede">Voucher inventory, growth and system health.</p>
				</div>
			</div>

			<section className="panel">
				<div className="panel-head">
					<h2>Voucher inventory</h2>
					{inventory.data && (
						<span className="note">{formatCount(available)} available now</span>
					)}
				</div>
				{inventory.isLoading ? (
					<div className="panel-body">
						<p className="muted">Loading inventory...</p>
					</div>
				) : inventory.error ? (
					<div className="panel-body">
						<p className="warn">Error loading inventory</p>
					</div>
				) : (
					<div className="inventory">
						<Stock
							label="€5 vouchers"
							count={five}
							share={shareOf(five, available)}
						/>
						<Stock
							label="€10 vouchers"
							count={ten}
							share={shareOf(ten, available)}
						/>
						<Stock
							label="€20 vouchers"
							count={twenty}
							share={shareOf(twenty, available)}
						/>
					</div>
				)}
			</section>

			{deepStats && lifetimeStats.data && (
				<div className="metrics">
					<article className="metric">
						<p className="eyebrow">Total uploaded</p>
						<div className="display metric-value num">
							{formatCount(totalUploaded)}
						</div>
					</article>
					<article className="metric">
						<p className="eyebrow">Vouchers claimed</p>
						<div className="display metric-value num">
							{formatCount(claimedCount)}
						</div>
						{totalUploaded > 0 && (
							<p className="metric-note">
								<b>{claimRate}%</b> of uploaded vouchers are claimed.
							</p>
						)}
					</article>
					<article className="metric">
						<p className="eyebrow">Users</p>
						<div className="display metric-value num">
							{formatCount(lifetimeStats.data.userCount)}
						</div>
					</article>
				</div>
			)}

			{!deepStats && (
				<section className="panel">
					<div className="panel-body">
						<div className="maint">
							<div>
								<h2>Lifetime & weekly stats</h2>
								<p>
									Totals, user growth, failure rate and the weekly charts read
									the full tables. Loaded on demand.
								</p>
							</div>
							<div className="maint-actions">
								<button
									type="button"
									className="btn btn-gold"
									onClick={() => setDeepStats(true)}
								>
									Load full stats
								</button>
							</div>
						</div>
					</div>
				</section>
			)}

			{deepStats && (
				<section className="panel">
					<div className="panel-head">
						<h2>User growth</h2>
						<fieldset className="seg">
							<legend className="sr-only">Time range</legend>
							<button
								type="button"
								aria-pressed={range === "30days"}
								onClick={() => setRange("30days")}
							>
								Last 30 days
							</button>
							<button
								type="button"
								aria-pressed={range === "all"}
								onClick={() => setRange("all")}
							>
								All time
							</button>
						</fieldset>
					</div>
					{userGrowth.isLoading ? (
						<div className="panel-body">
							<p className="muted">Loading chart...</p>
						</div>
					) : userGrowth.error ? (
						<div className="panel-body">
							<p className="warn">Error loading chart</p>
						</div>
					) : (
						<div className="chart-wrap">
							<ResponsiveContainer width="100%" height="100%">
								<LineChart data={growth}>
									<CartesianGrid
										stroke="rgba(196,214,236,0.08)"
										vertical={false}
									/>
									<XAxis
										dataKey="date"
										tickFormatter={formatDate}
										stroke="#6C7686"
										fontSize={12}
										tickLine={false}
										axisLine={false}
										interval={range === "30days" ? 4 : "preserveStartEnd"}
									/>
									<YAxis
										stroke="#6C7686"
										fontSize={12}
										tickLine={false}
										axisLine={false}
										width={40}
									/>
									<Tooltip
										contentStyle={{
											backgroundColor: "#1B2029",
											border: "1px solid rgba(196,214,236,0.14)",
											borderRadius: "9px",
											color: "#E9EDF3",
										}}
										labelFormatter={(label) => formatDate(label as string)}
										formatter={(value) => [value, "Users"]}
									/>
									<Line
										type="monotone"
										dataKey="cumulative"
										stroke="#E6B25C"
										strokeWidth={2.2}
										dot={false}
										activeDot={{ r: 5, fill: "#E6B25C" }}
									/>
								</LineChart>
							</ResponsiveContainer>
						</div>
					)}
					{growth.length > 0 && (
						<div className="panel-foot">
							<span>
								<b>{formatCount(growthLatest)}</b>{" "}
								{range === "30days"
									? "new accounts in the last 30 days"
									: "accounts in this chart"}
							</span>
						</div>
					)}
				</section>
			)}

			{deepStats && (
				<section className="panel">
					<div className="panel-head">
						<h2>Average voucher uploads</h2>
						{uploadWeeks.length > 0 && (
							<span className="note">
								{uploadWeeks.length}-week average {uploadAverage}/week
							</span>
						)}
					</div>
					{weeklyUploadAverage.isLoading ? (
						<div className="panel-body">
							<p className="muted">Loading chart...</p>
						</div>
					) : weeklyUploadAverage.error ? (
						<div className="panel-body">
							<p className="warn">Error loading chart</p>
						</div>
					) : (
						<div className="chart-wrap">
							<ResponsiveContainer width="100%" height="100%">
								<LineChart data={uploadWeeks}>
									<CartesianGrid
										stroke="rgba(196,214,236,0.08)"
										vertical={false}
									/>
									<XAxis
										dataKey="weekStart"
										tickFormatter={formatDate}
										stroke="#6C7686"
										fontSize={12}
										tickLine={false}
										axisLine={false}
										interval="preserveStartEnd"
									/>
									<YAxis
										stroke="#6C7686"
										fontSize={12}
										tickLine={false}
										axisLine={false}
										width={40}
										allowDecimals={false}
									/>
									<Tooltip
										contentStyle={{
											backgroundColor: "#1B2029",
											border: "1px solid rgba(196,214,236,0.14)",
											borderRadius: "9px",
											color: "#E9EDF3",
										}}
										labelFormatter={(label) => formatDate(label as string)}
										formatter={(value) => [value, "Uploads"]}
									/>
									<ReferenceLine
										y={uploadAverage}
										stroke="#E6B25C"
										strokeDasharray="6 4"
										label={{
											value: `Avg ${uploadAverage}`,
											fill: "#E6B25C",
											fontSize: 12,
											position: "insideTopRight",
										}}
									/>
									<Line
										type="monotone"
										dataKey="uploaded"
										stroke="var(--blue)"
										strokeWidth={2.2}
										dot={false}
										activeDot={{ r: 5, fill: "var(--blue)" }}
									/>
								</LineChart>
							</ResponsiveContainer>
						</div>
					)}
					{uploadWeeks.length > 0 && (
						<div className="panel-foot">
							<span>
								<b>{uploadAverage}</b> average uploads per week across the last{" "}
								{uploadWeeks.length} weeks
							</span>
						</div>
					)}
				</section>
			)}

			{deepStats && (
				<div className="stack row-split">
					<section className="panel">
						<div className="panel-head">
							<h2>Weekly upload failure rate</h2>
							{failureWeeks.length > 0 && (
								<span className="note">
									{failureWeeks.length}-week average {failureAverage}%
								</span>
							)}
						</div>
						<div className="panel-body tight">
							{weeklyFailures.isLoading ? (
								<p className="muted">Loading...</p>
							) : weeklyFailures.error ? (
								<p className="warn">Error loading data</p>
							) : (
								<table className="data">
									<thead>
										<tr>
											<th>Week</th>
											<th className="r">Total</th>
											<th className="r">Failed</th>
											<th className="r">Rate</th>
										</tr>
									</thead>
									<tbody>
										{failureWeeks.map((week) => (
											<tr key={week.weekStart}>
												<td>{week.label}</td>
												<td className="r num">{week.total}</td>
												<td className="r num">{week.failed}</td>
												<td>
													<div className="rate-cell">
														<span className="micro" aria-hidden="true">
															<span
																style={{
																	width: `${Math.min(week.rate, 100)}%`,
																	background: rateColor(week.rate),
																}}
															/>
														</span>
														<span className="rate-num num">{week.rate}%</span>
													</div>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							)}
						</div>
					</section>

					<section className="panel">
						<div className="panel-head">
							<h2>This week</h2>
							{weekDays.length > 0 && (
								<span className="note">
									{formatDate(weekDays[0].date)} –{" "}
									{formatDate(weekDays[weekDays.length - 1].date)}
								</span>
							)}
						</div>
						<div className="panel-body tight">
							{weeklyVouchers.isLoading ? (
								<p className="muted">Loading...</p>
							) : weeklyVouchers.error ? (
								<p className="warn">Error loading data</p>
							) : (
								weekDays.map((day) => (
									<div key={day.date} className="week-row">
										<div
											className={
												day.date === todayKey() ? "week-day today" : "week-day"
											}
										>
											{new Date(day.date).toLocaleDateString("en-US", {
												weekday: "short",
												month: "short",
												day: "numeric",
											})}
										</div>
										<div className="week-bars" aria-hidden="true">
											<div className="week-bar up">
												<span
													style={{
														width: `${(day.uploaded / weekPeak) * 100}%`,
													}}
												/>
											</div>
											<div className="week-bar cl">
												<span
													style={{
														width: `${(day.claimed / weekPeak) * 100}%`,
													}}
												/>
											</div>
										</div>
										<div className="week-nums num">
											{day.uploaded}
											<small>{day.claimed}</small>
										</div>
									</div>
								))
							)}
						</div>
						{weekDays.length > 0 && (
							<div className="panel-foot spread">
								<div className="legend">
									<span>
										<i style={{ background: "var(--blue)" }} />
										Uploaded
									</span>
									<span>
										<i style={{ background: "var(--green)" }} />
										Claimed
									</span>
								</div>
								<span>
									<b>{formatCount(weekUploaded)}</b> up ·{" "}
									<b>{formatCount(weekClaimed)}</b> claimed
								</span>
							</div>
						)}
					</section>
				</div>
			)}

			{!deepStats && (
				<section className="panel">
					<div className="panel-body">
						<div className="maint">
							<div>
								<h2>Lifetime & weekly stats</h2>
								<p>
									Totals, user growth, failure rate and the weekly charts read
									the full tables. Loaded on demand.
								</p>
							</div>
							<div className="maint-actions">
								<button
									type="button"
									className="btn btn-gold"
									onClick={() => setDeepStats(true)}
								>
									Load full stats
								</button>
							</div>
						</div>
					</div>
				</section>
			)}

			<section className="panel">
				<div className="panel-body">
					<div className="maint">
						<div>
							<h2>Expired voucher image cleanup</h2>
							<p>
								Deletes images from vouchers expired 90+ days, after a 30-day
								grace period. Processes up to 100 vouchers per run. Repeat until
								counts reach zero.
							</p>
						</div>
						<div className="maint-actions">
							<label className="check">
								<input
									type="checkbox"
									checked={dryRun}
									onChange={(e) => setDryRun(e.target.checked)}
								/>
								Dry run
							</label>
							<button
								type="button"
								className={dryRun ? "btn btn-gold" : "btn btn-danger"}
								onClick={() => cleanupMutation.mutate()}
								disabled={cleanupMutation.isPending || !token}
							>
								{cleanupMutation.isPending
									? "Running..."
									: dryRun
										? "Preview cleanup"
										: "Run cleanup"}
							</button>
						</div>
					</div>
					{cleanupResult && (
						<div>
							<span
								className={
									cleanupResult.dryRun ? "cleanup-flag dry" : "cleanup-flag ran"
								}
							>
								{cleanupResult.dryRun ? "Dry run" : "Executed"}
							</span>
							<div className="cleanup-result">
								<div>
									<p className="eyebrow">To mark</p>
									<div className="display stock-value num">
										{cleanupResult.toMark.length}
									</div>
								</div>
								<div>
									<p className="eyebrow">To delete</p>
									<div className="display stock-value num">
										{cleanupResult.toDelete.length}
									</div>
								</div>
								<div>
									<p className="eyebrow">Skipped</p>
									<div className="display stock-value num">
										{cleanupResult.skipped}
									</div>
								</div>
							</div>
							{!cleanupResult.dryRun && (
								<p className="note" style={{ marginTop: 14 }}>
									Marked {cleanupResult.marked} · Deleted{" "}
									{cleanupResult.deleted}
								</p>
							)}
						</div>
					)}
				</div>
			</section>
		</div>
	);
}

function Stock({
	label,
	count,
	share,
}: {
	label: string;
	count: number;
	share: number;
}) {
	return (
		<div className="stock">
			<div className="stock-top">
				<div>
					<p className="eyebrow">{label}</p>
					<div className="display stock-value num">{formatCount(count)}</div>
				</div>
				<div className="stock-share num">{share}% of stock</div>
			</div>
			<div className="track" aria-hidden="true">
				<span style={{ width: `${share}%` }} />
			</div>
		</div>
	);
}
