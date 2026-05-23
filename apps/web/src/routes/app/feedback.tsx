import { AppHeader } from "@/components/mini-app/AppHeader";
import { api } from "@open-voucher/backend/convex/_generated/api";
import { useConvex } from "convex/react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useUserAuth } from "@/hooks/useUserAuth";

export const Route = createFileRoute("/app/feedback")({
	component: FeedbackPage,
});

function FeedbackPage() {
	const { user } = useUserAuth();
	const convex = useConvex();
	const [text, setText] = useState("");

	const submit = useMutation({
		mutationFn: async (message: string) => {
			await convex.mutation(api.users.submitAppFeedback, {
				sessionToken: user!.sessionToken,
				text: message,
			});
		},
		onSuccess: () => {
			setText("");
			toast.success("Thanks for your feedback!");
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Failed to send feedback");
		},
	});

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<AppHeader variant="back" title="Feedback" />
			<div className="flex-1 overflow-auto bg-slate-50 p-4 flex flex-col gap-4">
				<p className="text-xs text-slate-500">
					We read every message. Share bugs, ideas, or praise.
				</p>
				<div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex-1 flex flex-col gap-3 min-h-[280px]">
					<textarea
						value={text}
						onChange={(e) => setText(e.target.value)}
						placeholder="What's on your mind?"
						maxLength={2000}
						className="flex-1 min-h-[140px] w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
					<button
						type="button"
						disabled={!text.trim() || submit.isPending}
						onClick={() => submit.mutate(text)}
						className="w-full py-3 bg-blue-600 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-full text-sm shadow-lg cursor-pointer"
					>
						{submit.isPending ? "Sending…" : "Send feedback"}
					</button>
				</div>
			</div>
		</div>
	);
}
