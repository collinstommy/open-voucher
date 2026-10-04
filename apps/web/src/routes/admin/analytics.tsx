import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-voucher/backend/convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { formatDateTime } from "@/lib/utils";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const INTENT_LABELS: Record<string, string> = {
	claim_5: "Claim €5",
	claim_10: "Claim €10",
	claim_20: "Claim €20",
	balance: "Balance",
	help: "Help",
	start: "Start",
	faq: "FAQ",
	donate: "Donate",
	app: "App",
	feedback: "Feedback",
	feedback_with_text: "Feedback (with text)",
	image: "Image upload",
};

const ANALYTICS_LABELS: Record<string, string> = {
	page_view_app_menu: "App home views",
	"menu_click:my-uploads": "Menu: My Uploads",
	"menu_click:my-claims": "Menu: My Claims",
	"menu_click:transactions": "Menu: Transactions",
	"menu_click:donate": "Menu: Donate",
	"menu_click:availability": "Menu: Availability",
	"menu_click:share": "Menu: Share",
	"menu_click:faq": "Menu: FAQ",
	"menu_click:feedback": "Menu: Feedback",
	"share_click:whatsapp": "Share: WhatsApp",
	"share_click:facebook": "Share: Facebook",
	"share_click:copy": "Share: Copy text",
};

const TRANSACTION_LABELS: Record<string, string> = {
	signup_bonus: "Signup bonus",
	upload_reward: "Upload reward",
	claim_spend: "Claim spend",
	refund: "Refund",
	report_refund: "Report refund",
	uploader_refund: "Uploader refund",
	uploader_denied: "Uploader denied",
	admin_expiry_deduction: "Admin expiry deduction",
	admin_manual_deduction: "Admin manual deduction",
	admin_report_deduction: "Admin reports deduction",
	claim_reversed: "User returned",
	self_invalidated: "Self invalidated",
	claim_returned: "Admin claim returned",
	replacement_received: "Replacement received",
};

const CLASSIFIED_INTENT_LABELS: Record<string, string> = {
	return_voucher: "Return voucher",
	revoke_upload: "Revoke upload",
	report_not_working: "Report not working",
	how_does_it_work: "How does it work?",
	balance: "Balance",
	limits_question: "Limits question",
	praise_or_noise: "Praise / noise",
	unknown: "Unknown",
};

export const Route = createFileRoute("/admin/analytics")({
	component: AnalyticsPage,
});

function formatCount(value: number) {
	return value.toLocaleString("en-IE");
}

function labeledRows(
	record: Record<string, number>,
	labels: Record<string, string>,
) {
	return Object.entries(record)
		.map(([key, count]): [string, number] => [labels[key] ?? key, count])
		.sort((a, b) => b[1] - a[1]);
}

function BarList({
	rows,
	tone,
}: {
	rows: [string, number][];
	tone?: "blue" | "green";
}) {
	const max = Math.max(1, ...rows.map(([, count]) => count));
	if (rows.length === 0) {
		return <p className="muted">Nothing in this period.</p>;
	}
	return (
		<div className={tone ? `barlist solo bl-${tone}` : "barlist"}>
			{rows.map(([label, count]) => (
				<div className="bl-row" key={label}>
					<div className="bl-top">
						<span className="bl-label">{label}</span>
						<span className="bl-count num">{formatCount(count)}</span>
					</div>
					<div className="bl-track">
						{count > 0 && (
							<span
								style={{
									width: `${Math.max(1.5, (count / max) * 100)}%`,
								}}
							/>
						)}
					</div>
				</div>
			))}
		</div>
	);
}

function AnalyticsPage() {
	const { token } = useAdminAuth();
	const [sinceDays, setSinceDays] = useState<"all" | "30">("30");
	const since = useMemo(
		() => (sinceDays === "30" ? Date.now() - 30 * MS_PER_DAY : undefined),
		[sinceDays],
	);

	const { data, isLoading, error } = useQuery(
		convexQuery(
			api.adminAnalytics.getMessageAnalytics,
			token ? { token, since } : "skip",
		),
	);

	const { data: analyticsData, isLoading: analyticsLoading } = useQuery(
		convexQuery(
			api.adminAnalytics.getAnalyticsEventCounts,
			token ? { token, since } : "skip",
		),
	);

	const { data: transactionData, isLoading: transactionLoading } = useQuery(
		convexQuery(
			api.adminAnalytics.getTransactionTotalsByType,
			token ? { token, since } : "skip",
		),
	);

	const dashboardCounts: Record<string, number> = data?.dashboardCounts ?? {};
	const unknownMessages = data?.unknownMessages ?? [];
	const inbound = data?.totalInbound ?? 0;
	const unknownCount = data?.unknownCount ?? 0;
	const commandTotal = Object.values(dashboardCounts).reduce(
		(sum, count) => sum + count,
		0,
	);
	const unknownShare =
		inbound > 0 ? Math.round((unknownCount / inbound) * 1000) / 10 : 0;
	const rangeLabel = sinceDays === "30" ? "Last 30 days" : "All time";

	return (
		<div className="stack">
			<div className="masthead">
				<div>
					<h1 className="display">Analytics</h1>
					<p className="lede">
						What people asked the bot for, and what it did about it.
					</p>
				</div>
				<div className="masthead-side">
					<fieldset className="seg">
						<legend className="sr-only">Time range</legend>
						<button
							type="button"
							aria-pressed={sinceDays === "30"}
							onClick={() => setSinceDays("30")}
						>
							Last 30 days
						</button>
						<button
							type="button"
							aria-pressed={sinceDays === "all"}
							onClick={() => setSinceDays("all")}
						>
							All time
						</button>
					</fieldset>
				</div>
			</div>

			{isLoading ? (
				<p className="muted">Loading analytics...</p>
			) : error ? (
				<p className="warn">
					Error loading analytics
					{error instanceof Error ? `: ${error.message}` : ""}
				</p>
			) : (
				<div className="stack">
					<div className="stats">
						<div className="stat">
							<div className="k">Inbound messages</div>
							<div className="v num">{formatCount(inbound)}</div>
							<div className="n">
								{formatCount(commandTotal)} were known commands
							</div>
						</div>
						<div className="stat">
							<div className="k">Transactions</div>
							<div className="v num">
								{formatCount(transactionData?.totalCount ?? 0)}
							</div>
							<div className="n">coins moved between users</div>
						</div>
						<div className="stat accent-red">
							<div className="k">Reported not working</div>
							<div className="v num">
								{formatCount(transactionData?.reportedNotWorkingCount ?? 0)}
							</div>
							<div className="n">{rangeLabel}</div>
						</div>
						<div className="stat accent-gold">
							<div className="k">Unknown / free text</div>
							<div className="v num">{formatCount(unknownCount)}</div>
							<div className="n">
								{inbound > 0
									? `${unknownShare}% of inbound messages`
									: "No inbound messages"}
							</div>
						</div>
					</div>

					<section className="panel">
						<div className="panel-head">
							<h2>Transaction totals by type</h2>
							{transactionData && (
								<span className="note">
									{formatCount(transactionData.totalCount)} total · {rangeLabel}
								</span>
							)}
						</div>
						<div className="panel-body">
							{transactionLoading ? (
								<p className="muted">Loading...</p>
							) : (
								<BarList
									rows={labeledRows(
										transactionData?.totals ?? {},
										TRANSACTION_LABELS,
									)}
								/>
							)}
						</div>
					</section>

					{transactionData && (
						<div className="alert-strip">
							<div>
								<div className="k">Vouchers reported as not working</div>
								<div className="v num">
									{formatCount(transactionData.reportedNotWorkingCount)}
								</div>
							</div>
							<p className="copy">
								Users told the bot these vouchers would not scan or were refused
								at the till.
							</p>
						</div>
					)}

					<section className="panel">
						<div className="panel-head">
							<h2>Commands & app events</h2>
							<span className="note">
								{formatCount(commandTotal)} commands
								{analyticsData
									? ` · ${formatCount(analyticsData.total)} events`
									: ""}
							</span>
						</div>
						<div className="panel-body">
							<div className="two-col">
								<div>
									<p className="eyebrow" style={{ marginBottom: 12 }}>
										Bot commands
									</p>
									<BarList
										tone="blue"
										rows={labeledRows(dashboardCounts, INTENT_LABELS)}
									/>
								</div>
								<div>
									<p className="eyebrow" style={{ marginBottom: 12 }}>
										App events
									</p>
									{analyticsLoading ? (
										<p className="muted">Loading...</p>
									) : (
										<BarList
											tone="green"
											rows={labeledRows(
												analyticsData?.counts ?? {},
												ANALYTICS_LABELS,
											)}
										/>
									)}
								</div>
							</div>
						</div>
					</section>

					<section className="panel">
						<div className="panel-head">
							<h2>Unknown messages</h2>
							<span className="note">
								{formatCount(unknownMessages.length)} in this period
							</span>
						</div>
						<div className="panel-body">
							{unknownMessages.length === 0 ? (
								<p className="muted">No unknown messages in this period</p>
							) : (
								unknownMessages.map((item) => (
									<div className="msg" key={item._id}>
										<div className="msg-head">
											{item.user?.id ? (
												<Link
													className="msg-user"
													to="/admin/users/$userId"
													params={{ userId: item.user.id }}
												>
													{item.user.username ||
														item.user.firstName ||
														"Unknown user"}
												</Link>
											) : (
												<span className="msg-user">Unknown user</span>
											)}
											<span className="msg-meta">
												{item.telegramChatId} · {formatDateTime(item.createdAt)}
											</span>
											{item.classifiedIntent && (
												<span className="intent">
													{CLASSIFIED_INTENT_LABELS[item.classifiedIntent] ??
														item.classifiedIntent}
													{item.classifiedConfidence !== undefined &&
														item.classifiedConfidence !== null && (
															<span>
																{Math.round(item.classifiedConfidence * 100)}%
															</span>
														)}
												</span>
											)}
										</div>
										<p className="msg-text">{item.text || "(empty)"}</p>
									</div>
								))
							)}
						</div>
					</section>
				</div>
			)}
		</div>
	);
}
