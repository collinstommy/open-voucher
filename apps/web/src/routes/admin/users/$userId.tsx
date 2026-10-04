import { convexQuery } from "@convex-dev/react-query";
import { api } from "@open-voucher/backend/convex/_generated/api";
import type { Id } from "@open-voucher/backend/convex/_generated/dataModel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { formatDate, formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/admin/users/$userId")({
	component: UserDetailPage,
});

const TABS = [
	"transactions",
	"uploaded",
	"claimed",
	"failed",
	"reportsFiled",
	"reportsAgainst",
	"messages",
] as const;

type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
	transactions: "Transactions",
	uploaded: "Uploaded",
	claimed: "Claimed",
	failed: "Failed",
	reportsFiled: "Reports Filed",
	reportsAgainst: "Reports Against",
	messages: "Messages",
};

const DEDUCTION_TYPES = [
	"admin_report_deduction",
	"admin_manual_deduction",
] as const;

type DeductionType = (typeof DEDUCTION_TYPES)[number];

const DEDUCTION_TYPE_LABELS: Record<DeductionType, string> = {
	admin_manual_deduction: "Manual",
	admin_report_deduction: "Reports",
};

const UPLOAD_WARNING_MESSAGE =
	"Warning: Vouchers you uploaded have been reported as not working by several other community members. Please only upload unused, valid vouchers. Continued reports may result in a coin deduction or a permanent ban.";

type ReportActivity = {
	_id: string;
	createdAt: number;
	voucher?: {
		type: string;
		expiryDate?: number;
	} | null;
	uploader?: {
		_id: Id<"users">;
		username?: string;
		firstName?: string;
		telegramChatId: string;
	} | null;
	reporter?: {
		_id: Id<"users">;
		username?: string;
		firstName?: string;
		telegramChatId: string;
	} | null;
};

type UserTransaction = {
	_id: string;
	type: string;
	amount: number;
	voucherId?: string;
	createdAt: number;
};

type ActivityItem =
	| {
			kind: "transaction";
			id: string;
			createdAt: number;
			transaction: UserTransaction;
	  }
	| {
			kind: "report_filed";
			id: string;
			createdAt: number;
			report: ReportActivity;
	  }
	| {
			kind: "report_against";
			id: string;
			createdAt: number;
			report: ReportActivity;
	  };

function buildActivityItems(
	transactions: UserTransaction[],
	reportsFiledByUser: ReportActivity[],
	reportsAgainstUploads: ReportActivity[],
): ActivityItem[] {
	return [
		...transactions.map((transaction) => ({
			kind: "transaction" as const,
			id: transaction._id,
			createdAt: transaction.createdAt,
			transaction,
		})),
		...reportsFiledByUser.map((report) => ({
			kind: "report_filed" as const,
			id: report._id,
			createdAt: report.createdAt,
			report,
		})),
		...reportsAgainstUploads.map((report) => ({
			kind: "report_against" as const,
			id: report._id,
			createdAt: report.createdAt,
			report,
		})),
	].sort((a, b) => b.createdAt - a.createdAt);
}

function voucherStatusClass(status: string) {
	switch (status) {
		case "available":
			return "s-available";
		case "claimed":
			return "s-claimed";
		case "reported":
			return "s-reported";
		default:
			return "";
	}
}

function UserLink({
	user,
}: {
	user: {
		_id: Id<"users">;
		username?: string;
		firstName?: string;
		telegramChatId: string;
	};
}) {
	return (
		<Link
			to="/admin/users/$userId"
			params={{ userId: user._id }}
			className="u-name"
		>
			{user.username || user.firstName || user.telegramChatId}
		</Link>
	);
}

function UserDetailPage() {
	const { userId } = Route.useParams();
	const { token } = useAdminAuth();
	const convex = useConvex();
	const queryClient = useQueryClient();
	const [messageText, setMessageText] = useState("");
	const [deductAmount, setDeductAmount] = useState("");
	const [deductType, setDeductType] = useState<DeductionType>(
		"admin_report_deduction",
	);
	const [deductError, setDeductError] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<Tab>("transactions");

	const { data, isLoading, error } = useQuery(
		convexQuery(
			api.adminUsers.getUserDetails,
			token ? { token, userId: userId as Id<"users"> } : "skip",
		),
	);

	const banMutation = useMutation({
		mutationFn: () =>
			convex.mutation(api.adminUsers.banUser, {
				token: token!,
				userId: userId as Id<"users">,
			}),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	const flagForReviewMutation = useMutation({
		mutationFn: () =>
			convex.mutation(api.adminUsers.flagForReview, {
				token: token!,
				userId: userId as Id<"users">,
			}),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	const unbanMutation = useMutation({
		mutationFn: () =>
			convex.mutation(api.adminUsers.unbanUser, {
				token: token!,
				userId: userId as Id<"users">,
			}),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	const dismissFlagMutation = useMutation({
		mutationFn: () =>
			convex.mutation(api.adminUsers.dismissFlag, {
				token: token!,
				userId: userId as Id<"users">,
			}),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	const deductCoinsMutation = useMutation({
		mutationFn: ({
			amount,
			deductionType,
		}: {
			amount: number;
			deductionType: DeductionType;
		}) =>
			convex.mutation(api.adminUsers.deductUserCoins, {
				token: token!,
				userId: userId as Id<"users">,
				amount,
				deductionType,
			}),
		onSuccess: () => {
			setDeductAmount("");
			setDeductError(null);
			queryClient.invalidateQueries();
		},
	});

	const handleDeductCoins = () => {
		const amount = Number(deductAmount);
		if (!Number.isInteger(amount) || amount <= 0) {
			setDeductError("Amount must be a whole number greater than 0");
			return;
		}
		const confirmed = window.confirm(
			`Deduct ${amount} coin${amount === 1 ? "" : "s"} from ${user?.username || user?.firstName || user?.telegramChatId || "this user"}?\n\nDeduction type: ${DEDUCTION_TYPE_LABELS[deductType]}\nTheir current balance is ${user?.coins ?? "?"} coins.`,
		);
		if (confirmed) {
			deductCoinsMutation.mutate({ amount, deductionType: deductType });
		}
	};

	const sendMessageMutation = useMutation({
		mutationFn: (text: string) =>
			convex.mutation(api.messages.sendMessageToUser, {
				token: token!,
				userId: userId as Id<"users">,
				messageText: text,
			}),
		onSuccess: () => {
			setMessageText("");
			queryClient.invalidateQueries();
		},
	});

	const handleSendWarning = () => {
		if (!user || !token) return;

		const confirmed = window.confirm(
			`Send this warning to ${user.username || user.firstName || user.telegramChatId}?\n\n${UPLOAD_WARNING_MESSAGE}`,
		);
		if (confirmed) {
			sendMessageMutation.mutate(UPLOAD_WARNING_MESSAGE);
		}
	};

	const clearReportMutation = useMutation({
		mutationFn: ({
			reportId,
			newStatus,
		}: {
			reportId: Id<"reports">;
			newStatus: "expired" | "available";
		}) =>
			convex.mutation(api.adminVouchers.clearReportAndUpdateVoucher, {
				token: token!,
				reportId,
				newVoucherStatus: newStatus,
			}),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	const expireVoucherMutation = useMutation({
		mutationFn: (voucherId: Id<"vouchers">) =>
			convex.mutation(api.adminVouchers.expireVoucherAndDeductCoins, {
				token: token!,
				voucherId,
			}),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	const removeVoucherMutation = useMutation({
		mutationFn: (voucherId: Id<"vouchers">) =>
			convex.mutation(api.adminVouchers.removeVoucherAndReverseCoins, {
				token: token!,
				voucherId,
			}),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	const reverseClaimMutation = useMutation({
		mutationFn: (voucherId: Id<"vouchers">) =>
			convex.mutation(api.adminVouchers.reverseClaim, {
				token: token!,
				voucherId,
			}),
		onSuccess: () => queryClient.invalidateQueries(),
	});

	if (isLoading) {
		return <p className="muted">Loading user details...</p>;
	}

	if (error) {
		return <p className="warn">Error loading user details</p>;
	}

	const user = data?.user;

	const amountExceedsBalance =
		deductAmount.trim() !== "" &&
		Number(deductAmount) > (user?.coins ?? Number.POSITIVE_INFINITY);
	const stats = data?.stats;
	const uploadedVouchers = [...(data?.uploadedVouchers ?? [])].sort(
		(a, b) => b.createdAt - a.createdAt,
	);
	const claimedVouchers = [...(data?.claimedVouchers ?? [])].sort(
		(a, b) => (b.claimedAt ?? 0) - (a.claimedAt ?? 0),
	);
	const failedUploads = [...(data?.failedUploads ?? [])].sort(
		(a, b) => b._creationTime - a._creationTime,
	);
	const reportsFiledByUser = [...(data?.reportsFiledByUser ?? [])].sort(
		(a, b) => b.createdAt - a.createdAt,
	);
	const reportsAgainstUploads = [...(data?.reportsAgainstUploads ?? [])].sort(
		(a, b) => b.createdAt - a.createdAt,
	);
	const feedbackAndSupport = [...(data?.feedbackAndSupport ?? [])].sort(
		(a, b) => b.createdAt - a.createdAt,
	);
	const adminMessages = [...(data?.adminMessages ?? [])].sort(
		(a, b) => b.createdAt - a.createdAt,
	);
	const transactions = [...(data?.transactions ?? [])].sort(
		(a, b) => b.createdAt - a.createdAt,
	);
	const activityItems = buildActivityItems(
		transactions,
		reportsFiledByUser,
		reportsAgainstUploads,
	);

	const tabCounts: Record<Tab, number> = {
		transactions: activityItems.length,
		uploaded: uploadedVouchers.length,
		claimed: claimedVouchers.length,
		failed: failedUploads.length,
		reportsFiled: reportsFiledByUser.length,
		reportsAgainst: reportsAgainstUploads.length,
		messages: feedbackAndSupport.length + adminMessages.length,
	};

	if (!user) {
		return <p className="warn">User not found</p>;
	}

	return (
		<div className="stack">
			<Link to="/admin/users" className="link-btn">
				Back to users
			</Link>

			<section className="panel">
				<div className="panel-body">
					<div className="msg-head">
						<h1 className="display" style={{ fontSize: 36 }}>
							{user.username || user.firstName || "Unknown user"}
						</h1>
						{user.isBanned && (
							<span className="status s-reported">
								<i />
								banned
							</span>
						)}
						{user.flaggedForReviewAt && !user.isBanned && (
							<span className="status s-flagged">
								<i />
								flagged
							</span>
						)}
					</div>
					<p className="u-id">{user.telegramChatId}</p>
					<div className="actions">
						{!user.flaggedForReviewAt && (
							<button
								type="button"
								className="btn"
								onClick={() => flagForReviewMutation.mutate()}
								disabled={flagForReviewMutation.isPending}
							>
								{flagForReviewMutation.isPending
									? "Flagging..."
									: "Flag for review"}
							</button>
						)}
						{!user.isBanned && (
							<button
								type="button"
								className="btn"
								onClick={handleSendWarning}
								disabled={sendMessageMutation.isPending}
							>
								{sendMessageMutation.isPending ? "Sending..." : "Send warning"}
							</button>
						)}
						{user.flaggedForReviewAt && !user.isBanned && (
							<button
								type="button"
								className="btn btn-quiet"
								onClick={() => dismissFlagMutation.mutate()}
								disabled={dismissFlagMutation.isPending}
							>
								Dismiss flag
							</button>
						)}
						{user.isBanned ? (
							<button
								type="button"
								className="btn btn-quiet"
								onClick={() => unbanMutation.mutate()}
								disabled={unbanMutation.isPending}
							>
								Unban
							</button>
						) : (
							<button
								type="button"
								className="btn btn-danger"
								onClick={() => banMutation.mutate()}
								disabled={banMutation.isPending}
							>
								Ban
							</button>
						)}
					</div>
				</div>
			</section>

			<div className="chips">
				{TABS.map((tab) => (
					<button
						key={tab}
						type="button"
						className="chip"
						aria-pressed={activeTab === tab}
						onClick={() => setActiveTab(tab)}
					>
						{TAB_LABELS[tab]}
						{tabCounts[tab] > 0 && (
							<span className="count">{tabCounts[tab]}</span>
						)}
					</button>
				))}
			</div>

			{activeTab === "transactions" && (
				<>
					<div className="stats five">
						<div className="stat">
							<div className="k">Coins</div>
							<div className="v num">{user.coins}</div>
						</div>
						<div className="stat">
							<div className="k">Uploaded</div>
							<div className="v num">{stats?.uploadedCount}</div>
						</div>
						<div className="stat">
							<div className="k">Claimed</div>
							<div className="v num">{stats?.claimedCount}</div>
						</div>
						<div className="stat accent-red">
							<div className="k">Upload reports</div>
							<div className="v num">{stats?.reportsAgainstUploadsCount}</div>
						</div>
						<div className="stat accent-gold">
							<div className="k">Reports filed</div>
							<div className="v num">{stats?.reportsFiledCount}</div>
						</div>
					</div>

					{/* Deduct Coins */}
					<section className="panel">
						<div className="panel-body">
							<div className="mb-3">
								<h3 className="display" style={{ fontSize: 22 }}>
									Deduct coins
								</h3>
								<p className="lede">
									Remove coins from this user's balance. A ledger transaction is
									recorded automatically.
								</p>
							</div>
							<div className="chips" style={{ marginBottom: 12 }}>
								{DEDUCTION_TYPES.map((type) => (
									<button
										key={type}
										type="button"
										className="chip"
										aria-pressed={deductType === type}
										onClick={() => setDeductType(type)}
										disabled={deductCoinsMutation.isPending}
									>
										{DEDUCTION_TYPE_LABELS[type]}
									</button>
								))}
							</div>
							<div className="composer">
								<div>
									<label htmlFor="deduct-amount" className="eyebrow">
										Amount
									</label>
									<input
										id="deduct-amount"
										type="number"
										min={1}
										step={1}
										value={deductAmount}
										onChange={(e) => {
											setDeductAmount(e.target.value);
											setDeductError(null);
										}}
										placeholder="e.g. 10"
										className="input"
										style={{ width: 140, marginTop: 6 }}
										disabled={deductCoinsMutation.isPending}
									/>
								</div>
								<button
									type="button"
									className="btn btn-danger"
									onClick={handleDeductCoins}
									disabled={
										deductCoinsMutation.isPending ||
										!deductAmount.trim() ||
										Number(deductAmount) <= 0 ||
										amountExceedsBalance
									}
								>
									{deductCoinsMutation.isPending
										? "Deducting..."
										: "Deduct coins"}
								</button>
							</div>
							{deductError && <p className="warn">{deductError}</p>}
							{!deductError && amountExceedsBalance && (
								<p className="warn">
									Amount exceeds the user's balance of {user?.coins ?? 0} coin
									{(user?.coins ?? 0) === 1 ? "" : "s"}
								</p>
							)}
							{deductCoinsMutation.isError && (
								<p className="warn">
									{deductCoinsMutation.error?.message ||
										"Failed to deduct coins. Please try again."}
								</p>
							)}
						</div>
					</section>

					{/* Activity Table */}
					{activityItems.length === 0 ? (
						<div className="empty">No transactions or reports</div>
					) : (
						<section className="panel">
							<div className="panel-body tight table-scroll">
								<table className="data">
									<thead>
										<tr>
											<th>Type</th>
											<th>Amount</th>
											<th>Details</th>
											<th>Date</th>
										</tr>
									</thead>
									<tbody>
										{activityItems.map((item) => {
											if (item.kind === "transaction") {
												const tx = item.transaction;
												return (
													<tr key={item.id} className="border-b last:border-0">
														<td>
															<span className="intent">
																{tx.type.replace(/_/g, " ")}
															</span>
														</td>
														<td>
															<span className={tx.amount > 0 ? "pos" : "neg"}>
																{tx.amount > 0 ? "+" : ""}
																{tx.amount}
															</span>
														</td>
														<td className="muted">
															{tx.voucherId ? `Voucher ${tx.voucherId}` : "—"}
														</td>
														<td className="p-3 text-muted-foreground">
															{formatDateTime(tx.createdAt)}
														</td>
													</tr>
												);
											}

											const report = item.report;
											const voucherLabel = report.voucher
												? `€${report.voucher.type} voucher`
												: "Voucher";

											return (
												<tr key={item.id} className="border-b last:border-0">
													<td>
														<span className="intent">
															{item.kind === "report_filed"
																? "report filed"
																: "report against"}
														</span>
													</td>
													<td className="p-3 text-muted-foreground">—</td>
													<td className="p-3 text-muted-foreground">
														<div>{voucherLabel}</div>
														<div className="text-xs">
															{item.kind === "report_filed" ? (
																<>
																	Uploaded by{" "}
																	{report.uploader ? (
																		<UserLink user={report.uploader} />
																	) : (
																		"Unknown"
																	)}
																</>
															) : (
																<>
																	Reported by{" "}
																	{report.reporter ? (
																		<UserLink user={report.reporter} />
																	) : (
																		"Unknown"
																	)}
																</>
															)}
														</div>
														{report.voucher?.expiryDate && (
															<div className="text-xs">
																Expires {formatDate(report.voucher.expiryDate)}
															</div>
														)}
													</td>
													<td className="p-3 text-muted-foreground">
														{formatDateTime(report.createdAt)}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						</section>
					)}
				</>
			)}

			{/* Uploaded Tab */}
			{activeTab === "uploaded" && (
				<>
					{uploadedVouchers.length === 0 ? (
						<div className="empty">No uploaded vouchers</div>
					) : (
						<div className="grid">
							{uploadedVouchers.map((voucher) => (
								<div key={voucher._id} className="vcard">
									{voucher.imageUrl ? (
										<img
											src={voucher.imageUrl}
											alt="Voucher"
											className="shot"
										/>
									) : (
										<div className="shot shot-empty">
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
										<div className="mb-2">
											<span
												className={`status ${voucherStatusClass(voucher.status)}`}
											>
												<i />
												{voucher.status}
											</span>
										</div>
										<div className="mb-1 text-muted-foreground text-sm">
											Expires {formatDate(voucher.expiryDate)}
										</div>
										<div className="text-muted-foreground text-sm">
											Uploaded {formatDateTime(voucher.createdAt)}
										</div>
										{voucher.claimer && (
											<div className="mt-2 text-sm">
												<span className="text-muted-foreground">
													Claimed by:{" "}
												</span>
												<Link
													to="/admin/users/$userId"
													params={{ userId: voucher.claimer._id }}
													className="u-name"
												>
													{voucher.claimer.username ||
														voucher.claimer.firstName ||
														voucher.claimer.telegramChatId}
												</Link>
											</div>
										)}
										{voucher.status !== "removed" && (
											<div className="mt-3 flex flex-wrap gap-2">
												{voucher.status !== "expired" && (
													<Button
														size="sm"
														variant="destructive"
														onClick={() =>
															expireVoucherMutation.mutate(
																voucher._id as Id<"vouchers">,
															)
														}
														disabled={expireVoucherMutation.isPending}
													>
														Expire & Deduct Coins
													</Button>
												)}
												<Button
													size="sm"
													variant="outline"
													onClick={() => {
														const claimerNote = voucher.claimer
															? "The uploader and the claimer each get a reversing coin entry, so both balances go back to where they were for this voucher."
															: "The uploader gets a reversing coin entry, so their balance goes back to where it was for this voucher.";
														const confirmed = window.confirm(
															`Remove this voucher from their lists?\n\n${claimerNote}\n\nThe voucher is kept so this barcode cannot be uploaded again.`,
														);
														if (confirmed) {
															removeVoucherMutation.mutate(
																voucher._id as Id<"vouchers">,
															);
														}
													}}
													disabled={removeVoucherMutation.isPending}
												>
													Remove & reverse coins
												</Button>
											</div>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</>
			)}

			{/* Claimed Tab */}
			{activeTab === "claimed" && (
				<>
					{claimedVouchers.length === 0 ? (
						<div className="empty">No claimed vouchers</div>
					) : (
						<div className="grid">
							{claimedVouchers.map((voucher) => (
								<div key={voucher._id} className="vcard">
									{voucher.imageUrl ? (
										<img
											src={voucher.imageUrl}
											alt="Voucher"
											className="shot"
										/>
									) : (
										<div className="shot shot-empty">
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
										<div className="mb-2">
											<span
												className={`status ${voucherStatusClass(voucher.status)}`}
											>
												<i />
												{voucher.status}
											</span>
										</div>
										{voucher.expiryDate && (
											<div className="mb-1 text-muted-foreground text-sm">
												Expires {formatDate(voucher.expiryDate)}
											</div>
										)}
										<div className="mb-1 text-muted-foreground text-sm">
											Uploaded {formatDateTime(voucher.createdAt)}
										</div>
										{voucher.claimedAt && (
											<div className="text-muted-foreground text-sm">
												Claimed {formatDateTime(voucher.claimedAt)}
											</div>
										)}
										{voucher.uploader && (
											<div className="mt-2 text-sm">
												<span className="text-muted-foreground">
													Uploaded by:{" "}
												</span>
												<Link
													to="/admin/users/$userId"
													params={{ userId: voucher.uploader._id }}
													className="u-name"
												>
													{voucher.uploader.username ||
														voucher.uploader.firstName ||
														voucher.uploader.telegramChatId}
												</Link>
											</div>
										)}
										<div className="mt-3">
											<Button
												size="sm"
												variant="outline"
												onClick={() =>
													reverseClaimMutation.mutate(
														voucher._id as Id<"vouchers">,
													)
												}
												disabled={reverseClaimMutation.isPending}
											>
												Make Available
											</Button>
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</>
			)}

			{/* Failed Tab */}
			{activeTab === "failed" && (
				<>
					{failedUploads.length === 0 ? (
						<div className="empty">No failed uploads</div>
					) : (
						<div className="grid">
							{failedUploads.map((upload) => (
								<div key={upload._id} className="vcard">
									{upload.imageUrl ? (
										<img
											src={upload.imageUrl}
											alt="Failed Upload"
											className="shot"
										/>
									) : (
										<div className="shot shot-empty">
											<span className="text-muted-foreground text-xs">
												No image
											</span>
										</div>
									)}
									<div className="mb-3">
										<div className="mb-2">
											<span
												className={
													upload.failureType === "validation"
														? "status s-flagged"
														: "status s-failed"
												}
											>
												<i />
												{upload.failureType}
											</span>
										</div>
										<div className="mb-1 text-muted-foreground text-xs">
											ID: {upload._id}
										</div>
										<div className="mb-1 text-sm">
											<span className="font-medium">Reason: </span>
											<span className="text-red-600">
												{upload.failureReason}
											</span>
										</div>
										{upload.errorMessage && (
											<div className="mb-1 text-sm">
												<span className="font-medium">Error: </span>
												<span className="text-muted-foreground">
													{upload.errorMessage}
												</span>
											</div>
										)}
										{upload.extractedType && (
											<div className="mb-1 text-sm">
												<span className="font-medium">Extracted Type: </span>
												<span className="text-muted-foreground">
													€{upload.extractedType}
												</span>
											</div>
										)}
										{upload.extractedBarcode && (
											<div className="mb-1 text-sm">
												<span className="font-medium">Extracted Barcode: </span>
												<span className="text-muted-foreground">
													{upload.extractedBarcode}
												</span>
											</div>
										)}
										{upload.extractedExpiryDate && (
											<div className="mb-1 text-sm">
												<span className="font-medium">Extracted Expiry: </span>
												<span className="text-muted-foreground">
													{upload.extractedExpiryDate}
												</span>
											</div>
										)}
										<div className="text-muted-foreground text-sm">
											Failed {formatDateTime(upload._creationTime)}
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</>
			)}

			{/* Reports Filed Tab */}
			{activeTab === "reportsFiled" && (
				<>
					{reportsFiledByUser.length === 0 ? (
						<div className="empty">No reports filed</div>
					) : (
						<div className="grid">
							{reportsFiledByUser.map((report) => (
								<div key={report._id} className="vcard">
									{report.voucher?.imageUrl ? (
										<img
											src={report.voucher.imageUrl}
											alt="Voucher"
											className="shot"
										/>
									) : (
										<div className="shot shot-empty">
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
											Reported on {formatDateTime(report.createdAt)}
										</div>
										{report.voucher?.createdAt && (
											<div className="mb-1 text-muted-foreground text-sm">
												Uploaded {formatDateTime(report.voucher.createdAt)}
											</div>
										)}
										<div className="text-muted-foreground text-sm">
											Uploaded by{" "}
											{report.uploader ? (
												<Link
													to="/admin/users/$userId"
													params={{ userId: report.uploader._id }}
													className="u-name"
												>
													{report.uploader.username ||
														report.uploader.firstName ||
														report.uploader.telegramChatId}
												</Link>
											) : (
												"Unknown"
											)}
										</div>
									</div>
									<div className="reason">
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
				</>
			)}

			{/* Reports Against Tab */}
			{activeTab === "reportsAgainst" && (
				<>
					{reportsAgainstUploads.length === 0 ? (
						<div className="empty">No reports against uploads</div>
					) : (
						<div className="grid">
							{reportsAgainstUploads.map((report) => (
								<div key={report._id} className="vcard">
									{report.voucher?.imageUrl ? (
										<img
											src={report.voucher.imageUrl}
											alt="Voucher"
											className="shot"
										/>
									) : (
										<div className="shot shot-empty">
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
											Reported on {formatDateTime(report.createdAt)}
										</div>
										{report.voucher?.createdAt && (
											<div className="mb-1 text-muted-foreground text-sm">
												Uploaded {formatDateTime(report.voucher.createdAt)}
											</div>
										)}
										<div className="text-muted-foreground text-sm">
											Reported by{" "}
											{report.reporter ? (
												<Link
													to="/admin/users/$userId"
													params={{ userId: report.reporter._id }}
													className="u-name"
												>
													{report.reporter.username ||
														report.reporter.firstName ||
														report.reporter.telegramChatId}
												</Link>
											) : (
												"Unknown"
											)}
										</div>
									</div>
									<div className="reason">
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
				</>
			)}

			{/* Messages Tab (Feedback + Admin Messages) */}
			{activeTab === "messages" && (
				<>
					{/* Feedback & Support Messages */}
					{feedbackAndSupport.length === 0 ? (
						<div className="empty">No feedback or support messages</div>
					) : (
						<div>
							{feedbackAndSupport.map((item: any) => (
								<article
									key={item._id}
									className={`msg${item.status === "new" ? "fresh" : ""}${
										item.type === "support" ? "support" : ""
									}`}
								>
									<div className="msg-head">
										<span className="msg-user">
											{item.type === "feedback" ? "Feedback" : "Support"}
										</span>
										<span className="msg-meta">
											{formatDateTime(item.createdAt)}
										</span>
										<span className="intent">{item.status}</span>
									</div>
									<p className="msg-text">{item.text}</p>
								</article>
							))}
						</div>
					)}

					{/* Admin Messages */}
					<div className="stack">
						<h2 className="display" style={{ fontSize: 22 }}>
							Admin messages
						</h2>

						<div className="thread">
							{adminMessages.length === 0 ? (
								<div className="empty">No admin messages sent to this user</div>
							) : (
								adminMessages.map((message: any) => (
									<div key={message._id} className="bubble">
										<p>{message.text}</p>
										<p className="msg-meta">
											{formatDateTime(message.createdAt)}
										</p>
									</div>
								))
							)}
						</div>

						<div className="composer">
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
								className="input"
								disabled={sendMessageMutation.isPending}
							/>
							<button
								type="button"
								className="btn btn-gold"
								onClick={() =>
									messageText.trim() && sendMessageMutation.mutate(messageText)
								}
								disabled={sendMessageMutation.isPending || !messageText.trim()}
							>
								{sendMessageMutation.isPending ? "Sending..." : "Send"}
							</button>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
