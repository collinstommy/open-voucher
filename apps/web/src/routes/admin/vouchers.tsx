import { api } from "@open-voucher/backend/convex/_generated/api";
import type { Id } from "@open-voucher/backend/convex/_generated/dataModel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvex, usePaginatedQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { formatDate, formatDateTime } from "@/lib/utils";

type DunnesDetails = {
	outcome: "not-configured" | "no-barcode" | "checked" | "error";
	label: string;
	response: unknown;
};

export const Route = createFileRoute("/admin/vouchers")({
	component: VouchersPage,
});

function statusClass(status: string) {
	switch (status) {
		case "available":
			return "s-available";
		case "claimed":
			return "s-claimed";
		case "reported":
			return "s-reported";
		default:
			return "";
	}
}

function VouchersPage() {
	const { token } = useAdminAuth();
	const convex = useConvex();
	const [detailsId, setDetailsId] = useState<Id<"vouchers"> | null>(null);
	const [detailsPending, setDetailsPending] = useState(false);
	const [details, setDetails] = useState<DunnesDetails | null>(null);
	const detailsRequest = useRef(0);

	const openDetails = async (voucherId: Id<"vouchers">) => {
		if (!token) return;
		const request = detailsRequest.current + 1;
		detailsRequest.current = request;
		setDetailsId(voucherId);
		setDetails(null);
		setDetailsPending(true);
		try {
			const result = await convex.action(
				api.dunnesVoucherDetails.getVoucherDetails,
				{
					token,
					voucherId,
				},
			);
			if (detailsRequest.current !== request) return;
			console.log("dunnes voucher details", result);
			setDetails(result);
		} catch (error) {
			if (detailsRequest.current !== request) return;
			const result: DunnesDetails = {
				outcome: "error",
				label: error instanceof Error ? error.message : "Dunnes request failed",
				response: null,
			};
			console.log("dunnes voucher details", result);
			setDetails(result);
		} finally {
			if (detailsRequest.current === request) setDetailsPending(false);
		}
	};

	const { results, status, loadMore } = usePaginatedQuery(
		api.adminVouchers.getAllVouchers,
		token ? { token } : "skip",
		{ initialNumItems: 50 },
	);

	const isLoading = status === "LoadingFirstPage";
	const canLoadMore = status === "CanLoadMore";
	const isLoadingMore = status === "LoadingMore";

	const handleLoadMore = () => {
		if (canLoadMore) {
			loadMore(50);
		}
	};

	return (
		<div>
			<div className="masthead">
				<div>
					<h1 className="display">Vouchers</h1>
					<p className="lede">
						Every voucher uploaded through the bot, newest first.
					</p>
				</div>
				{results.length > 0 && (
					<div className="stamp">
						<b className="num">{results.length}</b> loaded
					</div>
				)}
			</div>

			{isLoading ? (
				<p className="muted">Loading vouchers...</p>
			) : results.length === 0 ? (
				<div className="empty">No vouchers found</div>
			) : (
				<div className="grid">
					{results.map((voucher) => (
						<article key={voucher._id} className="vcard">
							<div className="vmedia">
								{voucher.imageUrl ? (
									<img src={voucher.imageUrl} alt="Voucher" />
								) : (
									<span className="muted">No image</span>
								)}
							</div>
							<div className="vbody">
								<div className="vhead">
									<h2 className="display vvalue num">
										€{voucher.type}
										<span>Voucher</span>
									</h2>
									<span className={`status ${statusClass(voucher.status)}`}>
										<i />
										{voucher.status}
									</span>
								</div>
								<p className="vuploader">
									Uploaded by{" "}
									<Link
										to="/admin/users/$userId"
										params={{ userId: voucher.uploaderId }}
									>
										<b>{voucher.uploaderFirstName || voucher.uploaderId}</b>
									</Link>
								</p>
								<dl className="ledger">
									<div>
										<dt>Voucher ID</dt>
										<dd className="mono">{voucher._id}</dd>
									</div>
									{voucher.claimerId && (
										<div>
											<dt>Claimer</dt>
											<dd className="mono">{voucher.claimerId}</dd>
										</div>
									)}
									<div>
										<dt>Expires</dt>
										<dd>{formatDate(voucher.expiryDate)}</dd>
									</div>
									<div>
										<dt>Uploaded</dt>
										<dd>{formatDateTime(voucher.createdAt)}</dd>
									</div>
								</dl>
								<div className="vactions">
									<button
										type="button"
										className="btn"
										onClick={() => openDetails(voucher._id)}
									>
										Check
									</button>
								</div>
							</div>
						</article>
					))}
				</div>
			)}

			{(canLoadMore || isLoadingMore) && (
				<div className="pager">
					<button
						type="button"
						className="btn"
						onClick={handleLoadMore}
						disabled={isLoadingMore}
					>
						{isLoadingMore ? "Loading..." : "Load 50 more"}
					</button>
				</div>
			)}

			{detailsId && (
				<DunnesDetailsDialog
					pending={detailsPending}
					details={details}
					onClose={() => {
						setDetailsId(null);
						setDetails(null);
					}}
				/>
			)}
		</div>
	);
}

function DunnesDetailsDialog({
	pending,
	details,
	onClose,
}: {
	pending: boolean;
	details: DunnesDetails | null;
	onClose: () => void;
}) {
	const dialogRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		dialogRef.current?.focus();
	}, []);

	return (
		<div
			className="dialog-scrim"
			role="dialog"
			aria-label="Check"
			onKeyDown={(event) => {
				if (event.key === "Escape") onClose();
			}}
		>
			<div className="dialog" tabIndex={-1} ref={dialogRef}>
				<div className="dialog-head">
					<h2>Check</h2>
					<button type="button" className="btn btn-quiet" onClick={onClose}>
						Close
					</button>
				</div>
				{pending && <p className="muted">Checking...</p>}
				{details && (
					<div className="stack">
						<p>{details.label}</p>
						{details.outcome === "checked" && (
							<Payload title="LinkVoucher" value={details.response} />
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function Payload({ title, value }: { title: string; value: unknown }) {
	return (
		<section>
			<p className="eyebrow" style={{ marginBottom: 8 }}>
				{title}
			</p>
			<pre className="payload">{JSON.stringify(value, null, 2)}</pre>
		</section>
	);
}
