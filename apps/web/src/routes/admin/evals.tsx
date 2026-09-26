import { api } from "@open-voucher/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { CheckCircle2, ClipboardCheck, RefreshCw, XCircle } from "lucide-react";
import { useState } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export const Route = createFileRoute("/admin/evals")({
	component: EvalsPage,
});

type OcrEvalResult = {
	filename: string;
	testDate: string;
	success: boolean;
	expectedValidFrom?: string;
	expectedExpiry: string;
	actualValidFrom?: string;
	actualExpiry?: string;
	error?: string;
};

type OcrEvalsResponse = {
	overallSuccess: boolean;
	passed: number;
	total: number;
	results: OcrEvalResult[];
};

type GroupedOcrResults = {
	filename: string;
	results: OcrEvalResult[];
};

type IntentEvalResult = {
	text: string;
	expected: string;
	predicted: string;
	confidence: number;
	escalated: boolean;
	escalateExpected: boolean | null;
	correct: boolean;
	escalateCorrect: boolean;
};

type IntentEvalsResponse = {
	total: number;
	correct: number;
	accuracy: number;
	escalateCorrect: number;
	escalateTotal: number;
	escalateAccuracy: number;
	byExpected: Record<string, { total: number; correct: number }>;
	results: IntentEvalResult[];
};

type ProbeResult = {
	text: string;
	previousIntent: string | null;
	predicted: string;
	confidence: number;
	escalated: boolean;
	changed: boolean;
	createdAt: number;
};

type ProbeResponse = {
	requested: number;
	processed: number;
	results: ProbeResult[];
};

const LABEL_COLORS: Record<string, string> = {
	return_voucher:
		"bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
	revoke_upload:
		"bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
	report_not_working:
		"bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300",
	how_does_it_work:
		"bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300",
	balance:
		"bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
	limits_question:
		"bg-cyan-100 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300",
	praise_or_noise:
		"bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300",
	request_voucher:
		"bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300",
	why_rejected:
		"bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
	unknown: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const TEST_IMAGE_FILES = [
	"23dec-5jan.jpg",
	"29dec-7jan.jpg",
	"30Dec-8jan.jpg",
	"dec21-jan5.jpg",
	"26jan-1feb.jpg",
	"jan26-feb01.jpg",
	"feb2nd-feb11th.jpg",
	"feb11-feb17.jpg",
	"mar15-mar21.png",
	"mar23-mar-29-paper.png",
	"threeplus-expire-mar-31.png",
	"apr23-may9",
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
			const base64Data = base64.split(",")[1];
			resolve(base64Data);
		};
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

function OcrEvalCard({ group }: { group: GroupedOcrResults }) {
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

function IntentResultCard({ result }: { result: IntentEvalResult }) {
	const expectedColor = LABEL_COLORS[result.expected] ?? LABEL_COLORS.unknown;
	const predictedColor = LABEL_COLORS[result.predicted] ?? LABEL_COLORS.unknown;

	return (
		<div
			className={`rounded-lg border p-4 ${
				result.correct && result.escalateCorrect
					? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
					: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
			}`}
		>
			<div className="mb-2 flex items-center gap-2">
				{result.correct && result.escalateCorrect ? (
					<CheckCircle2 className="h-4 w-4 text-green-600" />
				) : (
					<XCircle className="h-4 w-4 text-red-600" />
				)}
				<span className="font-medium text-sm">
					{result.correct && result.escalateCorrect ? "Correct" : "Mismatch"}
				</span>
			</div>
			<p className="mb-3 text-sm">{result.text}</p>
			<div className="flex flex-wrap items-center gap-2 text-xs">
				<span className={`rounded px-2 py-1 ${expectedColor}`}>
					Expected: {result.expected}
				</span>
				<span className={`rounded px-2 py-1 ${predictedColor}`}>
					Predicted: {result.predicted}
				</span>
				<span className="text-muted-foreground">
					conf: {Math.round(result.confidence * 100)}%
				</span>
				{result.escalateExpected !== null && (
					<span
						className={`rounded px-2 py-1 ${
							result.escalateCorrect
								? "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300"
								: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300"
						}`}
					>
						escalate: {result.escalated ? "yes" : "no"} (exp{" "}
						{result.escalateExpected ? "yes" : "no"})
					</span>
				)}
			</div>
		</div>
	);
}

function EvalsPage() {
	const { token } = useAdminAuth();
	const convex = useConvex();

	const [ocrResults, setOcrResults] = useState<OcrEvalsResponse | null>(null);
	const [ocrLoading, setOcrLoading] = useState(false);
	const [useOpenRouter, setUseOpenRouter] = useState(false);

	const [intentResults, setIntentResults] = useState<IntentEvalsResponse | null>(
		null,
	);
	const [intentLoading, setIntentLoading] = useState(false);

	const [probeResults, setProbeResults] = useState<ProbeResponse | null>(null);
	const [probeLoading, setProbeLoading] = useState(false);
	const [probeLimit, setProbeLimit] = useState(50);

	const handleRunOcrEvals = async () => {
		if (!token) return;
		setOcrLoading(true);
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
					convex.action(api.telegram.runSingleOcrEval, {
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
			setOcrResults({
				overallSuccess: passed === evalResults.length,
				passed,
				total: evalResults.length,
				results: evalResults,
			});
		} catch (error) {
			console.error("OCR evals failed:", error);
		} finally {
			setOcrLoading(false);
		}
	};

	const handleRunIntentEvals = async () => {
		if (!token) return;
		setIntentLoading(true);
		try {
			const result = await convex.action(api.adminEvals.runIntentEvals, {
				token,
			});
			setIntentResults(result);
		} catch (error) {
			console.error("Intent evals failed:", error);
		} finally {
			setIntentLoading(false);
		}
	};

	const handleRunProbe = async () => {
		if (!token) return;
		setProbeLoading(true);
		setProbeResults(null);
		try {
			const result = await convex.action(api.adminEvals.runIntentProbe, {
				token,
				limit: probeLimit,
			});
			setProbeResults(result);
		} catch (error) {
			console.error("Classifier probe failed:", error);
		} finally {
			setProbeLoading(false);
		}
	};

	return (
		<div className="mx-auto w-full max-w-4xl p-6">
			<div className="mb-6 flex items-center gap-3">
				<div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900">
					<ClipboardCheck className="h-6 w-6 text-purple-600 dark:text-purple-400" />
				</div>
				<h1 className="font-bold text-2xl">Evaluations</h1>
			</div>

			{!token && (
				<p className="mb-4 text-muted-foreground">
					Please log in to run evaluations.
				</p>
			)}

			{/* OCR Evals Section */}
			<section className="mb-10">
				<div className="mb-4 flex items-center gap-3">
					<h2 className="font-semibold text-xl">OCR Evaluations</h2>
				</div>

				<div className="mb-6 flex items-center gap-4">
					<button
						type="button"
						onClick={handleRunOcrEvals}
						disabled={!token || ocrLoading}
						className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{ocrLoading ? (
							<>
								<RefreshCw className="h-4 w-4 animate-spin" />
								Running OCR Evals...
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

				{ocrResults && (
					<div className="space-y-6">
						<div
							className={`rounded-lg border p-4 shadow-sm ${
								ocrResults.overallSuccess
									? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
									: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
							}`}
						>
							<div className="flex items-center gap-3">
								{ocrResults.overallSuccess ? (
									<CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
								) : (
									<XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
								)}
								<div>
									<h3 className="font-semibold text-foreground">
										{ocrResults.overallSuccess
											? "All Tests Passed"
											: "Some Tests Failed"}
									</h3>
									<p className="text-muted-foreground text-sm">
										{ocrResults.passed} of {ocrResults.total} tests passed
									</p>
								</div>
							</div>
						</div>

						<div className="space-y-4">
							{Object.entries(
								ocrResults.results.reduce<Record<string, OcrEvalResult[]>>(
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
								<OcrEvalCard
									key={filename}
									group={{ filename, results: groupResults }}
								/>
							))}
						</div>
					</div>
				)}
			</section>

			{/* Intent Evals Section */}
			<section>
				<div className="mb-4 flex items-center gap-3">
					<h2 className="font-semibold text-xl">Intent Evaluations</h2>
				</div>

				<div className="mb-6 flex items-center gap-4">
					<button
						type="button"
						onClick={handleRunIntentEvals}
						disabled={!token || intentLoading}
						className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{intentLoading ? (
							<>
								<RefreshCw className="h-4 w-4 animate-spin" />
								Running Intent Evals...
							</>
						) : (
							<>
								<RefreshCw className="h-4 w-4" />
								Run Intent Evals
							</>
						)}
					</button>
				</div>

				{intentResults && (
					<div className="space-y-6">
						<div
							className={`rounded-lg border p-4 shadow-sm ${
								intentResults.accuracy === 1
									? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
									: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
							}`}
						>
							<div className="flex items-center gap-3">
								{intentResults.accuracy === 1 ? (
									<CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
								) : (
									<XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
								)}
								<div>
									<h3 className="font-semibold text-foreground">
										{intentResults.accuracy === 1
											? "All Tests Passed"
											: "Some Tests Failed"}
									</h3>
									<p className="text-muted-foreground text-sm">
										{intentResults.correct} of {intentResults.total} tests passed (
										{Math.round(intentResults.accuracy * 100)}%)
									</p>
									{intentResults.escalateTotal > 0 && (
										<p className="text-muted-foreground text-xs">
											escalate: {intentResults.escalateCorrect}/
											{intentResults.escalateTotal} (
											{Math.round(intentResults.escalateAccuracy * 100)}%)
										</p>
									)}
								</div>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
							{Object.entries(intentResults.byExpected)
								.sort()
								.map(([label, stats]) => (
									<div key={label} className="rounded-md border p-3">
										<div className="mb-1 text-muted-foreground text-xs">
											{label}
										</div>
										<div className="font-semibold text-xl">
											{stats.correct}/{stats.total}
										</div>
										<div className="text-muted-foreground text-xs">
											{Math.round((stats.correct / stats.total) * 100) || 0}%
										</div>
									</div>
								))}
						</div>

						<div>
							<h3 className="mb-4 font-medium">
								Results{" "}
								<span className="text-muted-foreground text-sm">
									({intentResults.results.length} cases)
								</span>
							</h3>
							<div className="space-y-3">
								{intentResults.results.map((result, index) => (
									<IntentResultCard key={index} result={result} />
								))}
							</div>
						</div>
					</div>
				)}
			</section>

			{/* Classifier Probe Section */}
			<section className="mt-10">
				<div className="mb-4 flex items-center gap-3">
					<h2 className="font-semibold text-xl">Classifier Probe</h2>
				</div>
				<p className="mb-4 text-muted-foreground text-sm">
					Pull recent real inbound messages from prod and re-classify them with
					the current prompt, so you can see how the new labels perform against
					actual traffic before any backfill lands.
				</p>

				<div className="mb-6 flex items-center gap-4">
					<label className="flex items-center gap-2 text-sm">
						<span>Limit</span>
						<input
							type="number"
							min={1}
							max={500}
							value={probeLimit}
							onChange={(e) => setProbeLimit(Number(e.target.value) || 1)}
							className="w-24 rounded-md border-gray-300 bg-background px-3 py-2 text-sm"
						/>
					</label>

					<button
						type="button"
						onClick={handleRunProbe}
						disabled={!token || probeLoading}
						className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{probeLoading ? (
							<>
								<RefreshCw className="h-4 w-4 animate-spin" />
								Running Probe...
							</>
						) : (
							<>
								<RefreshCw className="h-4 w-4" />
								Run Probe
							</>
						)}
					</button>
				</div>

				{probeResults && (
					<div>
						<div className="mb-4 text-muted-foreground text-sm">
							Classified {probeResults.processed} of {probeResults.requested}{" "}
							requests.{" "}
							{probeResults.results.filter((r) => r.changed).length} would
							change under the new classifier.
						</div>

						{probeResults.results.length === 0 && (
							<div className="rounded-lg border border-slate-200 p-4 text-center text-muted-foreground text-sm">
								No recent inbound messages found to probe.
							</div>
						)}

						<div className="space-y-3">
							{probeResults.results.map((result, index) => {
								const predictedColor =
									LABEL_COLORS[result.predicted] ?? LABEL_COLORS.unknown;
								return (
									<div
										key={index}
										className={`rounded-lg border p-4 ${
											result.changed
												? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20"
												: "border-slate-200 dark:border-slate-800"
										}`}
									>
										<p className="mb-3 text-sm">{result.text}</p>
										<div className="flex flex-wrap items-center gap-2 text-xs">
											<span className={`rounded px-2 py-1 ${predictedColor}`}>
												{result.predicted}
											</span>
											{result.previousIntent && (
												<span className="text-muted-foreground">
													was: {result.previousIntent}
												</span>
											)}
											<span className="text-muted-foreground">
												conf: {Math.round(result.confidence * 100)}%
											</span>
											{result.escalated && (
												<span className="rounded bg-red-100 px-2 py-1 text-red-700 dark:bg-red-950/30 dark:text-red-300">
													⚠️ escalate
												</span>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				)}
			</section>
		</div>
	);
}
