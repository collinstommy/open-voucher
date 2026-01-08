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
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/failed-uploads")({
	component: FailedUploadsPage,
});

function FailedUploadsPage() {
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
		convexQuery(api.admin.getFailedUploads, token ? { token } : "skip"),
	);

	if (isLoading) {
		return <div className="text-muted-foreground">Loading failed uploads...</div>;
	}

	if (error) {
		return <div className="text-red-500">Error loading failed uploads</div>;
	}

	const failedUploads = data?.failedUploads ?? [];

	if (failedUploads.length === 0) {
		return (
			<div>
				<div className="mb-6 flex items-center justify-between">
					<h1 className="text-xl font-semibold">
						Failed Uploads (0)
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
				<div className="text-muted-foreground py-12 text-center">
					No failed uploads
				</div>
			</div>
		);
	}

	return (
		<div>
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-xl font-semibold">
					Failed Uploads ({failedUploads.length})
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
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{failedUploads.map((failedUpload) => (
					<div key={failedUpload._id} className="rounded-lg border border-red-200 bg-red-50/30 p-4">
						{failedUpload.imageUrl ? (
							<img
								src={failedUpload.imageUrl}
								alt="Failed voucher"
								className="mb-3 h-96 w-full rounded border object-contain bg-muted"
							/>
						) : (
							<div className="bg-muted mb-3 flex h-96 w-full items-center justify-center rounded">
								<span className="text-muted-foreground text-xs">
									No image
								</span>
							</div>
						)}
						<div className="mb-3">
							<div className="mb-2 font-medium text-red-700">
								{failedUpload.extractedType ? `€${failedUpload.extractedType} Voucher (Failed)` : "Failed Upload"}
							</div>
							<div className="text-muted-foreground mb-1 text-xs font-mono">
								User ID: {failedUpload.userId}
							</div>
							<div className="mb-1 text-xs">
								Username:{" "}
								<Link
									to="/users/$userId"
									params={{ userId: failedUpload.userId }}
									className="text-blue-600 hover:text-blue-800 hover:underline"
								>
									{failedUpload.username || failedUpload.firstName || "Unknown"}
								</Link>
							</div>
							<div className="mb-2 rounded bg-orange-100 p-2">
								<div className="text-xs font-semibold text-orange-900 mb-1">
									Failure Reason:
								</div>
								<div className="text-sm text-orange-800">
									{failedUpload.failureReason}
								</div>
							</div>
							{failedUpload.errorMessage && (
								<div className="mb-2 rounded bg-red-100 p-2">
									<div className="text-xs font-semibold text-red-900 mb-1">
										System Error:
									</div>
									<div className="text-xs font-mono text-red-800 whitespace-pre-wrap break-all">
										{failedUpload.errorMessage}
									</div>
								</div>
							)}
							<div className="text-muted-foreground text-sm">
								Failed at {new Date(failedUpload._creationTime).toLocaleString()}
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
