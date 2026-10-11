import { api } from "@open-voucher/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { useState } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export const Route = createFileRoute("/admin/health-check")({
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
		<article className={success ? "result ok" : "result bad"}>
			<div className="result-row">
				<span className={success ? "status s-available" : "status s-failed"}>
					<i />
					{success ? "passed" : "failed"}
				</span>
				<h3>{title}</h3>
			</div>
			<p className="note" style={{ marginTop: 8 }}>
				{message}
			</p>
		</article>
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
			const result = await convex.action(api.telegram.runHealthCheck, {
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
		<div className="stack">
			<div className="masthead">
				<div>
					<h1 className="display">Health Check</h1>
					<p className="lede">OCR, voucher stock, and the Telegram token.</p>
				</div>
				<button
					type="button"
					className="btn btn-gold"
					onClick={handleRunCheck}
					disabled={!token || isLoading}
				>
					{isLoading ? "Running..." : "Run health check"}
				</button>
			</div>

			{results && (
				<div className="stack">
					<article className={allPassed ? "result ok" : "result bad"}>
						<div className="result-row">
							<span
								className={
									allPassed ? "status s-available" : "status s-flagged"
								}
							>
								<i />
								{allPassed ? "passed" : "attention"}
							</span>
							<h3>{allPassed ? "All checks passed" : "Some checks failed"}</h3>
						</div>
					</article>
					<HealthCheckCard
						title="OCR test"
						success={results.ocrTest.success}
						message={results.ocrTest.message}
					/>
					<HealthCheckCard
						title="Available vouchers"
						success={results.voucherCount.success}
						message={results.voucherCount.message}
					/>
					<HealthCheckCard
						title="Telegram token"
						success={results.telegramToken.success}
						message={results.telegramToken.message}
					/>
				</div>
			)}
		</div>
	);
}
