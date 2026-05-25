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

export const Route = createFileRoute("/admin/messages")({
	component: MessagesPage,
});

function MessagesPage() {
	const { token } = useAdminAuth();
	const [sinceDays, setSinceDays] = useState<"all" | "30">("30");
	const since = useMemo(
		() =>
			sinceDays === "30" ? Date.now() - 30 * MS_PER_DAY : undefined,
		[sinceDays],
	);

	const { data, isLoading, error } = useQuery(
		convexQuery(
			api.admin.getMessageAnalytics,
			token ? { token, since } : "skip",
		),
	);

	if (isLoading) {
		return <div className="text-muted-foreground">Loading message analytics...</div>;
	}

	if (error) {
		return (
			<div className="text-red-500">
				Error loading message analytics
				{error instanceof Error ? `: ${error.message}` : ""}
			</div>
		);
	}

	const dashboardCounts = (data?.dashboardCounts ?? {}) as Record<
		string,
		number
	>;
	const unknownMessages = data?.unknownMessages ?? [];

	return (
		<div>
			<div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="font-semibold text-xl">Message analytics</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						{data?.totalInbound ?? 0} inbound messages
						{sinceDays === "30" ? " (last 30 days)" : " (all time)"}
					</p>
				</div>
				<select
					value={sinceDays}
					onChange={(e) => setSinceDays(e.target.value as "all" | "30")}
					className="rounded-md border border-input bg-background px-3 py-1.5 text-foreground text-sm"
				>
					<option value="30">Last 30 days</option>
					<option value="all">All time</option>
				</select>
			</div>

			<section className="mb-8 rounded-lg border p-4">
				<h2 className="mb-4 font-medium">Known commands</h2>
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
					{Object.entries(dashboardCounts).map(([intent, count]) => (
						<div key={intent} className="rounded-md border p-3">
							<div className="mb-1 text-muted-foreground text-xs">
								{INTENT_LABELS[intent] ?? intent}
							</div>
							<div className="font-semibold text-2xl">{count}</div>
						</div>
					))}
				</div>
				<div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
					<div className="text-muted-foreground text-xs">
						Unknown / free text
					</div>
					<div className="font-semibold text-2xl">{data?.unknownCount ?? 0}</div>
				</div>
			</section>

			<section>
				<h2 className="mb-4 font-medium">
					Unknown messages ({unknownMessages.length})
				</h2>
				{unknownMessages.length === 0 ? (
					<div className="py-12 text-center text-muted-foreground">
						No unknown messages in this period
					</div>
				) : (
					<div className="space-y-4">
						{unknownMessages.map((item) => (
							<div key={item._id} className="rounded-lg border p-4">
								<div className="mb-2 flex items-start justify-between gap-4">
									<div>
										{item.user?.id ? (
											<Link
												to="/admin/users/$userId"
												params={{ userId: item.user.id }}
												className="font-medium hover:text-blue-600 hover:underline"
											>
												{item.user.username ||
													item.user.firstName ||
													"Unknown user"}
											</Link>
										) : (
											<span className="font-medium">Unknown user</span>
										)}
										<div className="text-muted-foreground text-xs">
											{item.telegramChatId} • {formatDateTime(item.createdAt)}
										</div>
									</div>
								</div>
								<p className="whitespace-pre-wrap">{item.text || "(empty)"}</p>
							</div>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
