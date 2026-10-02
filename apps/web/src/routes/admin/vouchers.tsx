import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { formatDate, formatDateTime } from "@/lib/utils";

import { api } from "@open-voucher/backend/convex/_generated/api";
import type { Id } from "@open-voucher/backend/convex/_generated/dataModel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvex, usePaginatedQuery } from "convex/react";
import { useRef, useState } from "react";

type DunnesDetails = {
	outcome: "not-configured" | "no-barcode" | "checked" | "error";
	label: string;
	response: unknown;
};

export const Route = createFileRoute("/admin/vouchers")({
	component: VouchersPage,
});

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

	if (isLoading) {
		return <div className="text-muted-foreground">Loading vouchers...</div>;
	}

	if (!results || results.length === 0) {
		return (
			<div className="text-muted-foreground py-12 text-center">
				No vouchers found
			</div>
		);
	}

	const handleLoadMore = () => {
		if (canLoadMore) {
			loadMore(50);
		}
	};

	return (
		<div>
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-xl font-semibold">
					All Vouchers
					{results.length > 0 && (
						<span className="text-muted-foreground text-base font-normal ml-2">
							(Showing {results.length})
						</span>
					)}
				</h1>
			</div>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{results.map((voucher) => (
					<div key={voucher._id} className="rounded-lg border p-4">
						{voucher.imageUrl ? (
							<img
								src={voucher.imageUrl}
								alt="Voucher"
								className="mb-3 h-96 w-full rounded border object-contain bg-muted"
							/>
						) : (
							<div className="bg-muted mb-3 flex h-96 w-full items-center justify-center rounded">
								<span className="text-muted-foreground text-xs">No image</span>
							</div>
						)}
						<div className="mb-3">
							<div className="mb-2 font-medium">€{voucher.type} Voucher</div>
							<div className="text-muted-foreground mb-1 text-xs font-mono">
								Voucher ID: {voucher._id}
							</div>
							<div className="text-muted-foreground mb-1 text-xs font-mono">
								Uploader:{" "}
								<Link
									to="/admin/users/$userId"
									params={{ userId: voucher.uploaderId }}
									className="text-primary hover:underline"
								>
									{voucher.uploaderFirstName || voucher.uploaderId}
								</Link>
							</div>
							{voucher.claimerId && (
								<div className="text-muted-foreground mb-1 text-xs font-mono">
									Claimer: {voucher.claimerId}
								</div>
							)}
							<div className="text-muted-foreground mb-1 text-sm">
								Status:{" "}
								<span
									className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
										voucher.status === "available"
											? "bg-green-100 text-green-800"
											: voucher.status === "claimed"
												? "bg-blue-100 text-blue-800"
												: voucher.status === "reported"
													? "bg-red-100 text-red-800"
													: voucher.status === "expired"
														? "bg-gray-100 text-gray-800"
														: "bg-yellow-100 text-yellow-800"
									}`}
								>
									{voucher.status}
								</span>
							</div>
							<div className="text-muted-foreground mb-1 text-sm">
								Expires {formatDate(voucher.expiryDate)}
							</div>
							<div className="text-muted-foreground text-sm">
								Uploaded {formatDateTime(voucher.createdAt)}
							</div>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => openDetails(voucher._id)}
						>
							Check
						</Button>
					</div>
				))}
			</div>
			{(canLoadMore || isLoadingMore) && (
				<div className="mt-6 flex justify-center">
					<Button
						onClick={handleLoadMore}
						disabled={isLoadingMore}
						variant="outline"
						size="lg"
					>
						{isLoadingMore ? "Loading..." : "Load More"}
					</Button>
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
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
			role="dialog"
			aria-label="Check"
			onKeyDown={(event) => {
				if (event.key === "Escape") onClose();
			}}
		>
			<div
				className="bg-background max-h-[85vh] w-full max-w-3xl overflow-auto rounded-lg border p-4 shadow-lg"
				tabIndex={-1}
				autoFocus
			>
				<div className="mb-4 flex items-center justify-between gap-4">
					<h2 className="text-lg font-semibold">Check</h2>
					<Button type="button" variant="outline" size="sm" onClick={onClose}>
						Close
					</Button>
				</div>
				{pending && (
					<p className="text-muted-foreground text-sm">Checking...</p>
				)}
				{details && (
					<div className="grid gap-4">
						<p className="text-sm">{details.label}</p>
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
			<h3 className="mb-2 text-sm font-medium">{title}</h3>
			<pre className="bg-muted overflow-auto rounded p-3 text-xs">
				{JSON.stringify(value, null, 2)}
			</pre>
		</section>
	);
}
