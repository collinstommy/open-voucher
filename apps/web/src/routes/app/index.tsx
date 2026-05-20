import { VoucherCard } from "@/components/VoucherCard";
import { MOCK_VOUCHERS, useUserAuth } from "@/hooks/useUserAuth";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/app/")({
	component: AppIndex,
});

function AppIndex() {
	const { user, devMode } = useUserAuth();
	const [vouchers, setVouchers] = useState(
		devMode ? MOCK_VOUCHERS : [],
	);

	const handleReturn = (id: string) => {
		setVouchers((prev) => prev.filter((v) => v._id !== id));
	};

	// Not in dev mode and no real backend → show placeholder
	if (!devMode && vouchers.length === 0 && user) {
		return (
			<div className="px-4 py-8 text-center text-muted-foreground">
				<p>You haven&apos;t claimed any vouchers yet.</p>
				<p className="mt-2 text-sm">
					Open the Telegram bot to upload and claim vouchers.
				</p>
			</div>
		);
	}

	if (vouchers.length === 0) {
		return (
			<div className="px-4 py-8 text-center text-muted-foreground">
				<p>No claimed vouchers.</p>
				<p className="mt-2 text-sm">
					Open the Telegram bot to upload and claim vouchers.
				</p>
			</div>
		);
	}

	return (
		<div className="px-4 py-4">
			<div className="grid gap-4 sm:grid-cols-2">
				{vouchers.map((v) => (
					<VoucherCard
						key={v._id}
						voucher={v}
						onReturn={handleReturn}
					/>
				))}
			</div>
		</div>
	);
}
