import { api } from "@open-voucher/backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/admin/checks")({
	component: ChecksPage,
});

function prettyJson(raw: string): string {
	try {
		return JSON.stringify(JSON.parse(raw), null, 2);
	} catch {
		return raw;
	}
}

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

function ChecksPage() {
	const { token } = useAdminAuth();
	const { results, status, loadMore } = usePaginatedQuery(
		api.dunnesVoucherDetails.listVoucherChecks,
		token ? { token } : "skip",
		{ initialNumItems: 20 },
	);

	const isLoading = status === "LoadingFirstPage";
	const isLoadingMore = status === "LoadingMore";

	return (
		<div className="stack">
			<div className="masthead">
				<div>
					<h1 className="display">Checks</h1>
					<p className="lede">Dunnes voucher lookups, newest first.</p>
				</div>
				{results.length > 0 && (
					<div className="stamp">
						<b className="num">{results.length}</b> loaded
					</div>
				)}
			</div>

			{isLoading ? (
				<p className="muted">Loading checks...</p>
			) : results.length === 0 ? (
				<div className="empty">No checks yet</div>
			) : (
				<div className="stack">
					{results.map((check) => (
						<article key={check._id} className="panel">
							<div className="panel-body">
								<div className="check-row">
									<div className="vmedia">
										{check.imageUrl ? (
											<img src={check.imageUrl} alt="Voucher" />
										) : (
											<span className="muted">No image</span>
										)}
									</div>
									<div>
										<div className="vhead">
											<h2 className="display vvalue num">
												{check.voucherType === null
													? "Missing"
													: `€${check.voucherType}`}
												<span>Voucher</span>
											</h2>
											{check.voucherStatus && (
												<span
													className={`status ${statusClass(check.voucherStatus)}`}
												>
													<i />
													{check.voucherStatus}
												</span>
											)}
										</div>
										<p className="vuploader">
											Checked by{" "}
											<Link
												to="/admin/users/$userId"
												params={{ userId: check.userId }}
											>
												<b>{check.userFirstName || check.userId}</b>
											</Link>
										</p>
										<dl className="ledger">
											<div>
												<dt>Voucher ID</dt>
												<dd className="mono">{check.voucherId}</dd>
											</div>
											{check.barcodeNumber && (
												<div>
													<dt>Barcode</dt>
													<dd className="mono">{check.barcodeNumber}</dd>
												</div>
											)}
											<div>
												<dt>Result</dt>
												<dd>{check.result}</dd>
											</div>
											<div>
												<dt>Checked</dt>
												<dd>{formatDateTime(check.createdAt)}</dd>
											</div>
										</dl>
									</div>
								</div>
								<pre className="payload">{prettyJson(check.rawJson)}</pre>
							</div>
						</article>
					))}
				</div>
			)}

			{(status === "CanLoadMore" || isLoadingMore) && (
				<div className="pager">
					<button
						type="button"
						className="btn"
						onClick={() => loadMore(20)}
						disabled={isLoadingMore}
					>
						{isLoadingMore ? "Loading..." : "Load 20 more"}
					</button>
				</div>
			)}
		</div>
	);
}
