import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-voucher/backend/convex/_generated/api";
import type { Id } from "@open-voucher/backend/convex/_generated/dataModel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { useState } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/admin/feedback")({
	component: FeedbackPage,
});

function FeedbackPage() {
	const { token } = useAdminAuth();
	const convex = useConvex();
	const queryClient = useQueryClient();

	const [typeFilter, setTypeFilter] = useState<"feedback" | "support">(
		"feedback",
	);
	const [statusFilter, setStatusFilter] = useState<"open" | "archived">("open");

	const { data, isLoading, error } = useQuery(
		convexQuery(api.adminFeedback.getAllFeedback, token ? { token } : "skip"),
	);

	const updateStatusMutation = useMutation({
		mutationFn: ({
			feedbackId,
			status,
		}: {
			feedbackId: Id<"feedback">;
			status: string;
		}) => {
			if (!token) {
				throw new Error("Not signed in");
			}
			return convex.mutation(api.adminFeedback.updateFeedbackStatus, {
				token,
				feedbackId,
				status,
			});
		},
		onSuccess: () => queryClient.invalidateQueries(),
	});

	const allFeedback = data?.feedback ?? [];
	const filteredByType = allFeedback.filter((item) => item.type === typeFilter);
	const feedback =
		statusFilter === "open"
			? filteredByType.filter((item) => item.status !== "archived")
			: filteredByType.filter((item) => item.status === "archived");
	const newCount = feedback.filter((item) => item.status === "new").length;

	return (
		<div className="stack">
			<div className="masthead">
				<div>
					<h1 className="display">
						{typeFilter === "feedback" ? "Feedback" : "Support"}
					</h1>
					<p className="lede">
						Messages people sent through the bot, newest first.
					</p>
				</div>
				{!isLoading && !error && (
					<div className="stamp">
						<b className="num">{feedback.length}</b> shown
						{statusFilter === "open" && newCount > 0 && (
							<>
								<br />
								{newCount} new
							</>
						)}
					</div>
				)}
			</div>

			<div className="toolbar split">
				<div className="chips">
					<button
						type="button"
						className="chip"
						aria-pressed={typeFilter === "feedback"}
						onClick={() => setTypeFilter("feedback")}
					>
						Feedback
					</button>
					<button
						type="button"
						className="chip"
						aria-pressed={typeFilter === "support"}
						onClick={() => setTypeFilter("support")}
					>
						Support
					</button>
				</div>
				<div className="chips">
					<button
						type="button"
						className="chip"
						aria-pressed={statusFilter === "open"}
						onClick={() => setStatusFilter("open")}
					>
						Open
					</button>
					<button
						type="button"
						className="chip"
						aria-pressed={statusFilter === "archived"}
						onClick={() => setStatusFilter("archived")}
					>
						Archived
					</button>
				</div>
			</div>

			{isLoading ? (
				<p className="muted">Loading feedback...</p>
			) : error ? (
				<p className="warn">Error loading feedback</p>
			) : feedback.length === 0 ? (
				<div className="empty">
					{typeFilter === "feedback"
						? "No feedback yet"
						: "No support messages yet"}
				</div>
			) : (
				<div>
					{feedback.map((item) => (
						<article
							key={item._id}
							className={`msg${item.status === "new" ? "fresh" : ""}${
								item.type === "support" ? "support" : ""
							}`}
						>
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
									<span className="msg-user">
										{item.user?.username ||
											item.user?.firstName ||
											"Unknown user"}
									</span>
								)}
								<span className="msg-meta">
									{item.user?.telegramChatId} · {formatDateTime(item.createdAt)}
								</span>
								{item.type === "support" && (
									<span className="intent">Support</span>
								)}
								{item.status === "new" && (
									<button
										type="button"
										className="btn btn-xs"
										onClick={() =>
											updateStatusMutation.mutate({
												feedbackId: item._id,
												status: "read",
											})
										}
										disabled={updateStatusMutation.isPending}
									>
										Mark read
									</button>
								)}
								{item.status === "read" && (
									<button
										type="button"
										className="btn btn-xs btn-quiet"
										onClick={() =>
											updateStatusMutation.mutate({
												feedbackId: item._id,
												status: "archived",
											})
										}
										disabled={updateStatusMutation.isPending}
									>
										Archive
									</button>
								)}
								{item.status === "archived" && (
									<span className="intent">Archived</span>
								)}
							</div>
							<p className="msg-text">{item.text}</p>
						</article>
					))}
				</div>
			)}
		</div>
	);
}
