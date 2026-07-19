import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-voucher/backend/convex/_generated/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export const Route = createFileRoute("/admin/broadcast")({
	component: BroadcastPage,
});

type PreviewParams = {
	minClaims: number;
	withinDays: number;
};

function BroadcastPage() {
	const { token } = useAdminAuth();
	const convex = useConvex();
	const queryClient = useQueryClient();

	const [minClaims, setMinClaims] = useState("3");
	const [withinDays, setWithinDays] = useState("7");
	const [messageText, setMessageText] = useState("");
	const [previewParams, setPreviewParams] = useState<PreviewParams | null>(null);
	const [sendResult, setSendResult] = useState<{
		recipientCount: number;
		testMode: boolean;
	} | null>(null);
	const [sendError, setSendError] = useState<string | null>(null);

	const preview = useQuery(
		convexQuery(
			api.admin.broadcast.previewBroadcastAudience,
			token && previewParams
				? {
						token,
						minClaims: previewParams.minClaims,
						withinDays: previewParams.withinDays,
					}
				: "skip",
		),
	);

	const sendMutation = useMutation({
		mutationFn: (testMode: boolean) => {
			const parsedMinClaims = Number.parseInt(minClaims, 10);
			const parsedWithinDays = Number.parseInt(withinDays, 10);
			if (
				!Number.isFinite(parsedMinClaims) ||
				parsedMinClaims < 1 ||
				!Number.isFinite(parsedWithinDays) ||
				parsedWithinDays < 1
			) {
				throw new Error("Enter valid audience criteria before sending");
			}
			if (!messageText.trim()) {
				throw new Error("Message cannot be empty");
			}

			return convex.mutation(api.admin.broadcast.sendBroadcast, {
				token: token!,
				messageText: messageText.trim(),
				minClaims: parsedMinClaims,
				withinDays: parsedWithinDays,
				testMode,
			});
		},
		onSuccess: (data) => {
			setSendResult(data);
			setSendError(null);
			queryClient.invalidateQueries();
		},
		onError: (error) => {
			setSendResult(null);
			setSendError(
				error instanceof Error ? error.message : "Failed to send broadcast",
			);
		},
	});

	const handlePreview = () => {
		const parsedMinClaims = Number.parseInt(minClaims, 10);
		const parsedWithinDays = Number.parseInt(withinDays, 10);
		if (
			!Number.isFinite(parsedMinClaims) ||
			parsedMinClaims < 1 ||
			!Number.isFinite(parsedWithinDays) ||
			parsedWithinDays < 1
		) {
			return;
		}
		setPreviewParams({
			minClaims: parsedMinClaims,
			withinDays: parsedWithinDays,
		});
		setSendResult(null);
		setSendError(null);
	};

	const handleSendBroadcast = () => {
		if (!preview.data || preview.data.count === 0) return;
		const confirmed = window.confirm(
			`Send this message to ${preview.data.count} users? This cannot be undone.`,
		);
		if (!confirmed) return;
		sendMutation.mutate(false);
	};

	return (
		<div className="grid gap-6">
			<div>
				<h1 className="font-semibold text-xl">Broadcast</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					Send a Telegram message to users with recent claim activity.
				</p>
			</div>

			<section className="rounded-lg border p-4">
				<h2 className="mb-4 font-medium">Audience</h2>
				<p className="mb-4 text-muted-foreground text-sm">
					Users with at least the given number of claimed vouchers within the
					past number of days. Banned users are excluded.
				</p>
				<div className="flex flex-col gap-4 sm:flex-row sm:items-end">
					<label className="grid gap-1 text-sm">
						<span>Minimum claims</span>
						<input
							type="number"
							min={1}
							value={minClaims}
							onChange={(e) => setMinClaims(e.target.value)}
							className="w-full rounded border px-3 py-2 sm:w-32"
						/>
					</label>
					<label className="grid gap-1 text-sm">
						<span>Within days</span>
						<input
							type="number"
							min={1}
							value={withinDays}
							onChange={(e) => setWithinDays(e.target.value)}
							className="w-full rounded border px-3 py-2 sm:w-32"
						/>
					</label>
					<Button onClick={handlePreview} disabled={preview.isFetching}>
						{preview.isFetching ? "Loading..." : "Preview audience"}
					</Button>
				</div>

				{previewParams && preview.data && (
					<div className="mt-4 rounded-md border bg-muted/40 p-4">
						<p className="font-medium">
							{preview.data.count} user{preview.data.count === 1 ? "" : "s"}{" "}
							match
						</p>
						{preview.data.exceedsLimit && (
							<p className="mt-2 text-red-600 text-sm">
								Audience exceeds the 500-user limit. Narrow your criteria before
								sending.
							</p>
						)}
						{preview.data.sample.length > 0 && (
							<ul className="mt-3 space-y-1 text-sm">
								{preview.data.sample.map((user) => (
									<li key={user.userId}>
										<Link
											to="/admin/users/$userId"
											params={{ userId: user.userId }}
											className="text-blue-600 hover:underline"
										>
											{user.firstName || user.username || user.telegramChatId}
										</Link>
										<span className="text-muted-foreground">
											{" "}
											— {user.claimCount} claims
										</span>
									</li>
								))}
								{preview.data.count > preview.data.sample.length && (
									<li className="text-muted-foreground">
										…and {preview.data.count - preview.data.sample.length} more
									</li>
								)}
							</ul>
						)}
					</div>
				)}
			</section>

			<section className="rounded-lg border p-4">
				<h2 className="mb-4 font-medium">Message</h2>
				<p className="mb-4 text-muted-foreground text-sm">
					Telegram HTML formatting: <code>&lt;b&gt;bold&lt;/b&gt;</code>,{" "}
					<code>&lt;i&gt;italic&lt;/i&gt;</code>,{" "}
					<code>&lt;a href="https://..."&gt;link&lt;/a&gt;</code>. Blank lines
					are preserved. A standard footer and feedback button are appended
					automatically.
				</p>
				<textarea
					value={messageText}
					onChange={(e) => setMessageText(e.target.value)}
					rows={8}
					placeholder={"<b>Hello!</b>\n\nCheck out <a href=\"https://example.com\">this link</a>."}
					className="w-full rounded border px-3 py-2 font-mono text-sm"
				/>
			</section>

			<section className="rounded-lg border p-4">
				<h2 className="mb-4 font-medium">Send</h2>
				<div className="flex flex-col gap-3 sm:flex-row">
					<Button
						variant="outline"
						onClick={() => sendMutation.mutate(true)}
						disabled={sendMutation.isPending || !messageText.trim()}
					>
						{sendMutation.isPending ? "Sending..." : "Send test to me"}
					</Button>
					<Button
						onClick={handleSendBroadcast}
						disabled={
							sendMutation.isPending ||
							!messageText.trim() ||
							!preview.data ||
							preview.data.count === 0 ||
							preview.data.exceedsLimit
						}
					>
						Send to audience
					</Button>
				</div>
				<p className="mt-3 text-muted-foreground text-sm">
					Test mode sends only to your Telegram account. Preview the audience
					before broadcasting.
				</p>

				{sendResult && (
					<p className="mt-3 text-green-700 text-sm">
						Queued{" "}
						{sendResult.testMode
							? "test message to your account"
							: `broadcast to ${sendResult.recipientCount} users`}
						.
					</p>
				)}
				{sendError && (
					<p className="mt-3 text-red-600 text-sm">{sendError}</p>
				)}
			</section>
		</div>
	);
}
