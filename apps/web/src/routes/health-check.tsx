import { useAdminAuth } from "@/hooks/useAdminAuth";
import { api } from "@open-voucher/backend/convex/_generated/api";
import { useConvex } from "convex/react";
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, XCircle, RefreshCw, Activity } from "lucide-react";

export const Route = createFileRoute("/health-check")({
	component: HealthCheckPage,
});

type HealthCheckResult = {
	ocrTest: { success: boolean; message: string };
	voucherCount: { success: boolean; count: number; message: string };
	telegramToken: { success: boolean; message: string };
};

function HealthCheckCard({
	title,
	success,
	message,
}: {
	title: string;
	success: boolean;
	message: string;
}) {
	return (
		<div
			className={`border rounded-lg p-4 shadow-sm transition-all ${
				success
					? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800"
					: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
			}`}
		>
			<div className="flex items-center gap-3 mb-2">
				<div
					className={`rounded-full p-2 ${
						success
							? "bg-green-100 dark:bg-green-900"
							: "bg-red-100 dark:bg-red-900"
					}`}
				>
					{success ? (
						<CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
					) : (
						<XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
					)}
				</div>
				<h2 className="font-semibold text-foreground">{title}</h2>
			</div>
			<p className="ml-12 text-sm text-muted-foreground">{message}</p>
		</div>
	);
}

function HealthCheckPage() {
	const { token } = useAdminAuth();
	const convex = useConvex();
	const [results, setResults] = useState<HealthCheckResult | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const handleRunCheck = async () => {
		if (!token) return;
		setIsLoading(true);
		try {
			const result = await convex.action(api.admin.runHealthCheck, {
				token,
			});
			setResults(result as HealthCheckResult);
		} catch (error) {
			console.error("Health check failed:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const allPassed = results
		? results.ocrTest.success &&
		  results.voucherCount.success &&
		  results.telegramToken.success
		: false;

	return (
		<div className="mx-auto w-full max-w-2xl p-6">
			<div className="flex items-center gap-3 mb-6">
				<div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900">
					<Activity className="h-6 w-6 text-blue-600 dark:text-blue-400" />
				</div>
				<h1 className="text-2xl font-bold">System Health</h1>
			</div>

			<div className="mb-6">
				<button
					type="button"
					onClick={handleRunCheck}
					disabled={!token || isLoading}
					className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{isLoading ? (
						<>
							<RefreshCw className="h-4 w-4 animate-spin" />
							Running...
						</>
					) : (
						<>
							<RefreshCw className="h-4 w-4" />
							Run Health Check
						</>
					)}
				</button>
			</div>

			{!token && (
				<p className="text-muted-foreground mb-4">
					Please log in to run health checks.
				</p>
			)}

			{results && (
				<div className="space-y-4">
					<div
						className={`border rounded-lg p-4 shadow-sm ${
							allPassed
								? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800"
								: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
						}`}
					>
						<div className="flex items-center gap-3">
							{allPassed ? (
								<CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
							) : (
								<XCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
							)}
							<div>
								<h3 className="font-semibold text-foreground">
									{allPassed ? "All Systems Operational" : "Some Checks Failed"}
								</h3>
								<p className="text-sm text-muted-foreground">
									{allPassed
										? "Everything is working correctly"
										: "Review the results below for details"}
								</p>
							</div>
						</div>
					</div>

					<HealthCheckCard
						title="OCR Test"
						success={results.ocrTest.success}
						message={results.ocrTest.message}
					/>

					<HealthCheckCard
						title="Available Vouchers"
						success={results.voucherCount.success}
						message={results.voucherCount.message}
					/>

					<HealthCheckCard
						title="Telegram Token"
						success={results.telegramToken.success}
						message={results.telegramToken.message}
					/>
				</div>
			)}
		</div>
	);
}
