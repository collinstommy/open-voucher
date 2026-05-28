import { AppHeader } from "@/components/mini-app/AppHeader";
import { api } from "@open-voucher/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { createFileRoute } from "@tanstack/react-router";
import dayjs from "dayjs";

export const Route = createFileRoute("/app/my-claims")({
	component: MyClaimsPage,
});

function MyClaimsPage() {
	const claims = useQuery(api.vouchers.getMyClaimedVouchers);

	const returnVoucher = useMutation(api.vouchers.returnClaimedVoucher);

	const handleReturn = (
		item: NonNullable<typeof claims>[number],
	) => {
		const confirmed = window.confirm(
			`Return this voucher to the pool?\n\n€${item.type} · ${item.barcodeNumber}\n\nOnly return vouchers you have not used. You'll get ${item.coinValue} coins back.`,
		);
		if (confirmed) {
			returnVoucher({ voucherId: item._id });
		}
	};

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<AppHeader title="My Claims" />
			<div className="flex-1 overflow-auto bg-slate-50 p-4">
				{claims === undefined && (
					<p className="text-sm text-slate-500 text-center py-8">
						Loading...
					</p>
				)}
				{claims === null && (
					<p className="text-sm text-red-600 text-center py-8">
						Something went wrong
					</p>
				)}
				{claims && claims.length === 0 && (
					<p className="text-sm text-slate-500 text-center py-8">
						No claimed vouchers right now
					</p>
				)}
				{claims && claims.length > 0 && (
					<div className="space-y-3">
						{claims.map((v) => (
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
									<span className="inline-block text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
										Claimed
									</span>
									<div className="text-xs text-slate-500 space-y-0.5">
										{v.barcodeNumber && (
											<p className="font-mono">{v.barcodeNumber}</p>
										)}
										<p>
											Expires{" "}
											{dayjs(v.expiryDate).format("MMM D")}
										</p>
										<p>
											Claimed{" "}
											{dayjs(v.claimedAt).format("MMM D")}
										</p>
									</div>
									<button
										type="button"
										onClick={() => handleReturn(v)}
										className="w-full py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium active:bg-amber-100"
									>
										Return to pool
									</button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
