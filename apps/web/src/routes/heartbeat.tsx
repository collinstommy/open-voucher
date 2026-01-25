import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-voucher/backend/convex/_generated/api";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/heartbeat")({
	component: HeartbeatComponent,
});

function HeartbeatComponent() {
	const { token } = useAdminAuth();
	const heartbeat = useQuery(
		convexQuery(api.heartbeat.getHeartbeat, token ? { token } : "skip"),
	);

	const getStatusColor = (status: string) => {
		switch (status) {
			case "healthy":
				return "bg-green-500";
			case "warning":
				return "bg-yellow-500";
			case "critical":
				return "bg-red-500";
			default:
				return "bg-gray-500";
		}
	};

	const getStatusBadge = (status: string) => {
		switch (status) {
			case "healthy":
				return (
					<span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 font-medium text-green-800 text-xs">
						Healthy
					</span>
				);
			case "warning":
				return (
					<span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 font-medium text-xs text-yellow-800">
						Warning
					</span>
				);
			case "critical":
				return (
					<span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 font-medium text-red-800 text-xs">
						Critical
					</span>
				);
			default:
				return (
					<span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 font-medium text-gray-800 text-xs">
						Unknown
					</span>
				);
		}
	};

	const handleRefresh = () => {
		heartbeat.refetch();
	};

	return (
		<div className="grid gap-6">
			<div className="flex items-center justify-between">
				<h1 className="font-bold text-2xl">System Heartbeat</h1>
				<Button variant="outline" size="sm" onClick={handleRefresh}>
					<RefreshCw className="mr-2 h-4 w-4" />
					Refresh
				</Button>
			</div>

			<section className="rounded-lg border p-4">
				<h2 className="mb-4 font-medium">Overall Status</h2>
				{heartbeat.isLoading ? (
					<div className="text-muted-foreground text-sm">Loading...</div>
				) : heartbeat.error ? (
					<div className="text-red-500 text-sm">Error loading heartbeat</div>
				) : (
					<div className="flex items-center gap-4">
						<div
							className={`h-4 w-4 rounded-full ${getStatusColor(heartbeat.data?.status ?? "unknown")}`}
						/>
						<div>
							{getStatusBadge(heartbeat.data?.status ?? "unknown")}
							<p className="mt-1 text-muted-foreground text-sm">
								Last checked:{" "}
								{heartbeat.data?.timestamp
									? new Date(heartbeat.data.timestamp).toLocaleString()
									: "Never"}
							</p>
						</div>
					</div>
				)}
			</section>

			<div className="grid gap-4 md:grid-cols-3">
				<section className="rounded-lg border p-4">
					<h2 className="mb-2 font-medium">OCR System</h2>
					{heartbeat.isLoading ? (
						<div className="text-muted-foreground text-sm">Loading...</div>
					) : (
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<div
									className={`h-2 w-2 rounded-full ${getStatusColor(heartbeat.data?.checks.ocr.status ?? "unknown")}`}
								/>
								{getStatusBadge(heartbeat.data?.checks.ocr.status ?? "unknown")}
							</div>
							<p className="text-muted-foreground text-sm">
								{heartbeat.data?.checks.ocr.message}
							</p>
							{heartbeat.data?.checks.ocr.extractedAmount && (
								<div className="text-muted-foreground text-xs">
									<p>Amount: €{heartbeat.data?.checks.ocr.extractedAmount}</p>
									<p>
										Expiry: {heartbeat.data?.checks.ocr.extractedExpiryDate}
									</p>
									<p>Barcode: {heartbeat.data?.checks.ocr.extractedBarcode}</p>
								</div>
							)}
						</div>
					)}
				</section>

				<section className="rounded-lg border p-4">
					<h2 className="mb-2 font-medium">Telegram Integration</h2>
					{heartbeat.isLoading ? (
						<div className="text-muted-foreground text-sm">Loading...</div>
					) : (
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<div
									className={`h-2 w-2 rounded-full ${getStatusColor(heartbeat.data?.checks.telegram.status ?? "unknown")}`}
								/>
								{getStatusBadge(
									heartbeat.data?.checks.telegram.status ?? "unknown",
								)}
							</div>
							<p className="text-muted-foreground text-sm">
								{heartbeat.data?.checks.telegram.message}
							</p>
							<p className="text-muted-foreground text-xs">
								Token configured:{" "}
								{heartbeat.data?.checks.telegram.tokenConfigured ? "Yes" : "No"}
							</p>
						</div>
					)}
				</section>

				<section className="rounded-lg border p-4">
					<h2 className="mb-2 font-medium">Voucher Availability</h2>
					{heartbeat.isLoading ? (
						<div className="text-muted-foreground text-sm">Loading...</div>
					) : (
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<div
									className={`h-2 w-2 rounded-full ${getStatusColor(heartbeat.data?.checks.vouchers.status ?? "unknown")}`}
								/>
								{getStatusBadge(
									heartbeat.data?.checks.vouchers.status ?? "unknown",
								)}
							</div>
							<p className="text-muted-foreground text-sm">
								{heartbeat.data?.checks.vouchers.message}
							</p>
							<div className="text-muted-foreground text-xs">
								<p>€5: {heartbeat.data?.checks.vouchers.byType["5"] ?? 0}</p>
								<p>€10: {heartbeat.data?.checks.vouchers.byType["10"] ?? 0}</p>
								<p>€20: {heartbeat.data?.checks.vouchers.byType["20"] ?? 0}</p>
							</div>
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
