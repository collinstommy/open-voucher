import { AppHeader } from "@/components/mini-app/AppHeader";
import { api } from "@open-voucher/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { createFileRoute } from "@tanstack/react-router";
import dayjs from "dayjs";

export const Route = createFileRoute("/app/my-uploads")({
	component: MyUploadsPage,
});

function MyUploadsPage() {
	const uploads = useQuery(api.vouchers.getMyAvailableUploads);

	const invalidate = useMutation(api.vouchers.invalidateMyUpload);

	const handleInvalidate = (
		item: NonNullable<typeof uploads>[number],
	) => {
		const confirmed = window.confirm(
			`Mark this voucher as already used?\n\n€${item.type} voucher: ${item.barcodeNumber}\n\nThis will remove it from the pool and deduct ${item.coinValue} coins from your balance.`,
		);
		if (confirmed) {
			invalidate({ voucherId: item._id });
		}
	};

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<AppHeader title="My Uploads" />
			<div className="flex-1 overflow-auto bg-slate-50 p-4">
				{uploads === undefined && (
					<p className="text-sm text-slate-500 text-center py-8">
						Loading...
					</p>
				)}
				{uploads === null && (
					<p className="text-sm text-red-600 text-center py-8">
						Something went wrong
					</p>
				)}
				{uploads && uploads.length === 0 && (
					<p className="text-sm text-slate-500 text-center py-8">
						No vouchers in the pool right now
					</p>
				)}
				{uploads && uploads.length > 0 && (
					<div className="space-y-3">
						{uploads.map((v) => {
							const isAvailable = v.status === "available";
							return (
								<div
									key={v._id}
									className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
								>
									{v.imageUrl && (
										<img
											src={v.imageUrl}
											alt={`€${v.type} voucher`}
											className="w-full object-contain"
										/>
									)}
									<div className="p-3 space-y-2">
										<div className="flex items-center justify-between">
											<span className="text-sm font-semibold text-slate-700">
												€{v.type} voucher
											</span>
											<span className="text-xs text-slate-400">
												{v.coinValue} coins
											</span>
										</div>
										{isAvailable ? (
											<span className="inline-block text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
												Available in pool
											</span>
										) : (
											<span className="inline-block text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
												Marked as used
											</span>
										)}
										<div className="text-xs text-slate-500 space-y-0.5">
											{v.barcodeNumber && (
												<p className="font-mono">{v.barcodeNumber}</p>
											)}
											<p>
												Expires{" "}
												{dayjs(v.expiryDate).format("MMM D")}
											</p>
											<p>
												Uploaded{" "}
												{dayjs(v.createdAt).format("MMM D")}
											</p>
										</div>
										{isAvailable && (
											<button
												type="button"
												onClick={() => handleInvalidate(v)}
												className="w-full py-2 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm font-medium active:bg-red-100"
											>
												I used this
											</button>
										)}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
