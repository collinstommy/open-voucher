import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-voucher/backend/convex/_generated/api";
import type { Id } from "@open-voucher/backend/convex/_generated/dataModel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export const Route = createFileRoute("/feedback")({
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
		convexQuery(api.admin.getAllFeedback, token ? { token } : "skip"),
	);

	const updateStatusMutation = useMutation({
		mutationFn: ({
			feedbackId,
			status,
		}: {
			feedbackId: Id<"feedback">;
			status: string;
		}) =>
			convex.mutation(api.admin.updateFeedbackStatus, {
				token: token!,
				feedbackId,
				status,
			}),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	if (isLoading) {
		return <div className="text-muted-foreground">Loading feedback...</div>;
	}

	if (error) {
		return <div className="text-red-500">Error loading feedback</div>;
	}

	const allFeedback = data?.feedback ?? [];
	const filteredByType = allFeedback.filter((f) => f.type === typeFilter);
	const feedback =
		statusFilter === "open"
			? filteredByType.filter((f) => f.status !== "archived")
			: filteredByType.filter((f) => f.status === "archived");

	const newCount = feedback.filter((f) => f.status === "new").length;

	return (
		<div>
			<div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<h1 className="font-semibold text-xl">
					{typeFilter === "feedback" ? "Feedback" : "Support"} (
					{feedback.length})
					{statusFilter === "open" && newCount > 0 && (
						<span className="ml-2 rounded bg-blue-500 px-2 py-1 text-sm text-white">
							{newCount} new
						</span>
					)}
				</h1>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
					<div className="flex items-center gap-2">
						<Button
							variant={typeFilter === "feedback" ? "default" : "outline"}
							size="sm"
							onClick={() => setTypeFilter("feedback")}
						>
							Feedback
						</Button>
						<Button
							variant={typeFilter === "support" ? "default" : "outline"}
							size="sm"
							onClick={() => setTypeFilter("support")}
						>
							Support
						</Button>
					</div>
					<select
						value={statusFilter}
						onChange={(e) =>
							setStatusFilter(e.target.value as "open" | "archived")
						}
						className="rounded border px-3 py-1.5 text-sm"
					>
						<option value="open">Open</option>
						<option value="archived">Archived</option>
					</select>
				</div>
			</div>

			{feedback.length === 0 ? (
				<div className="py-12 text-center text-muted-foreground">
					{typeFilter === "feedback"
						? "No feedback yet"
						: "No support messages yet"}
				</div>
			) : (
				<div className="space-y-4">
					{feedback.map((item) => (
						<div
							key={item._id}
							className={`rounded-lg border p-4 ${
								item.status === "new"
									? "border-blue-500 bg-blue-50 dark:bg-blue-950"
									: ""
							} ${
								item.type === "support"
									? "border-amber-200 bg-amber-50 dark:bg-amber-950/30"
									: ""
							}`}
						>
							<div className="mb-3 flex items-start justify-between">
								<div>
									<div className="flex items-center gap-2">
										{item.user?.id ? (
											<Link
												to="/users/$userId"
												params={{ userId: item.user.id }}
												className="font-medium hover:text-blue-600 hover:underline"
											>
												{item.user?.username ||
													item.user?.firstName ||
													"Unknown User"}
											</Link>
										) : (
											<span className="font-medium">
												{item.user?.username ||
													item.user?.firstName ||
													"Unknown User"}
											</span>
										)}
										{item.type === "support" && (
											<span className="rounded bg-amber-500 px-2 py-1 text-white text-xs">
												Support
											</span>
										)}
									</div>
									<div className="text-muted-foreground text-xs">
										{item.user?.telegramChatId} •{" "}
										{new Date(item.createdAt).toLocaleString()}
									</div>
								</div>
								<div className="flex gap-2">
									{item.status === "new" && (
										<Button
											variant="outline"
											size="sm"
											onClick={() =>
												updateStatusMutation.mutate({
													feedbackId: item._id,
													status: "read",
												})
											}
											disabled={updateStatusMutation.isPending}
										>
											Mark Read
										</Button>
									)}
									{item.status === "read" && (
										<Button
											variant="outline"
											size="sm"
											onClick={() =>
												updateStatusMutation.mutate({
													feedbackId: item._id,
													status: "archived",
												})
											}
											disabled={updateStatusMutation.isPending}
										>
											Archive
										</Button>
									)}
									{item.status === "archived" && (
										<span className="text-muted-foreground text-sm">
											Archived
										</span>
									)}
								</div>
							</div>
							<p className="whitespace-pre-wrap">{item.text}</p>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
