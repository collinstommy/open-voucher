import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-router/backend/convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

function HomeComponent() {
	const healthCheck = useQuery(convexQuery(api.healthCheck.get, {}));
	const stats = useQuery(convexQuery(api.dashboard.getStats, {}));

	return (
		<div className="grid gap-6">
			<section className="rounded-lg border p-4">
				<h2 className="mb-2 font-medium">API Status</h2>
				<div className="flex items-center gap-2">
					<div
						className={`h-2 w-2 rounded-full ${healthCheck.data === "OK" ? "bg-green-500" : healthCheck.isLoading ? "bg-orange-400" : "bg-red-500"}`}
					/>
					<span className="text-muted-foreground text-sm">
						{healthCheck.isLoading
							? "Checking..."
							: healthCheck.data === "OK"
								? "Connected"
								: "Error"}
					</span>
				</div>
			</section>

			<section className="rounded-lg border p-4">
				<h2 className="mb-4 font-medium">Voucher Statistics</h2>
				{stats.isLoading ? (
					<div className="text-muted-foreground text-sm">Loading stats...</div>
				) : stats.error ? (
					<div className="text-sm text-red-500">Error loading stats</div>
				) : (
					<div className="grid gap-4">
						<div className="grid grid-cols-3 gap-4">
							<div className="rounded-md border p-3">
								<div className="text-muted-foreground mb-1 text-xs">
									€5 Available
								</div>
								<div className="text-2xl font-semibold">
									{stats.data?.vouchersByType["5"] ?? 0}
								</div>
							</div>
							<div className="rounded-md border p-3">
								<div className="text-muted-foreground mb-1 text-xs">
									€10 Available
								</div>
								<div className="text-2xl font-semibold">
									{stats.data?.vouchersByType["10"] ?? 0}
								</div>
							</div>
							<div className="rounded-md border p-3">
								<div className="text-muted-foreground mb-1 text-xs">
									€20 Available
								</div>
								<div className="text-2xl font-semibold">
									{stats.data?.vouchersByType["20"] ?? 0}
								</div>
							</div>
						</div>

						<div className="grid grid-cols-3 gap-4">
							<div className="rounded-md border p-3">
								<div className="text-muted-foreground mb-1 text-xs">
									Total Uploaded
								</div>
								<div className="text-2xl font-semibold">
									{stats.data?.totalUploaded ?? 0}
								</div>
							</div>
							<div className="rounded-md border p-3">
								<div className="text-muted-foreground mb-1 text-xs">
									Vouchers Claimed
								</div>
								<div className="text-2xl font-semibold">
									{stats.data?.claimedCount ?? 0}
								</div>
							</div>
							<div className="rounded-md border p-3">
								<div className="text-muted-foreground mb-1 text-xs">Users</div>
								<div className="text-2xl font-semibold">
									{stats.data?.userCount ?? 0}
								</div>
							</div>
						</div>
					</div>
				)}
			</section>
		</div>
	);
}
