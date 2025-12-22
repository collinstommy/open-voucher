import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-router/backend/convex/_generated/api";
import type { Id } from "@open-router/backend/convex/_generated/dataModel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/users/$userId")({
	component: UserDetailPage,
});

function UserDetailPage() {
	const { userId } = Route.useParams();
	const { token } = useAdminAuth();
	const convex = useConvex();
	const queryClient = useQueryClient();

	const { data, isLoading, error } = useQuery(
		convexQuery(
			api.admin.getUserDetails,
			token ? { token, userId: userId as Id<"users"> } : "skip",
		),
	);

	const banMutation = useMutation({
		mutationFn: () =>
			convex.mutation(api.admin.banUser, {
				token: token!,
				userId: userId as Id<"users">,
			}),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	const unbanMutation = useMutation({
		mutationFn: () =>
			convex.mutation(api.admin.unbanUser, {
				token: token!,
				userId: userId as Id<"users">,
			}),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	if (isLoading) {
		return <div className="text-muted-foreground">Loading user details...</div>;
	}

	if (error) {
		return <div className="text-red-500">Error loading user details</div>;
	}

	const user = data?.user;
	const stats = data?.stats;
	const uploadedVouchers = data?.uploadedVouchers ?? [];
	const claimedVouchers = data?.claimedVouchers ?? [];
	const reportsFiledByUser = data?.reportsFiledByUser ?? [];
	const reportsAgainstUploads = data?.reportsAgainstUploads ?? [];

	if (!user) {
		return <div className="text-red-500">User not found</div>;
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-4">
				<Link to="/users">
					<Button variant="ghost" size="sm">
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back
					</Button>
				</Link>
			</div>

			<div className="rounded-lg border p-6">
				<div className="mb-4 flex items-start justify-between">
					<div>
						<h1 className="text-2xl font-semibold">
							{user.username || user.firstName || "Unknown User"}
						</h1>
						<p className="text-muted-foreground text-sm">
							{user.telegramChatId}
						</p>
					</div>
					{user.isBanned ? (
						<Button
							variant="outline"
							onClick={() => unbanMutation.mutate()}
							disabled={unbanMutation.isPending}
						>
							Unban User
						</Button>
					) : (
						<Button
							variant="destructive"
							onClick={() => banMutation.mutate()}
							disabled={banMutation.isPending}
						>
							Ban User
						</Button>
					)}
				</div>

				<div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
					<div className="rounded-md border p-3">
						<div className="text-muted-foreground mb-1 text-xs">Coins</div>
						<div className="text-xl font-semibold">{user.coins}</div>
					</div>
					<div className="rounded-md border p-3">
						<div className="text-muted-foreground mb-1 text-xs">Uploaded</div>
						<div className="text-xl font-semibold">{stats?.uploadedCount}</div>
					</div>
					<div className="rounded-md border p-3">
						<div className="text-muted-foreground mb-1 text-xs">Claimed</div>
						<div className="text-xl font-semibold">{stats?.claimedCount}</div>
					</div>
					<div className="rounded-md border p-3">
						<div className="text-muted-foreground mb-1 text-xs">
							Upload Reports
						</div>
						<div className="text-xl font-semibold text-red-500">
							{stats?.reportsAgainstUploadsCount}
						</div>
					</div>
					<div className="rounded-md border p-3">
						<div className="text-muted-foreground mb-1 text-xs">
							Reports Filed
						</div>
						<div className="text-xl font-semibold text-orange-500">
							{stats?.reportsFiledCount}
						</div>
					</div>
				</div>
			</div>

			<div>
				<h2 className="mb-4 text-xl font-semibold">
					Uploaded Vouchers ({uploadedVouchers.length})
				</h2>

				{uploadedVouchers.length === 0 ? (
					<div className="text-muted-foreground rounded-lg border p-12 text-center">
						No uploaded vouchers
					</div>
				) : (
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{uploadedVouchers.map((voucher) => (
							<div key={voucher._id} className="rounded-lg border p-4">
								{voucher.imageUrl ? (
									<img
										src={voucher.imageUrl}
										alt="Voucher"
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
									<div className="mb-2 font-medium">
										€{voucher.type} Voucher
									</div>
									<div className="text-muted-foreground mb-1 text-xs">
										ID: {voucher._id}
									</div>
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
				)}
			</div>

			<div>
				<h2 className="mb-4 text-xl font-semibold">
					Claimed Vouchers ({claimedVouchers.length})
				</h2>

				{claimedVouchers.length === 0 ? (
					<div className="text-muted-foreground rounded-lg border p-12 text-center">
						No claimed vouchers
					</div>
				) : (
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{claimedVouchers.map((voucher) => (
							<div key={voucher._id} className="rounded-lg border p-4">
								{voucher.imageUrl ? (
									<img
										src={voucher.imageUrl}
										alt="Voucher"
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
									<div className="mb-2 font-medium">
										€{voucher.type} Voucher
									</div>
									<div className="text-muted-foreground mb-1 text-xs">
										ID: {voucher._id}
									</div>
									<div className="text-muted-foreground mb-1 text-sm">
										Status:{" "}
										<span
											className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
												voucher.status === "claimed"
													? "bg-green-100 text-green-800"
													: voucher.status === "reported"
														? "bg-red-100 text-red-800"
														: "bg-gray-100 text-gray-800"
											}`}
										>
											{voucher.status}
										</span>
									</div>
									{voucher.expiryDate && (
										<div className="text-muted-foreground mb-1 text-sm">
											Expires{" "}
											{new Date(voucher.expiryDate).toLocaleDateString()}
										</div>
									)}
									{voucher.claimedAt && (
										<div className="text-muted-foreground text-sm">
											Claimed {new Date(voucher.claimedAt).toLocaleString()}
										</div>
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<div>
				<h2 className="mb-4 text-xl font-semibold">
					Reports Filed by User ({reportsFiledByUser.length})
				</h2>

				{reportsFiledByUser.length === 0 ? (
					<div className="text-muted-foreground rounded-lg border p-12 text-center">
						No reports filed
					</div>
				) : (
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{reportsFiledByUser.map((report) => (
							<div key={report._id} className="rounded-lg border p-4">
								{report.voucher?.imageUrl ? (
									<img
										src={report.voucher.imageUrl}
										alt="Voucher"
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
									<div className="mb-2 font-medium">
										€{report.voucher?.type} Voucher
									</div>
									<div className="text-muted-foreground mb-1 text-sm">
										Reported on {new Date(report.createdAt).toLocaleString()}
									</div>
									<div className="text-muted-foreground text-sm">
										Uploaded by{" "}
										{report.uploader?.username ||
											report.uploader?.firstName ||
											"Unknown"}{" "}
										({report.uploader?.telegramChatId})
									</div>
								</div>
								<div className="rounded bg-muted p-3">
									<div className="text-muted-foreground mb-1 text-xs">
										Reason
									</div>
									<div className="whitespace-pre-wrap text-sm">
										{report.reason}
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<div>
				<h2 className="mb-4 text-xl font-semibold">
					Reports Against User's Uploads ({reportsAgainstUploads.length})
				</h2>

				{reportsAgainstUploads.length === 0 ? (
					<div className="text-muted-foreground rounded-lg border p-12 text-center">
						No reports against uploads
					</div>
				) : (
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{reportsAgainstUploads.map((report) => (
							<div key={report._id} className="rounded-lg border p-4">
								{report.voucher?.imageUrl ? (
									<img
										src={report.voucher.imageUrl}
										alt="Voucher"
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
									<div className="mb-2 font-medium">
										€{report.voucher?.type} Voucher
									</div>
									<div className="text-muted-foreground mb-1 text-sm">
										Reported on {new Date(report.createdAt).toLocaleString()}
									</div>
									<div className="text-muted-foreground text-sm">
										Reported by{" "}
										{report.reporter?.username ||
											report.reporter?.firstName ||
											"Unknown"}{" "}
										({report.reporter?.telegramChatId})
									</div>
								</div>
								<div className="rounded bg-muted p-3">
									<div className="text-muted-foreground mb-1 text-xs">
										Reason
									</div>
									<div className="whitespace-pre-wrap text-sm">
										{report.reason}
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
