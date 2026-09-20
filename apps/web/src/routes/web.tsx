// Throwaway web voucher-upload tester. Drives live #82 APIs
// (generateUploadUrl → POST storage → submitUpload → getUpload).
// Park or delete once the app absorbs this flow.

import { api } from "@open-voucher/backend/convex/_generated/api";
import type { Id } from "@open-voucher/backend/convex/_generated/dataModel";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { type FormEvent, useRef, useState } from "react";
import { useJwtAuth } from "@/auth/JwtAuthProvider";
import { getDeployment } from "@/components/EnvironmentDropdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useUserAuth } from "@/hooks/useUserAuth";
import { CONVEX_SITE_URLS } from "@/lib/convexConfig";

export const Route = createFileRoute("/web")({
	beforeLoad: () => {
		if (!import.meta.env.DEV && import.meta.env.VITE_DEPLOYMENT !== "dev") {
			throw notFound();
		}
	},
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Web upload tester - Open Vouchers" },
		],
	}),
	component: WebUploadTester,
});

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
	try {
		const payload = jwt.split(".")[1];
		if (!payload) return null;
		const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
		return JSON.parse(atob(padded)) as Record<string, unknown>;
	} catch {
		return null;
	}
}

type DailyLimitResult = { accepted: false; reason: "daily_limit" };

function WebUploadTester() {
	const { jwt, setJwt } = useJwtAuth();
	const { user, isLoading, error } = useUserAuth();
	const generateUploadUrl = useMutation(api.vouchers.generateUploadUrl);
	const submitUpload = useMutation(api.vouchers.submitUpload);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [file, setFile] = useState<File | null>(null);
	const [busy, setBusy] = useState(false);
	const [step, setStep] = useState<string | null>(null);
	const [uploadId, setUploadId] = useState<Id<"uploads"> | null>(null);
	const [dailyLimit, setDailyLimit] = useState<DailyLimitResult | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [mintBusy, setMintBusy] = useState(false);

	const upload = useQuery(
		api.vouchers.getUpload,
		uploadId ? { uploadId } : "skip",
	);

	const jwtPayload = jwt ? decodeJwtPayload(jwt) : null;
	const jwtClient =
		typeof jwtPayload?.client === "string" ? jwtPayload.client : null;

	async function mintWebJwt() {
		setMintBusy(true);
		setSubmitError(null);
		try {
			const res = await fetch(
				`${CONVEX_SITE_URLS[getDeployment()]}/api/dev-auth`,
				{
					method: "POST",
					headers: { "X-OpenVoucher-Client": "web" },
				},
			);
			const data = (await res.json()) as { jwt?: string; error?: string };
			if (!res.ok || typeof data.jwt !== "string") {
				throw new Error(data.error ?? "Dev auth failed");
			}
			setJwt(data.jwt);
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : String(err));
		} finally {
			setMintBusy(false);
		}
	}

	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		if (!file || busy) return;

		setBusy(true);
		setSubmitError(null);
		setDailyLimit(null);
		setUploadId(null);
		try {
			setStep("generateUploadUrl");
			const postUrl = await generateUploadUrl({});

			setStep("POST storage");
			const posted = await fetch(postUrl, {
				method: "POST",
				headers: { "Content-Type": file.type || "application/octet-stream" },
				body: file,
			});
			if (!posted.ok) {
				throw new Error(`Storage POST failed: ${posted.status}`);
			}
			const postedJson = (await posted.json()) as { storageId?: string };
			if (!postedJson.storageId) {
				throw new Error("Storage POST returned no storageId");
			}

			setStep("submitUpload");
			const result = await submitUpload({
				imageStorageId: postedJson.storageId as Id<"_storage">,
			});
			if (!result.accepted) {
				setDailyLimit(result);
				setStep(null);
				return;
			}
			setUploadId(result.uploadId);
			setStep(null);
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : String(err));
			setStep(null);
		} finally {
			setBusy(false);
		}
	}

	function reset() {
		setFile(null);
		setBusy(false);
		setStep(null);
		setUploadId(null);
		setDailyLimit(null);
		setSubmitError(null);
		if (fileInputRef.current) fileInputRef.current.value = "";
	}

	return (
		<div className="min-h-screen space-y-6 bg-zinc-950 p-6 font-mono text-sm text-zinc-100">
			<header className="space-y-1">
				<h1 className="font-bold text-lg">Web upload tester</h1>
				<p className="text-zinc-400">
					JWT app client → generateUploadUrl → POST bytes → submitUpload →
					useQuery getUpload(uploadId). No outbox, no latest-upload guess.
				</p>
			</header>

			<Card className="border-zinc-800 bg-zinc-900">
				<CardContent className="space-y-3 p-6">
					<p className="text-zinc-400">Auth</p>
					{isLoading && <p className="text-zinc-500">Bootstrapping JWT…</p>}
					{error && (
						<p className="text-red-400">
							{error instanceof Error ? error.message : String(error)}
						</p>
					)}
					{!isLoading && !error && !user && (
						<p className="text-amber-400">
							Not signed in. On localhost, /api/dev-auth should mint a JWT with
							X-OpenVoucher-Client: web.
						</p>
					)}
					{user && (
						<pre className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 p-3">
							{JSON.stringify(
								{
									userId: user._id,
									coins: user.coins,
									jwtClient,
									telegramChatId: user.telegramChatId ?? null,
								},
								null,
								2,
							)}
						</pre>
					)}
					{jwtClient &&
						jwtClient !== "web" &&
						jwtClient !== "android" &&
						jwtClient !== "ios" && (
							<p className="text-amber-400">
								JWT client is {jwtClient}. submitUpload requires an app client
								(web / android / ios), not telegram.
							</p>
						)}
					{(!jwt || jwtClient !== "web") && (
						<Button
							type="button"
							variant="outline"
							onClick={() => void mintWebJwt()}
							disabled={mintBusy}
						>
							{mintBusy ? "Minting…" : "Mint web JWT via /api/dev-auth"}
						</Button>
					)}
				</CardContent>
			</Card>

			<Card className="border-zinc-800 bg-zinc-900">
				<CardContent className="space-y-4 p-6">
					<form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
						<label className="block space-y-2">
							<span className="text-zinc-400">Voucher image</span>
							<input
								ref={fileInputRef}
								type="file"
								accept="image/*"
								className="block w-full text-zinc-200 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-zinc-100"
								onChange={(event) => {
									setFile(event.target.files?.[0] ?? null);
									setDailyLimit(null);
									setUploadId(null);
									setSubmitError(null);
								}}
								disabled={busy}
							/>
						</label>
						<div className="flex gap-2">
							<Button type="submit" disabled={!file || busy || !user}>
								{busy ? (step ?? "Uploading…") : "Upload"}
							</Button>
							<Button type="button" variant="outline" onClick={reset}>
								Reset
							</Button>
						</div>
					</form>

					{dailyLimit && (
						<div className="space-y-1">
							<p className="text-amber-400">Daily limit — no uploads row</p>
							<pre className="overflow-x-auto rounded-md border border-amber-900 bg-zinc-950 p-3">
								{JSON.stringify(dailyLimit, null, 2)}
							</pre>
						</div>
					)}

					{submitError && <p className="text-red-400">{submitError}</p>}

					{uploadId && (
						<div className="space-y-2">
							<p className="text-zinc-400">Waiting on uploadId {uploadId}</p>
							{upload === undefined && (
								<p className="text-zinc-500">processing…</p>
							)}
							{upload === null && (
								<p className="text-red-400">
									getUpload returned null (missing or other user)
								</p>
							)}
							{upload?.status === "processing" && (
								<p className="text-zinc-500">status: processing</p>
							)}
							{upload?.status === "succeeded" && (
								<div className="space-y-2 text-green-400">
									<p>status: succeeded</p>
									<p>voucherId: {upload.voucherId}</p>
									{upload.voucherId && (
										<a
											href="/app/my-uploads"
											className="text-blue-400 underline"
										>
											Open my uploads
										</a>
									)}
								</div>
							)}
							{upload?.status === "failed" && (
								<div className="space-y-1 text-red-400">
									<p>status: failed</p>
									<p>failureReason: {upload.failureReason}</p>
									<p>message: {upload.message}</p>
								</div>
							)}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
