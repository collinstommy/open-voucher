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

type GroupedResults = {
	filename: string;
	results: EvalResult[];
};

function EvalCard({ group }: { group: GroupedResults }) {
	const imageUrl = `/test-images/${group.filename}`;
	const passed = group.results.filter((r) => r.success).length;

	return (
		<div className="overflow-hidden rounded-lg border shadow-sm">
			<div className="grid grid-cols-[350px_1fr]">
				<div className="bg-muted/30 p-4">
					<img
						src={imageUrl}
						alt={group.filename}
						className="h-auto w-full rounded border bg-white object-contain"
					/>
				</div>
				<div className="p-4">
					<div className="mb-3 flex items-center justify-between">
						<h3 className="font-semibold">{group.filename}</h3>
						<span className="text-muted-foreground text-sm">
							{passed}/{group.results.length} passed
						</span>
					</div>
					<div className="grid grid-cols-3 gap-4">
						{group.results.map((result) => (
							<div
								key={result.testDate}
								className={`rounded border p-3 ${
									result.success
										? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
										: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
								}`}
							>
								<div className="mb-2 flex items-center gap-2">
									{result.success ? (
										<CheckCircle2 className="h-4 w-4 text-green-600" />
									) : (
										<XCircle className="h-4 w-4 text-red-600" />
									)}
									<span className="font-medium text-sm">{result.testDate}</span>
								</div>
								{result.error ? (
									<p className="text-red-600 text-xs">{result.error}</p>
								) : (
									<div className="space-y-1 text-xs">
										<div className="text-muted-foreground">
											Exp: {result.expectedValidFrom} → {result.expectedExpiry}
										</div>
										<div
											className={
												result.success ? "text-green-600" : "text-red-600"
											}
										>
											Act: {result.actualValidFrom ?? "N/A"} →{" "}
											{result.actualExpiry ?? "N/A"}
										</div>
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

const TEST_IMAGE_FILES = [
	"23dec-5jan.jpg",
	"29dec-7jan.jpg",
	"30Dec-8jan.jpg",
	"dec21-jan5.jpg",
	"26jan-1feb.jpg",
	"jan26-feb01.jpg",
	"feb2nd-feb11th.jpg",
	"feb11-feb17.jpg",
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
	const [useOpenRouter, setUseOpenRouter] = useState(false);

	const handleRunEvals = async () => {
		if (!token) return;
		setIsLoading(true);
		try {
			const imagesMap = new Map<string, string>();

			await Promise.all(
				TEST_IMAGE_FILES.map(async (filename) => {
					const imageUrl = `/test-images/${filename}`;
					const imageBase64 = await fetchImageAsBase64(imageUrl);
					imagesMap.set(filename, imageBase64);
				}),
			);

			const results = await Promise.all(
				TEST_IMAGE_FILES.map((filename) =>
					convex.action(api.admin.runSingleOcrEval, {
						token,
						filename,
						imageBase64: imagesMap.get(filename)!,
						useOpenRouter,
					}),
				),
			);

			const evalResults = results.flatMap((r) =>
				r.results.map((result) => ({
					filename: result.filename,
					testDate: result.testDate,
					success: result.success,
					expectedValidFrom: result.expectedValidFrom,
					expectedExpiry: result.expectedExpiry,
					actualValidFrom: result.actualValidFrom,
					actualExpiry: result.actualExpiry,
					error: result.error,
				})),
			);

			const passed = evalResults.filter((r) => r.success).length;
			setResults({
				overallSuccess: passed === evalResults.length,
				passed,
				total: evalResults.length,
				results: evalResults,
			});
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

			<div className="mb-6 flex items-center gap-4">
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

				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={useOpenRouter}
						onChange={(e) => setUseOpenRouter(e.target.checked)}
						className="rounded border-gray-300"
					/>
					Use OpenRouter (fallback)
				</label>
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

					<div className="space-y-4">
						{Object.entries(
							results.results.reduce<Record<string, EvalResult[]>>(
								(acc, result) => {
									if (!acc[result.filename]) {
										acc[result.filename] = [];
									}
									acc[result.filename].push(result);
									return acc;
								},
								{},
							),
						).map(([filename, groupResults]) => (
							<EvalCard
								key={filename}
								group={{ filename, results: groupResults }}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
