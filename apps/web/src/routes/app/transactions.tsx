import { AppHeader } from "@/components/mini-app/AppHeader";
import { api } from "@open-voucher/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { createFileRoute } from "@tanstack/react-router";
import dayjs from "dayjs";

export const Route = createFileRoute("/app/transactions")({
	component: TransactionsPage,
});

function formatType(type: string): string {
	switch (type) {
		case "signup_bonus":
			return "Signup Bonus";
		case "upload_reward":
			return "Upload Reward";
		case "claim_spend":
			return "Claim Spent";
		case "refund":
		case "report_refund":
			return "Refund";
		case "uploader_denied":
			return "Upload Denied";
		case "replacement_received":
			return "Replacement Received";
		default:
			return type.replace(/_/g, " ");
	}
}

function TransactionsPage() {
	const transactions = useQuery(api.users.getTransactionHistory);

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<AppHeader title="Transactions" />
			<div className="flex-1 overflow-auto bg-slate-50 p-4">
				{transactions === undefined && (
					<p className="text-sm text-slate-500 text-center py-8">Loading...</p>
				)}
				{transactions === null && (
					<p className="text-sm text-red-600 text-center py-8">
						Something went wrong
					</p>
				)}
				{transactions !== undefined && transactions !== null && (
					<>
						<p className="text-xs text-slate-500 mb-3">Last 25 coin movements</p>
						{transactions.length > 0 ? (
							<ul className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
								{transactions.map((t, i) => {
									const isCredit = t.amount > 0;
									const isNeutral = t.amount === 0;
									const formattedAmount = isNeutral
										? "0"
										: t.amount > 0
											? `+${t.amount}`
											: `${t.amount}`;
									return (
										<li
											key={`${t._id}-${i}`}
											className="flex justify-between items-center px-4 py-3 border-b border-slate-100 last:border-0"
										>
											<div>
												<p className="text-sm font-medium text-slate-900">
													{formatType(t.type)}
												</p>
												<p className="text-xs text-slate-400">
													{dayjs(t.createdAt).format("MMM D, YYYY")}
												</p>
											</div>
											<span
												className={`text-sm font-bold tabular-nums ${
													isNeutral
														? "text-slate-500"
														: isCredit
															? "text-green-600"
															: "text-red-500"
												}`}
											>
												{formattedAmount}
											</span>
										</li>
									);
								})}
							</ul>
						) : (
							<p className="text-sm text-slate-500 text-center py-8">
								No transactions yet.
							</p>
						)}
					</>
				)}
			</div>
		</div>
	);
}
