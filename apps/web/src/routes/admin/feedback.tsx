import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-router/backend/convex/_generated/api";
import type { Id } from "@open-router/backend/convex/_generated/dataModel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useConvex } from "convex/react";

export const Route = createFileRoute("/admin/feedback")({
	component: FeedbackPage,
});

function FeedbackPage() {
	const { token } = useAdminAuth();
	const convex = useConvex();
	const queryClient = useQueryClient();

	const { data, isLoading, error } = useQuery(
		convexQuery(api.admin.getAllFeedback, token ? { token } : "skip"),
	);

	const updateStatusMutation = useMutation({
		mutationFn: ({
			feedbackId,
			status,
		}: { feedbackId: Id<"feedback">; status: string }) =>
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

	const feedback = data?.feedback ?? [];
	const newCount = feedback.filter((f) => f.status === "new").length;

	return (
		<div>
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-xl font-semibold">
					Feedback ({feedback.length})
					{newCount > 0 && (
						<span className="ml-2 rounded bg-blue-500 px-2 py-1 text-sm text-white">
							{newCount} new
						</span>
					)}
				</h1>
			</div>

			{feedback.length === 0 ? (
				<div className="text-muted-foreground py-12 text-center">
					No feedback yet
				</div>
			) : (
				<div className="space-y-4">
					{feedback.map((item) => (
						<div
							key={item._id}
							className={`rounded-lg border p-4 ${
								item.status === "new" ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : ""
							}`}
						>
							<div className="mb-3 flex items-start justify-between">
								<div>
									<div className="font-medium">
										{item.user?.username ||
											item.user?.firstName ||
											"Unknown User"}
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
