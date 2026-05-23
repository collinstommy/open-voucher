import { AppHeader } from "@/components/mini-app/AppHeader";
import { api } from "@open-voucher/backend/convex/_generated/api";
import { useConvex } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useUserAuth } from "@/hooks/useUserAuth";

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
		default:
			return type.replace(/_/g, " ");
	}
}

function TransactionsPage() {
	const { user } = useUserAuth();
	const convex = useConvex();

	const { data: transactions, isPending, error } = useQuery({
		queryKey: ["userTransactions", user?.sessionToken],
		queryFn: () =>
			convex.query(api.users.getTransactionHistory, {
				sessionToken: user!.sessionToken,
			}),
		enabled: !!user,
		staleTime: 10_000,
	});

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<AppHeader variant="back" title="Transactions" />
			<div className="flex-1 overflow-auto bg-slate-50 p-4">
				{isPending && (
					<p className="text-sm text-slate-500 text-center py-8">Loading...</p>
				)}
				{error && (
					<p className="text-sm text-red-600 text-center py-8">
						{error.message ?? "Something went wrong"}
					</p>
				)}
				{!isPending && !error && (
					<>
						<p className="text-xs text-slate-500 mb-3">Last 25 coin movements</p>
						{transactions && transactions.length > 0 ? (
							<ul className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
								{transactions.map((t, i) => {
									const isCredit = t.amount > 0;
									const formattedAmount =
										t.amount > 0 ? `+${t.amount}` : `${t.amount}`;
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
													isCredit
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
