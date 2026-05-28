import { AppHeader } from "@/components/mini-app/AppHeader";
import { api } from "@open-voucher/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { createFileRoute } from "@tanstack/react-router";

const statusStyles = {
	green: "bg-green-50 border-green-200 text-green-700",
	yellow: "bg-yellow-50 border-yellow-200 text-yellow-700",
	red: "bg-red-50 border-red-200 text-red-600",
};

type AvailabilityStatus = keyof typeof statusStyles;

function getAvailabilityStatus(count: number): AvailabilityStatus {
	if (count === 0) return "red";
	if (count < 10) return "yellow";
	return "green";
}

function formatAvailabilityLabel(count: number): string {
	if (count === 0) return "None";
	if (count < 10) return `Low · ${count}`;
	return "Good availability";
}

export const Route = createFileRoute("/app/availability")({
	component: AvailabilityPage,
});

function AvailabilityPage() {
	const availability = useQuery(api.vouchers.getVoucherAvailability);

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<AppHeader title="Availability" />
			<div className="flex-1 overflow-auto bg-slate-50 p-4">
				{availability === undefined && (
					<p className="text-sm text-slate-500 text-center py-8">Loading...</p>
				)}
				{availability === null && (
					<p className="text-sm text-red-600 text-center py-8">
						Something went wrong
					</p>
				)}
				{availability && (
					<>
						<p className="text-xs text-slate-500 mb-3">
							Pool levels before you claim in chat
						</p>
						<div className="grid grid-cols-3 gap-2">
							{(["5", "10", "20"] as const).map((denom) => {
								const count = availability[denom];
								const status = getAvailabilityStatus(count);
								return (
									<div
										key={denom}
										className={`rounded-xl border p-3 text-center ${statusStyles[status]}`}
									>
										<div className="text-lg font-bold">€{denom}</div>
										<div className="text-[10px] mt-1 font-medium">
											{formatAvailabilityLabel(count)}
										</div>
									</div>
								);
							})}
						</div>
					</>
				)}
			</div>
		</div>
	);
}
