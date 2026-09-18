import { v } from "convex/values";
import {
	classifyMessageText,
	type InboundClassification,
} from "../src/lib/intentClassifier";
import { INTENT_EVAL_SET, type IntentEvalCase } from "../src/lib/intentEvalSet";
import { adminAction } from "./adminGuards";
import { internal } from "./_generated/api";

const CONCURRENCY = 10;

type EvalResult = {
	text: string;
	expected: InboundClassification;
	predicted: InboundClassification;
	confidence: number;
	escalated: boolean;
	escalateExpected: boolean | null;
	correct: boolean;
	escalateCorrect: boolean;
};

type EvalRunResult = {
	total: number;
	correct: number;
	accuracy: number;
	escalateCorrect: number;
	escalateTotal: number;
	escalateAccuracy: number;
	byExpected: Record<string, { total: number; correct: number }>;
	results: EvalResult[];
};

type ProbeMessage = {
	text: string;
	previousIntent: string | null;
	previousConfidence: number | null;
	createdAt: number;
};

type ProbeResult = {
	text: string;
	previousIntent: string | null;
	predicted: InboundClassification;
	confidence: number;
	escalated: boolean;
	changed: boolean;
	createdAt: number;
};

type ProbeRunResult = {
	requested: number;
	processed: number;
	results: ProbeResult[];
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
		const { intent, confidence, escalate } = await classifyMessageText(
			item.text,
			apiKey,
		);
		const escalateExpected =
			typeof item.escalate === "boolean" ? item.escalate : null;
		return {
			text: item.text,
			expected: item.expected,
			predicted: intent,
			confidence,
			escalated: escalate,
			escalateExpected,
			correct: intent === item.expected,
			escalateCorrect:
				escalateExpected === null || escalate === escalateExpected,
		};
	});

	const correct = results.filter((r) => r.correct).length;
	const escalateResults = results.filter((r) => r.escalateExpected !== null);
	const escalateCorrect = escalateResults.filter((r) => r.escalateCorrect).length;
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
		escalateCorrect,
		escalateTotal: escalateResults.length,
		escalateAccuracy:
			escalateResults.length > 0
				? escalateCorrect / escalateResults.length
				: 0,
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

/**
 * Classifier probe: pull recent real inbound messages from prod and re-run
 * them through the CURRENT classifier. Lets the operator see how the new
 * labels / prompt perform against real traffic before the backfill lands.
 * `limit` caps how many messages are processed (hard-capped at 500).
 */
export const runIntentProbe = adminAction({
	args: {
		token: v.string(),
		limit: v.number(),
	},
	handler: async (ctx, { token: _token, limit }): Promise<ProbeRunResult> => {
		const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
		if (!apiKey) {
			throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
		}

		const capped = Math.max(0, Math.min(Math.floor(limit) || 0, 500));
		if (capped === 0) return { requested: limit, processed: 0, results: [] };

		const { messages } = await ctx.runQuery(
			internal.messages.getRecentInboundMessages,
			{ limit: capped },
		);

		const processed = await runPool(
			messages as ProbeMessage[],
			CONCURRENCY,
			async (m) => {
				const { intent, confidence, escalate } = await classifyMessageText(
					m.text,
					apiKey,
				);
				return {
					text: m.text,
					previousIntent: m.previousIntent,
					predicted: intent,
					confidence,
					escalated: escalate,
					changed: intent !== m.previousIntent,
					createdAt: m.createdAt,
				};
			},
		);

		return { requested: limit, processed: processed.length, results: processed };
	},
});

export type { EvalResult, EvalRunResult, IntentEvalCase, ProbeResult, ProbeRunResult };