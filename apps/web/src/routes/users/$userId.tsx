import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-voucher/backend/convex/_generated/api";
import type { Id } from "@open-voucher/backend/convex/_generated/dataModel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export const Route = createFileRoute("/users/$userId")({
	component: UserDetailPage,
});

function UserDetailPage() {
	const { userId } = Route.useParams();
	const { token } = useAdminAuth();
	const convex = useConvex();
	const queryClient = useQueryClient();
	const [messageText, setMessageText] = useState("");

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

	const sendMessageMutation = useMutation({
		mutationFn: (text: string) =>
			convex.mutation(api.admin.sendMessageToUser, {
				token: token!,
				userId: userId as Id<"users">,
				messageText: text,
			}),
		onSuccess: () => {
			setMessageText("");
			queryClient.invalidateQueries();
		},
	});

	const clearReportMutation = useMutation({
		mutationFn: ({
			reportId,
			newStatus,
		}: {
			reportId: Id<"reports">;
			newStatus: "expired" | "available";
		}) =>
			convex.mutation(api.admin.clearReportAndUpdateVoucher, {
				token: token!,
				reportId,
				newVoucherStatus: newStatus,
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
	const feedbackAndSupport = data?.feedbackAndSupport ?? [];
	const adminMessages = data?.adminMessages ?? [];
	const transactions = data?.transactions ?? [];

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
						<h1 className="font-semibold text-2xl">
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
						<div className="mb-1 text-muted-foreground text-xs">Coins</div>
						<div className="font-semibold text-xl">{user.coins}</div>
					</div>
					<div className="rounded-md border p-3">
						<div className="mb-1 text-muted-foreground text-xs">Uploaded</div>
						<div className="font-semibold text-xl">{stats?.uploadedCount}</div>
					</div>
					<div className="rounded-md border p-3">
						<div className="mb-1 text-muted-foreground text-xs">Claimed</div>
						<div className="font-semibold text-xl">{stats?.claimedCount}</div>
					</div>
					<div className="rounded-md border p-3">
						<div className="mb-1 text-muted-foreground text-xs">
							Upload Reports
						</div>
						<div className="font-semibold text-red-500 text-xl">
							{stats?.reportsAgainstUploadsCount}
						</div>
					</div>
					<div className="rounded-md border p-3">
						<div className="mb-1 text-muted-foreground text-xs">
							Reports Filed
						</div>
						<div className="font-semibold text-orange-500 text-xl">
							{stats?.reportsFiledCount}
						</div>
					</div>
				</div>
			</div>

			<div>
				<h2 className="mb-4 font-semibold text-xl">
					Transactions ({transactions.length})
				</h2>

				{transactions.length === 0 ? (
					<div className="rounded-lg border p-12 text-center text-muted-foreground">
						No transactions
					</div>
				) : (
					<div className="rounded-lg border">
						<table className="w-full text-sm">
							<thead className="border-b bg-muted/50">
								<tr>
									<th className="p-3 text-left font-medium">Type</th>
									<th className="p-3 text-left font-medium">Amount</th>
									<th className="p-3 text-left font-medium">Date</th>
								</tr>
							</thead>
							<tbody>
								{transactions.map((tx) => (
									<tr key={tx._id} className="border-b last:border-0">
										<td className="p-3">
											<span
												className={`rounded-full px-2 py-1 font-medium text-xs ${
													tx.type === "signup_bonus"
														? "bg-green-100 text-green-800"
														: tx.type === "upload_reward"
															? "bg-blue-100 text-blue-800"
															: tx.type === "claim_spend"
																? "bg-red-100 text-red-800"
																: tx.type === "report_refund"
																	? "bg-purple-100 text-purple-800"
																	: tx.type === "uploader_denied"
																		? "bg-red-100 text-red-800"
																		: "bg-amber-100 text-amber-800"
												}`}
											>
												{tx.type.replace(/_/g, " ")}
											</span>
										</td>
										<td className="p-3">
											<span
												className={
													tx.amount > 0 ? "text-green-600" : "text-red-600"
												}
											>
												{tx.amount > 0 ? "+" : ""}
												{tx.amount}
											</span>
										</td>
										<td className="p-3 text-muted-foreground">
											{new Date(tx.createdAt).toLocaleString()}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>

			<div>
				<h2 className="mb-4 font-semibold text-xl">
					Uploaded Vouchers ({uploadedVouchers.length})
				</h2>

				{uploadedVouchers.length === 0 ? (
					<div className="rounded-lg border p-12 text-center text-muted-foreground">
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
										className="mb-3 h-96 w-full rounded border bg-muted object-contain"
									/>
								) : (
									<div className="mb-3 flex h-96 w-full items-center justify-center rounded bg-muted">
										<span className="text-muted-foreground text-xs">
											No image
										</span>
									</div>
								)}
								<div className="mb-3">
									<div className="mb-2 font-medium">
										€{voucher.type} Voucher
									</div>
									<div className="mb-1 text-muted-foreground text-xs">
										ID: {voucher._id}
									</div>
									<div className="mb-1 text-muted-foreground text-sm">
										Status:{" "}
										<span
											className={`inline-flex rounded-full px-2 py-1 font-medium text-xs ${
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
									<div className="mb-1 text-muted-foreground text-sm">
										Expires {new Date(voucher.expiryDate).toLocaleDateString()}
									</div>
									<div className="text-muted-foreground text-sm">
										Uploaded {new Date(voucher.createdAt).toLocaleString()}
									</div>
									{voucher.claimer && (
										<div className="mt-2 text-sm">
											<span className="text-muted-foreground">Claimed by: </span>
											<Link
												to="/users/$userId"
												params={{ userId: voucher.claimer._id }}
												className="text-blue-600 hover:underline"
											>
												{voucher.claimer.username || voucher.claimer.firstName || voucher.claimer.telegramChatId}
											</Link>
										</div>
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<div>
				<h2 className="mb-4 font-semibold text-xl">
					Claimed Vouchers ({claimedVouchers.length})
				</h2>

				{claimedVouchers.length === 0 ? (
					<div className="rounded-lg border p-12 text-center text-muted-foreground">
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
										className="mb-3 h-96 w-full rounded border bg-muted object-contain"
									/>
								) : (
									<div className="mb-3 flex h-96 w-full items-center justify-center rounded bg-muted">
										<span className="text-muted-foreground text-xs">
											No image
										</span>
									</div>
								)}
								<div className="mb-3">
									<div className="mb-2 font-medium">
										€{voucher.type} Voucher
									</div>
									<div className="mb-1 text-muted-foreground text-xs">
										ID: {voucher._id}
									</div>
									<div className="mb-1 text-muted-foreground text-sm">
										Status:{" "}
										<span
											className={`inline-flex rounded-full px-2 py-1 font-medium text-xs ${
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
										<div className="mb-1 text-muted-foreground text-sm">
											Expires{" "}
											{new Date(voucher.expiryDate).toLocaleDateString()}
										</div>
									)}
									{voucher.claimedAt && (
										<div className="text-muted-foreground text-sm">
											Claimed {new Date(voucher.claimedAt).toLocaleString()}
										</div>
									)}
									{voucher.uploader && (
										<div className="mt-2 text-sm">
											<span className="text-muted-foreground">Uploaded by: </span>
											<Link
												to="/users/$userId"
												params={{ userId: voucher.uploader._id }}
												className="text-blue-600 hover:underline"
											>
												{voucher.uploader.username || voucher.uploader.firstName || voucher.uploader.telegramChatId}
											</Link>
										</div>
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<div>
				<h2 className="mb-4 font-semibold text-xl">
					Reports Filed by User ({reportsFiledByUser.length})
				</h2>

				{reportsFiledByUser.length === 0 ? (
					<div className="rounded-lg border p-12 text-center text-muted-foreground">
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
										className="mb-3 h-96 w-full rounded border bg-muted object-contain"
									/>
								) : (
									<div className="mb-3 flex h-96 w-full items-center justify-center rounded bg-muted">
										<span className="text-muted-foreground text-xs">
											No image
										</span>
									</div>
								)}
								<div className="mb-3">
									<div className="mb-2 font-medium">
										€{report.voucher?.type} Voucher
									</div>
									<div className="mb-1 text-muted-foreground text-xs">
										Voucher ID: {report.voucherId}
									</div>
									<div className="mb-1 text-muted-foreground text-xs">
										Report ID: {report._id}
									</div>
									<div className="mb-1 text-muted-foreground text-sm">
										Reported on {new Date(report.createdAt).toLocaleString()}
									</div>
									<div className="text-muted-foreground text-sm">
										Uploaded by{" "}
										{report.uploader ? (
											<Link
												to="/users/$userId"
												params={{ userId: report.uploader._id }}
												className="text-blue-600 hover:underline"
											>
												{report.uploader.username || report.uploader.firstName || report.uploader.telegramChatId}
											</Link>
										) : "Unknown"}
									</div>
								</div>
								<div className="rounded bg-muted p-3">
									<div className="mb-1 text-muted-foreground text-xs">
										Reason
									</div>
									<div className="whitespace-pre-wrap text-sm">
										{report.reason}
									</div>
								</div>
								<div className="mt-3 flex flex-col gap-2">
									<Button
										size="sm"
										variant="outline"
										onClick={() =>
											clearReportMutation.mutate({
												reportId: report._id,
												newStatus: "expired",
											})
										}
										disabled={clearReportMutation.isPending}
									>
										Expire & Clear
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={() =>
											clearReportMutation.mutate({
												reportId: report._id,
												newStatus: "available",
											})
										}
										disabled={clearReportMutation.isPending}
									>
										Available & Clear
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<div>
				<h2 className="mb-4 font-semibold text-xl">
					Reports Against User's Uploads ({reportsAgainstUploads.length})
				</h2>

				{reportsAgainstUploads.length === 0 ? (
					<div className="rounded-lg border p-12 text-center text-muted-foreground">
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
										className="mb-3 h-96 w-full rounded border bg-muted object-contain"
									/>
								) : (
									<div className="mb-3 flex h-96 w-full items-center justify-center rounded bg-muted">
										<span className="text-muted-foreground text-xs">
											No image
										</span>
									</div>
								)}
								<div className="mb-3">
									<div className="mb-2 font-medium">
										€{report.voucher?.type} Voucher
									</div>
									<div className="mb-1 text-muted-foreground text-xs">
										Voucher ID: {report.voucherId}
									</div>
									<div className="mb-1 text-muted-foreground text-xs">
										Report ID: {report._id}
									</div>
									<div className="mb-1 text-muted-foreground text-sm">
										Reported on {new Date(report.createdAt).toLocaleString()}
									</div>
									<div className="text-muted-foreground text-sm">
										Reported by{" "}
										{report.reporter ? (
											<Link
												to="/users/$userId"
												params={{ userId: report.reporter._id }}
												className="text-blue-600 hover:underline"
											>
												{report.reporter.username || report.reporter.firstName || report.reporter.telegramChatId}
											</Link>
										) : "Unknown"}
									</div>
								</div>
								<div className="rounded bg-muted p-3">
									<div className="mb-1 text-muted-foreground text-xs">
										Reason
									</div>
									<div className="whitespace-pre-wrap text-sm">
										{report.reason}
									</div>
								</div>
								<div className="mt-3 flex flex-col gap-2">
									<Button
										size="sm"
										variant="outline"
										onClick={() =>
											clearReportMutation.mutate({
												reportId: report._id,
												newStatus: "expired",
											})
										}
										disabled={clearReportMutation.isPending}
									>
										Expire & Clear
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={() =>
											clearReportMutation.mutate({
												reportId: report._id,
												newStatus: "available",
											})
										}
										disabled={clearReportMutation.isPending}
									>
										Available & Clear
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<div>
				<h2 className="mb-4 font-semibold text-xl">
					Feedback & Support Messages ({feedbackAndSupport.length})
				</h2>

				{feedbackAndSupport.length === 0 ? (
					<div className="rounded-lg border p-12 text-center text-muted-foreground">
						No feedback or support messages
					</div>
				) : (
					<div className="space-y-4">
						{feedbackAndSupport.map((item: any) => (
							<div
								key={item._id}
								className={`rounded-lg border p-4 ${
									item.status === "new"
										? "border-blue-500 bg-blue-50 dark:bg-blue-950"
										: ""
								} ${
									item.type === "support"
										? "border-amber-200 bg-amber-50 dark:bg-amber-950/30"
										: ""
								}`}
							>
								<div className="mb-3 flex items-start justify-between">
									<div>
										<div className="flex items-center gap-2">
											<span className="font-medium">
												{item.type === "feedback" ? "Feedback" : "Support"}
											</span>
											{item.type === "support" && (
												<span className="rounded bg-amber-500 px-2 py-1 text-white text-xs">
													Support
												</span>
											)}
										</div>
										<div className="text-muted-foreground text-xs">
											{new Date(item.createdAt).toLocaleString()}
										</div>
									</div>
									<span
										className={`rounded-full px-2 py-1 font-medium text-xs ${
											item.status === "new"
												? "bg-blue-100 text-blue-800"
												: item.status === "read"
													? "bg-green-100 text-green-800"
													: "bg-gray-100 text-gray-800"
										}`}
									>
										{item.status}
									</span>
								</div>
								<p className="whitespace-pre-wrap">{item.text}</p>
							</div>
						))}
					</div>
				)}
			</div>

			<div>
				<h2 className="mb-4 font-semibold text-xl">Admin Messages</h2>

				{/* Message History */}
				<div className="mb-6 max-h-96 space-y-4 overflow-y-auto rounded-lg bg-gray-50 p-4">
					{adminMessages.length === 0 ? (
						<div className="py-8 text-center text-muted-foreground">
							No admin messages sent to this user
						</div>
					) : (
						adminMessages.map((message: any) => (
							<div key={message._id} className="mb-3 flex justify-end">
								<div className="max-w-xs rounded-lg bg-blue-500 p-3 text-white shadow-sm">
									<p className="whitespace-pre-wrap text-sm">{message.text}</p>
									<p className="mt-1 text-xs opacity-75">
										{new Date(message.createdAt).toLocaleString()}
									</p>
								</div>
							</div>
						))
					)}
				</div>

				{/* Message Composer */}
				<div className="flex gap-2">
					<input
						type="text"
						value={messageText}
						onChange={(e) => setMessageText(e.target.value)}
						onKeyPress={(e) =>
							e.key === "Enter" &&
							messageText.trim() &&
							sendMessageMutation.mutate(messageText)
						}
						placeholder="Type a message..."
						className="flex-1 rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
						disabled={sendMessageMutation.isPending}
					/>
					<Button
						onClick={() =>
							messageText.trim() && sendMessageMutation.mutate(messageText)
						}
						disabled={sendMessageMutation.isPending || !messageText.trim()}
					>
						{sendMessageMutation.isPending ? "Sending..." : "Send"}
					</Button>
				</div>
			</div>
		</div>
	);
}
