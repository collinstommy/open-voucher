import { api } from "@open-voucher/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { CheckCircle2, ClipboardCheck, RefreshCw, XCircle } from "lucide-react";
import { useState } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export const Route = createFileRoute("/evals")({
	component: EvalsPage,
});

type EvalResult = {
	filename: string;
	testDate: string;
	success: boolean;
	expectedValidFrom: string;
	expectedExpiry: string;
	actualValidFrom?: string;
	actualExpiry?: string;
	error?: string;
};

type EvalsResponse = {
	overallSuccess: boolean;
	passed: number;
	total: number;
	results: EvalResult[];
};

function EvalResultRow({ result }: { result: EvalResult }) {
	return (
		<tr className="border-border border-b last:border-b-0">
			<td className="px-4 py-3 font-medium">{result.filename}</td>
			<td className="px-4 py-3 text-muted-foreground text-sm">
				{result.testDate}
			</td>
			<td className="px-4 py-3">
				<div className="flex items-center gap-2">
					{result.success ? (
						<CheckCircle2 className="h-5 w-5 text-green-600" />
					) : (
						<XCircle className="h-5 w-5 text-red-600" />
					)}
					<span className={result.success ? "text-green-600" : "text-red-600"}>
						{result.success ? "Pass" : "Fail"}
					</span>
				</div>
			</td>
			<td className="px-4 py-3 text-sm">
				{result.error ? (
					<span className="text-red-600">{result.error}</span>
				) : (
					<div className="space-y-1">
						<div className="text-muted-foreground">
							Expected: {result.expectedValidFrom} → {result.expectedExpiry}
						</div>
						<div className={result.success ? "text-green-600" : "text-red-600"}>
							Actual: {result.actualValidFrom ?? "N/A"} →{" "}
							{result.actualExpiry ?? "N/A"}
						</div>
					</div>
				)}
			</td>
		</tr>
	);
}

const TEST_IMAGE_FILES = [
	"23dec-3jan.jpg",
	"23dec-5jan.jpg",
	"29dec-7jan.jpg",
	"30Dec-8jan.jpg",
	"dec21-jan5.jpg",
];

async function fetchImageAsBase64(url: string): Promise<string> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch image: ${response.status}`);
	}
	const blob = await response.blob();
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			const base64 = reader.result as string;
			// Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
			const base64Data = base64.split(",")[1];
			resolve(base64Data);
		};
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

function EvalsPage() {
	const { token } = useAdminAuth();
	const convex = useConvex();
	const [results, setResults] = useState<EvalsResponse | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const handleRunEvals = async () => {
		if (!token) return;
		setIsLoading(true);
		try {
			// Fetch all test images and convert to base64
			const images = await Promise.all(
				TEST_IMAGE_FILES.map(async (filename) => {
					const imageUrl = `/test-images/${filename}`;
					const imageBase64 = await fetchImageAsBase64(imageUrl);
					return { filename, imageBase64 };
				}),
			);

			const result = await convex.action(api.admin.runOcrEvals, {
				token,
				images,
			});
			setResults(result as EvalsResponse);
		} catch (error) {
			console.error("Evals failed:", error);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="mx-auto w-full max-w-4xl p-6">
			<div className="mb-6 flex items-center gap-3">
				<div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900">
					<ClipboardCheck className="h-6 w-6 text-purple-600 dark:text-purple-400" />
				</div>
				<h1 className="font-bold text-2xl">OCR Evaluations</h1>
			</div>

			<div className="mb-6">
				<button
					type="button"
					onClick={handleRunEvals}
					disabled={!token || isLoading}
					className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{isLoading ? (
						<>
							<RefreshCw className="h-4 w-4 animate-spin" />
							Running Evaluations...
						</>
					) : (
						<>
							<RefreshCw className="h-4 w-4" />
							Run OCR Evals
						</>
					)}
				</button>
			</div>

			{!token && (
				<p className="mb-4 text-muted-foreground">
					Please log in to run evaluations.
				</p>
			)}

			{results && (
				<div className="space-y-6">
					<div
						className={`rounded-lg border p-4 shadow-sm ${
							results.overallSuccess
								? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
								: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
						}`}
					>
						<div className="flex items-center gap-3">
							{results.overallSuccess ? (
								<CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
							) : (
								<XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
							)}
							<div>
								<h3 className="font-semibold text-foreground">
									{results.overallSuccess
										? "All Tests Passed"
										: "Some Tests Failed"}
								</h3>
								<p className="text-muted-foreground text-sm">
									{results.passed} of {results.total} tests passed
								</p>
							</div>
						</div>
					</div>

					<div className="overflow-hidden rounded-lg border shadow-sm">
						<table className="w-full">
							<thead className="bg-muted">
								<tr>
									<th className="px-4 py-3 text-left font-semibold">Image</th>
									<th className="px-4 py-3 text-left font-semibold">
										Test Date
									</th>
									<th className="px-4 py-3 text-left font-semibold">Result</th>
									<th className="px-4 py-3 text-left font-semibold">Details</th>
								</tr>
							</thead>
							<tbody>
								{results.results.map((result) => (
									<EvalResultRow
										key={`${result.filename}-${result.testDate}`}
										result={result}
									/>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
}
