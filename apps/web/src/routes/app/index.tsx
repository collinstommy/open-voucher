import { api } from "@open-voucher/backend/convex/_generated/api";
import { useConvex } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useUserAuth } from "@/hooks/useUserAuth";
import { useMemo } from "react";

const colors: Record<string, string> = {
	red: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400",
	yellow:
		"bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800 text-yellow-600 dark:text-yellow-400",
	green:
		"bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-600 dark:text-green-400",
	gray: "bg-muted border-border text-muted-foreground",
};

export const Route = createFileRoute("/app/")({
	component: AppIndex,
});

function AppIndex() {
	const { user } = useUserAuth();
	const convex = useConvex();

	const { data: availability, isPending: availPending, error: availError } = useQuery({
		queryKey: ["voucherAvailability"],
		queryFn: () => convex.query(api.vouchers.getVoucherAvailability, {}),
		staleTime: 30_000,
	});

	const { data: transactions, isPending: txPending, error: txError } = useQuery({
		queryKey: ["userTransactions", user?._id],
		queryFn: () =>
			user
				? convex.query(api.users.getTransactionHistory, { sessionToken: user.sessionToken })
				: null,
		enabled: !!user,
		staleTime: 10_000,
	});

	const transactionDisplay = useMemo(() => {
		if (!transactions || transactions.length === 0) return null;

		return transactions.map((t, i) => {
			const date = dayjs(t.createdAt).format("MMM D, YYYY");
			const isSpend =
				t.type === "claim_spend" || t.type === "claim_reversed";
			const prefix = isSpend ? "-" : "+";
			const label = formatType(t.type);
			return (
				<div
					key={`${t._id}-${i}`}
					className="flex items-center justify-between py-2 px-1 border-b border-border last:border-0"
				>
					<div>
						<div className="text-sm font-medium">{label}</div>
						<div className="text-xs text-muted-foreground">{date}</div>
					</div>
					<div
						className={`text-sm font-mono ${isSpend ? "text-destructive" : "text-green-600 dark:text-green-400"}`}
					>
						{prefix}
						{t.amount} coins
					</div>
				</div>
			);
		});
	}, [transactions]);

	const isPending = availPending || txPending;
	const queryError = availError ?? txError;

	if (isPending) {
		return (
			<div className="flex min-h-[60vh] items-center justify-center">
				<div className="text-muted-foreground">Loading...</div>
			</div>
		);
	}

	if (queryError) {
		return (
			<div className="flex min-h-[60vh] items-center justify-center px-4">
				<div className="max-w-sm text-center space-y-4">
					<div className="text-3xl">⚠️</div>
					<p className="text-muted-foreground">
						{queryError.message ?? "Something went wrong"}
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="px-4 py-4 space-y-6">
			{/* Voucher Availability */}
			<section>
				<h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
					Voucher Availability
				</h2>
				<div className="grid grid-cols-3 gap-3">
					{(["5", "10", "20"] as const).map((denom) => {
						const count = availability?.[denom];
						const loaded = count !== undefined;
						const status = loaded
							? count === 0
								? "red"
								: count < 10
									? "yellow"
									: "green"
							: "gray";

						return (
							<div
								key={denom}
								className={`rounded-lg border p-3 text-center ${colors[status]}`}
							>
								<div className="text-lg font-bold">€{denom}</div>
								<div className="text-xs mt-1">
									{loaded
										? count === 0
											? "None"
											: `${count} avail`
										: "..."}
								</div>
							</div>
						);
					})}
				</div>
			</section>

			{/* Transaction History */}
			<section>
				<h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
					Transaction History
				</h2>
				{transactionDisplay ? (
					<div className="rounded-lg border bg-card">{transactionDisplay}</div>
				) : (
					<p className="text-sm text-muted-foreground">
						No transactions yet.
					</p>
				)}
			</section>
		</div>
	);
}

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
