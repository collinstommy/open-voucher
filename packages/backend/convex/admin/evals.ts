import { v } from "convex/values";
import { adminAction } from "./auth";
import { internalAction } from "../_generated/server";
import { classifyMessageText } from "../lib/intentClassifier";
import { INTENT_EVAL_SET, type IntentEvalCase } from "../lib/intentEvalSet";
import type { InboundClassification } from "../lib/messageIntent";

const CONCURRENCY = 10;

type EvalResult = {
	text: string;
	expected: InboundClassification;
	predicted: InboundClassification;
	confidence: number;
	correct: boolean;
};

type EvalRunResult = {
	total: number;
	correct: number;
	accuracy: number;
	byExpected: Record<string, { total: number; correct: number }>;
	results: EvalResult[];
};

async function runPool<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let index = 0;

	async function worker() {
		while (index < items.length) {
			const currentIndex = index++;
			results[currentIndex] = await fn(items[currentIndex]);
		}
	}

	await Promise.all(Array.from({ length: limit }, worker));
	return results;
}

async function runIntentEvalLogic(): Promise<EvalRunResult> {
	const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
	if (!apiKey) {
		throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
	}

	const results = await runPool(INTENT_EVAL_SET, CONCURRENCY, async (item) => {
		const { intent, confidence } = await classifyMessageText(item.text, apiKey);
		return {
			text: item.text,
			expected: item.expected,
			predicted: intent,
			confidence,
			correct: intent === item.expected,
		};
	});

	const correct = results.filter((r) => r.correct).length;
	const byExpected: Record<string, { total: number; correct: number }> = {};

	for (const r of results) {
		const bucket = byExpected[r.expected] ?? { total: 0, correct: 0 };
		bucket.total++;
		if (r.correct) bucket.correct++;
		byExpected[r.expected] = bucket;
	}

	return {
		total: results.length,
		correct,
		accuracy: results.length > 0 ? correct / results.length : 0,
		byExpected,
		results,
	};
}

export const runIntentEvals = adminAction({
	args: { token: v.string() },
	handler: async (_ctx, { token: _token }): Promise<EvalRunResult> => {
		return runIntentEvalLogic();
	},
});

export const runIntentEvalsInternal = internalAction({
	handler: async (): Promise<EvalRunResult> => {
		return runIntentEvalLogic();
	},
});

export type { EvalResult, EvalRunResult, IntentEvalCase };
