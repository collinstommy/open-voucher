import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/useAdminAuth";

import { api } from "@open-voucher/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";

export const Route = createFileRoute("/vouchers")({
	component: VouchersPage,
});

function VouchersPage() {
	const { token } = useAdminAuth();

	const { results, status, loadMore } = usePaginatedQuery(
		api.admin.getAllVouchers,
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
								Uploader: {voucher.uploaderId}
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
								Expires {new Date(voucher.expiryDate).toLocaleDateString()}
							</div>
							<div className="text-muted-foreground text-sm">
								Uploaded {new Date(voucher.createdAt).toLocaleString()}
							</div>
						</div>
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
		</div>
	);
}
