import { AppHeader } from "@/components/mini-app/AppHeader";
import { api } from "@open-voucher/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { createFileRoute } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/feedback")({
	component: FeedbackPage,
});

type ThreadItem = FunctionReturnType<
	typeof api.users.getFeedbackThread
>[number];

function MessageBubble({ item }: { item: ThreadItem }) {
	const isUser = item.kind === "user";

	return (
		<div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
			<div
				className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
					isUser
						? "rounded-br-md bg-blue-600 text-white"
						: "rounded-bl-md border border-slate-200 bg-white text-slate-900"
				}`}
			>
				{!isUser && (
					<p className="mb-1 text-[11px] font-medium text-blue-600">
						Tom at Open Vouchers
					</p>
				)}
				<p className="whitespace-pre-wrap text-sm leading-relaxed">{item.text}</p>
				<p
					className={`mt-1.5 text-[10px] ${
						isUser ? "text-blue-100" : "text-slate-400"
					}`}
				>
					{dayjs(item.createdAt).format("MMM D, HH:mm")}
				</p>
			</div>
		</div>
	);
}

function FeedbackPage() {
	const [text, setText] = useState("");
	const [isSending, setIsSending] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);
	const thread = useQuery(api.users.getFeedbackThread);
	const submit = useMutation(api.users.submitAppFeedback);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [thread]);

	const handleSubmit = async () => {
		const trimmed = text.trim();
		if (!trimmed || isSending) return;

		setIsSending(true);
		try {
			await submit({ text: trimmed });
			setText("");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to send feedback");
		} finally {
			setIsSending(false);
		}
	};

	return (
		<div className="flex h-dvh flex-col overflow-hidden">
			<AppHeader title="Feedback" />
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50">
				<div className="shrink-0 border-b border-slate-200 bg-white px-4 py-2.5">
					<p className="text-xs text-slate-500">
						Message the team — we read everything. For claim or upload issues,
						use the report flow in the bot.
					</p>
				</div>

				<div
					ref={scrollRef}
					className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
				>
					{thread === undefined && (
						<p className="py-8 text-center text-sm text-slate-500">Loading...</p>
					)}
					{thread !== undefined && thread.length === 0 && (
						<div className="flex flex-col items-center justify-center px-6 py-16 text-center">
							<p className="text-sm font-medium text-slate-700">No messages yet</p>
							<p className="mt-1 text-xs text-slate-500">
								Share bugs, ideas, or praise. Replies appear here — we may also
								notify you in Telegram.
							</p>
						</div>
					)}
					{thread?.map((item) => (
						<MessageBubble key={`${item.kind}-${item.id}`} item={item} />
					))}
				</div>

				<div className="shrink-0 border-t border-slate-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
					<div className="flex items-end gap-2">
						<textarea
							value={text}
							onChange={(e) => setText(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									void handleSubmit();
								}
							}}
							placeholder="Write a message..."
							maxLength={2000}
							rows={2}
							className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
						<button
							type="button"
							disabled={!text.trim() || isSending}
							onClick={() => void handleSubmit()}
							className="shrink-0 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
						>
							Send
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
