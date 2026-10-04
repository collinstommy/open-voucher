import { api } from "@open-voucher/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useConvex } from "convex/react";
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
	correct: boolean;
};

type IntentEvalsResponse = {
	total: number;
	correct: number;
	accuracy: number;
	byExpected: Record<string, { total: number; correct: number }>;
	results: IntentEvalResult[];
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
		<article className="panel">
			<div className="ocr">
				<div className="ocr-side">
					<img src={imageUrl} alt={group.filename} />
				</div>
				<div className="panel-body">
					<div className="vhead">
						<h3 className="display" style={{ fontSize: 20 }}>
							{group.filename}
						</h3>
						<span className="note">
							{passed}/{group.results.length} passed
						</span>
					</div>
					<div className="grid" style={{ marginTop: 16 }}>
						{group.results.map((result) => (
							<div
								key={result.testDate}
								className={result.success ? "result ok" : "result bad"}
							>
								<span
									className={
										result.success ? "status s-available" : "status s-failed"
									}
								>
									<i />
									{result.testDate}
								</span>
								{result.error ? (
									<p className="warn">{result.error}</p>
								) : (
									<div className="meta-line">
										<span>
											Exp: {result.expectedValidFrom} → {result.expectedExpiry}
										</span>
										<span>
											Act: {result.actualValidFrom ?? "N/A"} →{" "}
											{result.actualExpiry ?? "N/A"}
										</span>
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			</div>
		</article>
	);
}

function IntentResultCard({ result }: { result: IntentEvalResult }) {
	return (
		<article className={result.correct ? "result ok" : "result bad"}>
			<span
				className={result.correct ? "status s-available" : "status s-failed"}
			>
				<i />
				{result.correct ? "correct" : "mismatch"}
			</span>
			<p className="msg-text">{result.text}</p>
			<div className="meta-line">
				<span className="intent">Expected {result.expected}</span>
				<span className="intent">Predicted {result.predicted}</span>
				<span className="note">
					conf {Math.round(result.confidence * 100)}%
				</span>
			</div>
		</article>
	);
}

function EvalsPage() {
	const { token } = useAdminAuth();
	const convex = useConvex();

	const [ocrResults, setOcrResults] = useState<OcrEvalsResponse | null>(null);
	const [ocrLoading, setOcrLoading] = useState(false);
	const [useOpenRouter, setUseOpenRouter] = useState(false);

	const [intentResults, setIntentResults] =
		useState<IntentEvalsResponse | null>(null);
	const [intentLoading, setIntentLoading] = useState(false);

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
						imageBase64: imagesMap.get(filename) ?? "",
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

	return (
		<div className="stack">
			<div className="masthead">
				<div>
					<h1 className="display">Evals</h1>
					<p className="lede">OCR date reads and intent classification.</p>
				</div>
			</div>

			<section className="stack">
				<div className="panel-head" style={{ padding: 0, border: 0 }}>
					<h2>OCR evaluations</h2>
				</div>
				<div className="actions">
					<button
						type="button"
						className="btn btn-gold"
						onClick={handleRunOcrEvals}
						disabled={!token || ocrLoading}
					>
						{ocrLoading ? "Running OCR evals..." : "Run OCR evals"}
					</button>
					<label className="check">
						<input
							type="checkbox"
							checked={useOpenRouter}
							onChange={(e) => setUseOpenRouter(e.target.checked)}
						/>
						Use OpenRouter
					</label>
				</div>

				{ocrResults && (
					<div className="stack">
						<article
							className={ocrResults.overallSuccess ? "result ok" : "result bad"}
						>
							<div className="result-row">
								<span
									className={
										ocrResults.overallSuccess
											? "status s-available"
											: "status s-failed"
									}
								>
									<i />
									{ocrResults.overallSuccess ? "passed" : "failed"}
								</span>
								<h3>
									{ocrResults.passed} of {ocrResults.total} tests passed
								</h3>
							</div>
						</article>
						<div className="stack">
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
			<section className="stack">
				<div className="panel-head" style={{ padding: 0, border: 0 }}>
					<h2>Intent evaluations</h2>
				</div>
				<div className="actions">
					<button
						type="button"
						className="btn btn-gold"
						onClick={handleRunIntentEvals}
						disabled={!token || intentLoading}
					>
						{intentLoading ? "Running intent evals..." : "Run intent evals"}
					</button>
				</div>

				{intentResults && (
					<div className="stack">
						<article
							className={
								intentResults.accuracy === 1 ? "result ok" : "result bad"
							}
						>
							<div className="result-row">
								<span
									className={
										intentResults.accuracy === 1
											? "status s-available"
											: "status s-failed"
									}
								>
									<i />
									{intentResults.accuracy === 1 ? "passed" : "failed"}
								</span>
								<h3>
									{intentResults.correct} of {intentResults.total} tests passed
									({Math.round(intentResults.accuracy * 100)}%)
								</h3>
							</div>
						</article>

						<div className="stats">
							{Object.entries(intentResults.byExpected)
								.sort()
								.map(([label, stats]) => (
									<div key={label} className="stat">
										<div className="k">{label}</div>
										<div className="v num">
											{stats.correct}/{stats.total}
										</div>
										<div className="n">
											{Math.round((stats.correct / stats.total) * 100) || 0}%
										</div>
									</div>
								))}
						</div>

						<div className="stack">
							<h3 className="display" style={{ fontSize: 22 }}>
								Results
								<span className="note">
									{" "}
									{intentResults.results.length} cases
								</span>
							</h3>
							<div className="stack">
								{intentResults.results.map((result) => (
									<IntentResultCard
										key={`${result.expected}:${result.predicted}:${result.text}`}
										result={result}
									/>
								))}
							</div>
						</div>
					</div>
				)}
			</section>
		</div>
	);
}
