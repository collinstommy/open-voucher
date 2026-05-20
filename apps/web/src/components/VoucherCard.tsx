import type { MockVoucher } from "@/hooks/useUserAuth";
import { useState } from "react";

interface VoucherCardProps {
	voucher: MockVoucher;
	onReturn: (id: string) => void;
}

export function VoucherCard({ voucher, onReturn }: VoucherCardProps) {
	const [showConfirm, setShowConfirm] = useState(false);

	const typeLabel = `€${voucher.type}`;
	const expiresText = new Date(voucher.expiryDate).toLocaleDateString(
		"en-IE",
		{
			day: "numeric",
			month: "short",
		},
	);
	const claimedText = new Date(voucher.claimedAt).toLocaleDateString("en-IE", {
		day: "numeric",
		month: "short",
	});

	const refundAmount: Record<string, number> = {
		"5": 15,
		"10": 10,
		"20": 5,
	};

	return (
		<div className="border rounded-lg overflow-hidden">
			{/* Voucher image placeholder */}
			<div className="bg-muted aspect-[4/3] flex items-center justify-center">
				{voucher.imageUrl ? (
					<img
						src={voucher.imageUrl}
						alt={`€${voucher.type} voucher`}
						className="w-full h-full object-contain"
					/>
				) : (
					<div className="text-center text-muted-foreground">
						<div className="text-3xl mb-1">🎟️</div>
						<div className="text-sm">{typeLabel} Voucher</div>
					</div>
				)}
			</div>

			{/* Details */}
			<div className="p-3 space-y-2">
				<div className="flex items-center justify-between">
					<span className="inline-block px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-semibold">
						{typeLabel}
					</span>
					<span className="text-xs text-muted-foreground">
						Claimed {claimedText}
					</span>
				</div>
				<div className="text-xs text-muted-foreground">
					Expires {expiresText}
				</div>

				{!showConfirm ? (
					<button
						type="button"
						onClick={() => setShowConfirm(true)}
						className="w-full mt-2 px-3 py-1.5 text-sm border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
					>
						Return voucher
					</button>
				) : (
					<div className="mt-2 space-y-2">
						<p className="text-xs text-muted-foreground text-center">
							Return for +{refundAmount[voucher.type]} coins?
						</p>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => onReturn(voucher._id)}
								className="flex-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
							>
								Yes, return
							</button>
							<button
								type="button"
								onClick={() => setShowConfirm(false)}
								className="flex-1 px-3 py-1.5 text-sm border rounded-md hover:bg-muted transition-colors"
							>
								Cancel
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
