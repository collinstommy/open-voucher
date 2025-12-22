import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminAuth } from '@/hooks/useAdminAuth';

import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-router/backend/convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/vouchers")({
	component: VouchersPage,
});

function VouchersPage() {
	const { token } = useAdminAuth();
	const [deployment, setDeployment] = useState<"dev" | "prod">(() => {
		if (typeof window === "undefined") return "prod";
		return (
			(localStorage.getItem("convex-deployment") as "dev" | "prod") || "prod"
		);
	});

	const handleDeploymentChange = (value: string) => {
		localStorage.setItem("convex-deployment", value);
		window.location.reload();
	};

	const { data, isLoading, error } = useQuery(
		convexQuery(api.admin.getTodaysVouchers, token ? { token } : "skip"),
	);

	if (isLoading) {
		return <div className="text-muted-foreground">Loading vouchers...</div>;
	}

	if (error) {
		return <div className="text-red-500">Error loading vouchers</div>;
	}

	const vouchers = data?.vouchers ?? [];

	if (vouchers.length === 0) {
		return (
			<div className="text-muted-foreground py-12 text-center">
				No vouchers uploaded today
			</div>
		);
	}

	return (
		<div>
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-xl font-semibold">
					Today's Vouchers ({vouchers.length})
				</h1>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm">
							{deployment === "dev" ? "Development" : "Production"}
							<ChevronDownIcon />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuRadioGroup
							value={deployment}
							onValueChange={handleDeploymentChange}
						>
							<DropdownMenuRadioItem value="dev">
								Development
							</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="prod">
								Production
							</DropdownMenuRadioItem>
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{vouchers.map((voucher) => (
					<div
						key={voucher._id}
						className="group relative overflow-hidden rounded-lg border"
					>
						{voucher.imageUrl ? (
							<img
								src={voucher.imageUrl}
								alt={`Voucher ${voucher.type}`}
								className="aspect-[3/4] w-full object-cover"
							/>
						) : (
							<div className="bg-muted flex aspect-[3/4] items-center justify-center">
								<span className="text-muted-foreground text-sm">No image</span>
							</div>
						)}
						<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
							<div className="flex items-center justify-between text-white">
								<span className="font-medium">${voucher.type}</span>
								<span
									className={`rounded px-2 py-0.5 text-xs ${
										voucher.status === "available"
											? "bg-green-500"
											: voucher.status === "claimed"
												? "bg-blue-500"
												: voucher.status === "processing"
													? "bg-yellow-500"
													: "bg-gray-500"
									}`}
								>
									{voucher.status}
								</span>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
