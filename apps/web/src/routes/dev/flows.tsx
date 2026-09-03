// Stage-4 flows tester: temporary dev-only page driving the real app
// wrappers (upload/claim/report) plus the notificationOutbox inspector.
// Test instrument — park or delete once the stage-3 app absorbs the flows.
//
// Session: reuses auth like any app page (JwtAuthProvider + dev-auth on
// localhost). To act as a chatless Google user, paste the JWT from the
// stage-2 auth tester (/auth-tester) into the session box below.
// In production builds this route renders nothing and fires no requests.

import { api } from "@open-voucher/backend/convex/_generated/api";
import { useJwtAuth } from "@/auth/JwtAuthProvider";
import { useUserAuth } from "@/hooks/useUserAuth";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/dev/flows")({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Flows Tester - Open Vouchers" },
		],
	}),
	component: FlowsTester,
});

const IS_DEV = import.meta.env.DEV;

interface LogEntry {
	id: number;
	label: string;
	body: string;
}

type ClaimType = "5" | "10" | "20";

function FlowsTester() {
	const { user, isLoading: userLoading } = useUserAuth();
	const { setJwt } = useJwtAuth();
	const [jwtInput, setJwtInput] = useState("");
	const [log, setLog] = useState<LogEntry[]>([]);
	const [busy, setBusy] = useState(false);
	const logId = useRef(0);

	const availability = useQuery(
		api.vouchers.getVoucherAvailability,
		!IS_DEV || !user ? "skip" : {},
	);
	const claims = useQuery(
		api.vouchers.getMyClaimedVouchers,
		!IS_DEV || !user ? "skip" : {},
	);
	const notifications = useQuery(
		api.notifications.getMyNotifications,
		!IS_DEV || !user ? "skip" : {},
	);

	const generateUploadUrl = useMutation(api.vouchers.generateVoucherUploadUrl);
	const uploadVoucher = useMutation(api.vouchers.uploadVoucherFromApp);
	const claimVoucher = useMutation(api.vouchers.claimVoucherFromApp);
	const reportVoucher = useMutation(api.vouchers.reportVoucherFromApp);
	const markRead = useMutation(api.notifications.markNotificationRead);

	function appendLog(label: string, body: unknown) {
		logId.current += 1;
		const text =
			typeof body === "string" ? body : JSON.stringify(body, null, 2);
		setLog((entries) => [{ id: logId.current, label, body: text }, ...entries]);
	}

	if (!IS_DEV) {
		return (
			<div className="min-h-screen bg-zinc-950 p-6 font-mono text-sm text-zinc-100">
				<p className="text-zinc-400">
					Flows tester is only available in development builds.
				</p>
			</div>
		);
	}

	async function handleUpload(file: File) {
		setBusy(true);
		try {
			const uploadUrl = await generateUploadUrl({});
			const res = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": file.type || "image/jpeg" },
				body: file,
			});
			const { storageId } = (await res.json()) as { storageId: string };
			appendLog("POST uploadUrl", { status: res.status, storageId });
			const result = await uploadVoucher({
				imageStorageId: storageId as never,
			});
			appendLog("uploadVoucherFromApp", result);
		} catch (error) {
			appendLog(
				"uploadVoucherFromApp",
				`error: ${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setBusy(false);
		}
	}

	async function handleClaim(type: ClaimType) {
		setBusy(true);
		try {
			const result = await claimVoucher({ type });
			appendLog(`claimVoucherFromApp {type: ${type}}`, result);
		} catch (error) {
			appendLog(
				`claimVoucherFromApp {type: ${type}}`,
				`error: ${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setBusy(false);
		}
	}

	async function handleReport(voucherId: string) {
		setBusy(true);
		try {
			const result = await reportVoucher({ voucherId: voucherId as never });
			appendLog("reportVoucherFromApp", result);
		} catch (error) {
			appendLog(
				"reportVoucherFromApp",
				`error: ${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setBusy(false);
		}
	}

	async function handleMarkRead(notificationId: string) {
		try {
			await markRead({ notificationId: notificationId as never });
		} catch (error) {
			appendLog(
				"markNotificationRead",
				`error: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	return (
		<div className="min-h-screen space-y-6 bg-zinc-950 p-6 font-mono text-sm text-zinc-100">
			<header className="space-y-1">
				<h1 className="font-bold text-lg">Flows tester · stage 4</h1>
				<p className="text-zinc-400">
					Public upload/claim/report wrappers + outbox inspector. Dev only.
				</p>
			</header>

			<Card className="border-zinc-800 bg-zinc-900">
				<CardContent className="space-y-3 p-6">
					<h2 className="font-bold text-zinc-200">Session</h2>
					{userLoading && <p className="text-zinc-500">Loading user...</p>}
					{!userLoading && user && (
						<pre className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 p-3">
							{JSON.stringify(
								{
									_id: user._id,
									telegramChatId: user.telegramChatId ?? null,
									coins: user.coins,
									isBanned: user.isBanned,
								},
								null,
								2,
							)}
						</pre>
					)}
					{!userLoading && !user && (
						<p className="text-amber-400">
							Not signed in. On localhost dev-auth signs in automatically; to
							act as a chatless Google user, paste a JWT from /auth-tester.
						</p>
					)}
					<div className="flex gap-2">
						<Input
							value={jwtInput}
							onChange={(event) => setJwtInput(event.target.value)}
							placeholder="paste session JWT to switch identity"
							className="border-zinc-800 bg-zinc-950 font-mono"
						/>
						<Button
							onClick={() => {
								if (jwtInput.trim()) {
									setJwt(jwtInput.trim());
									setJwtInput("");
								}
							}}
							disabled={jwtInput.trim().length === 0}
						>
							Use JWT
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card className="border-zinc-800 bg-zinc-900">
				<CardContent className="space-y-3 p-6">
					<h2 className="font-bold text-zinc-200">Upload</h2>
					<p className="text-zinc-400">
						Available:{" "}
						{availability === undefined
							? "…"
							: `€5×${availability["5"]} €10×${availability["10"]} €20×${availability["20"]}`}
					</p>
					<Input
						type="file"
						accept="image/*"
						disabled={busy || !user}
						className="border-zinc-800 bg-zinc-950"
						onChange={(event) => {
							const file = event.target.files?.[0];
							event.target.value = "";
							if (file) void handleUpload(file);
						}}
					/>
					<p className="text-xs text-zinc-500">
						Posts bytes to a storage URL, then calls uploadVoucherFromApp (OCR
						runs async; the result lands here in the outbox for chatless users,
						in Telegram for linked users).
					</p>
				</CardContent>
			</Card>

			<Card className="border-zinc-800 bg-zinc-900">
				<CardContent className="space-y-3 p-6">
					<h2 className="font-bold text-zinc-200">Claim</h2>
					<div className="flex gap-2">
						{(["5", "10", "20"] as const).map((type) => (
							<Button
								key={type}
								onClick={() => void handleClaim(type)}
								disabled={busy || !user}
							>
								Claim €{type}
							</Button>
						))}
					</div>
				</CardContent>
			</Card>

			<Card className="border-zinc-800 bg-zinc-900">
				<CardContent className="space-y-3 p-6">
					<h2 className="font-bold text-zinc-200">Report</h2>
					{claims === undefined && (
						<p className="text-zinc-500">Loading claims...</p>
					)}
					{claims?.length === 0 && (
						<p className="text-zinc-500">No active claims to report.</p>
					)}
					{claims?.map((v) => (
						<div
							key={v._id}
							className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3"
						>
							<span className="text-zinc-300">
								€{v.type} · {v.barcodeNumber ?? "no barcode"}
							</span>
							<Button
								variant="outline"
								onClick={() => void handleReport(v._id)}
								disabled={busy}
							>
								Report not working
							</Button>
						</div>
					))}
				</CardContent>
			</Card>

			<Card className="border-zinc-800 bg-zinc-900">
				<CardContent className="space-y-3 p-6">
					<h2 className="font-bold text-zinc-200">
						Outbox inspector (first reader)
					</h2>
					{notifications === undefined && (
						<p className="text-zinc-500">Loading notifications...</p>
					)}
					{notifications?.length === 0 && (
						<p className="text-zinc-500">
							No outbox rows. Linked users get Telegram sends instead — by
							design nothing lands here for them.
						</p>
					)}
					{notifications?.map((n) => (
						<div
							key={n._id}
							className="space-y-1 rounded-md border border-zinc-800 bg-zinc-950 p-3"
						>
							<div className="flex items-center justify-between gap-3">
								<span className="text-green-400">{n.kind}</span>
								<span className="text-xs text-zinc-500">
									{new Date(n._creationTime).toLocaleString()}
									{n.readAt
										? ` · read ${new Date(n.readAt).toLocaleString()}`
										: " · unread"}
								</span>
							</div>
							<pre className="overflow-x-auto whitespace-pre-wrap text-zinc-300">
								{n.payload.text}
							</pre>
							{n.payload.data !== undefined && (
								<details>
									<summary className="cursor-pointer text-zinc-500">
										data
									</summary>
									<pre className="overflow-x-auto text-zinc-400">
										{JSON.stringify(n.payload.data, null, 2)}
									</pre>
								</details>
							)}
							{n.readAt === undefined && (
								<Button
									variant="outline"
									onClick={() => void handleMarkRead(n._id)}
								>
									Mark read
								</Button>
							)}
						</div>
					))}
				</CardContent>
			</Card>

			<section className="space-y-2">
				<h2 className="text-zinc-400">Response log (newest first)</h2>
				{log.length === 0 && <p className="text-zinc-600">No requests yet.</p>}
				{log.map((entry) => (
					<details
						key={entry.id}
						open
						className="rounded-md border border-zinc-800 bg-zinc-900"
					>
						<summary className="cursor-pointer px-3 py-2 text-green-400">
							{entry.label}
						</summary>
						<pre className="overflow-x-auto px-3 pb-3 text-zinc-300">
							{entry.body}
						</pre>
					</details>
				))}
			</section>
		</div>
	);
}
