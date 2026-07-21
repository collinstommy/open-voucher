import dayjs from "dayjs";
import type { Id } from "./_generated/dataModel";
import { UPLOAD_REWARDS } from "../src/lib/constants";
import { applyCoinDelta } from "../src/lib/coinLedger";
import { callGeminiApi } from "../src/lib/gemini";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";


// --- evals.ts ---
// Test configuration: image filename -> test date -> expected result
const TEST_CONFIG: Record<
	string,
	Record<
		string,
		{
			validFrom: string | undefined;
			expiry: string;
		}
	>
> = {
	"23dec-5jan.jpg": {
		"2025-12-22": { validFrom: "2025-12-23", expiry: "2026-01-05" },
		"2026-01-01": { validFrom: "2025-12-23", expiry: "2026-01-05" },
		"2026-01-03": { validFrom: "2025-12-23", expiry: "2026-01-05" },
		"2026-01-06": { validFrom: "2025-12-23", expiry: "2026-01-05" },
	},
	"29dec-7jan.jpg": {
		"2025-12-22": { validFrom: "2025-12-29", expiry: "2026-01-07" },
		"2025-12-29": { validFrom: "2025-12-29", expiry: "2026-01-07" },
		"2026-01-08": { validFrom: "2025-12-29", expiry: "2026-01-07" },
		"2026-01-20": { validFrom: "2025-12-29", expiry: "2026-01-07" },
	},
	"30Dec-8jan.jpg": {
		"2025-12-28": { validFrom: "2025-12-30", expiry: "2026-01-08" },
		"2025-12-30": { validFrom: "2025-12-30", expiry: "2026-01-08" },
		"2026-01-09": { validFrom: "2025-12-30", expiry: "2026-01-08" },
		"2026-01-20": { validFrom: "2025-12-30", expiry: "2026-01-08" },
	},
	"dec21-jan5.jpg": {
		"2025-12-20": { validFrom: "2025-12-21", expiry: "2026-01-05" },
		"2025-12-22": { validFrom: "2025-12-21", expiry: "2026-01-05" },
		"2026-01-06": { validFrom: "2025-12-21", expiry: "2026-01-05" },
	},
	"26jan-1feb.jpg": {
		"2025-01-25": { validFrom: "2025-01-26", expiry: "2025-02-01" },
		"2025-01-26": { validFrom: "2025-01-26", expiry: "2025-02-01" },
		"2025-02-02": { validFrom: "2025-01-26", expiry: "2025-02-01" },
	},
	"jan26-feb01.jpg": {
		"2025-01-25": { validFrom: "2025-01-26", expiry: "2025-02-01" },
		"2025-01-26": { validFrom: "2025-01-26", expiry: "2025-02-01" },
		"2025-02-02": { validFrom: "2025-01-26", expiry: "2025-02-01" },
	},
	"feb2nd-feb11th.jpg": {
		"2026-02-01": { validFrom: "2026-02-02", expiry: "2026-02-11" },
		"2026-02-02": { validFrom: "2026-02-02", expiry: "2026-02-11" },
		"2026-02-12": { validFrom: "2026-02-02", expiry: "2026-02-11" },
		"2026-02-25": { validFrom: "2026-02-02", expiry: "2026-02-11" },
	},
	"feb11-feb17.jpg": {
		"2026-02-10": { validFrom: "2026-02-11", expiry: "2026-02-17" },
		"2026-02-11": { validFrom: "2026-02-11", expiry: "2026-02-17" },
		"2026-08-18": { validFrom: "2026-02-11", expiry: "2026-02-17" },
	},
	"mar15-mar21.png": {
		"2026-03-14": { validFrom: "2026-03-15", expiry: "2026-03-21" },
		"2026-03-15": { validFrom: "2026-03-15", expiry: "2026-03-21" },
		"2026-03-22": { validFrom: "2026-03-15", expiry: "2026-03-21" },
	},
	"mar23-mar-29-paper.png": {
		"2026-03-22": { validFrom: "2026-03-23", expiry: "2026-03-29" },
		"2026-03-23": { validFrom: "2026-03-23", expiry: "2026-03-29" },
		"2026-03-30": { validFrom: "2026-03-23", expiry: "2026-03-29" },
	},
	"threeplus-expire-mar-31.png": {
		"2026-03-30": { validFrom: undefined, expiry: "2026-03-31" },
		"2026-03-31": { validFrom: undefined, expiry: "2026-03-31" },
		"2026-04-01": { validFrom: undefined, expiry: "2026-03-31" },
	},
	"apr23-may9": {
		"2026-05-09": { validFrom: "2026-04-23", expiry: "2026-05-09" },
	},
};

/**
 * Format ISO date (YYYY-MM-DD) to readable label
 * Example: "2025-12-22" → "Dec 22 2025"
 */
function formatDateLabel(dateStr: string): string {
	return dayjs(dateStr).format("MMM D YYYY");
}

type EvalResult = {
	filename: string;
	testDate: string;
	success: boolean;
	expectedValidFrom: string | undefined;
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

type ImageInput = { filename: string; imageBase64?: string; imageUrl?: string };

async function getImageBase64(image: ImageInput): Promise<string> {
	if (image.imageBase64) return image.imageBase64;
	if (image.imageUrl) {
		const response = await fetch(image.imageUrl);
		if (!response.ok) {
			throw new Error(`Failed to fetch image: ${response.status}`);
		}
		const buffer = await response.arrayBuffer();
		return Buffer.from(buffer).toString("base64");
	}
	throw new Error("No image data provided");
}

export const runOcrEvalsInternal = internalAction({
	args: {
		images: v.optional(
			v.array(
				v.union(
					v.object({
						filename: v.string(),
						imageBase64: v.string(),
					}),
					v.object({
						filename: v.string(),
						imageUrl: v.string(),
					}),
				),
			),
		),
		useOpenRouter: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<EvalsResponse> => {
		const images = args.images || [];
		const useOpenRouter = args.useOpenRouter ?? false;

		// Note: Images must be provided via frontend (web UI sends base64 data)
		// CLI support removed - only web UI is supported
		if (images.length === 0) {
			throw new Error("Images must be provided from frontend");
		}
		const results: EvalResult[] = [];

		for (const imageData of images) {
			const imageConfig = TEST_CONFIG[imageData.filename];
			if (!imageConfig) {
				results.push({
					filename: imageData.filename,
					testDate: "unknown",
					success: false,
					expectedValidFrom: "",
					expectedExpiry: "",
					error: "Unknown image filename",
				});
				continue;
			}

			const imageBase64 = await getImageBase64(imageData);

			// Run each test case defined in the config
			for (const [dateStr, expected] of Object.entries(imageConfig)) {
				const testDateLabel = formatDateLabel(dateStr);

				try {
					const ocrResult = await ctx.runAction(
						internal.ocr.extractFromBase64,
						{
							imageBase64: imageBase64,
							currentDate: dateStr,
							useOpenRouter,
						},
					);

					const success =
						ocrResult.validFrom === expected.validFrom &&
						ocrResult.expiryDate === expected.expiry;

					results.push({
						filename: imageData.filename,
						testDate: testDateLabel,
						success,
						expectedValidFrom: expected.validFrom,
						expectedExpiry: expected.expiry,
						actualValidFrom: ocrResult.validFrom,
						actualExpiry: ocrResult.expiryDate,
					});
				} catch (error) {
					results.push({
						filename: imageData.filename,
						testDate: testDateLabel,
						success: false,
						expectedValidFrom: expected.validFrom,
						expectedExpiry: expected.expiry,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
		}

		const passedTests = results.filter((r) => r.success).length;
		const totalTests = results.length;

		return {
			overallSuccess: passedTests === totalTests,
			passed: passedTests,
			total: totalTests,
			results,
		};
	},
});

type SingleEvalResult = {
	filename: string;
	testDate: string;
	testDateRaw: string;
	success: boolean;
	expectedValidFrom: string | undefined;
	expectedExpiry: string;
	actualValidFrom?: string;
	actualExpiry?: string;
	error?: string;
};

type ImageEvalResults = {
	filename: string;
	results: SingleEvalResult[];
};

export const runImageOcrEval = internalAction({
	args: {
		filename: v.string(),
		imageBase64: v.string(),
		useOpenRouter: v.optional(v.boolean()),
	},
	handler: async (ctx, args): Promise<ImageEvalResults> => {
		const { filename, imageBase64, useOpenRouter } = args;

		const imageConfig = TEST_CONFIG[filename];
		if (!imageConfig) {
			throw new Error(`Unknown image filename: ${filename}`);
		}

		const testDates = Object.keys(imageConfig);

		const results = await Promise.all(
			testDates.map(async (testDate) => {
				const expected = imageConfig[testDate];

				try {
					const ocrResult = await ctx.runAction(
						internal.ocr.extractFromBase64,
						{
							imageBase64,
							currentDate: testDate,
							useOpenRouter,
						},
					);

					const success =
						ocrResult.validFrom === expected.validFrom &&
						ocrResult.expiryDate === expected.expiry;

					return {
						filename,
						testDate: formatDateLabel(testDate),
						testDateRaw: testDate,
						success,
						expectedValidFrom: expected.validFrom,
						expectedExpiry: expected.expiry,
						actualValidFrom: ocrResult.validFrom,
						actualExpiry: ocrResult.expiryDate,
					} as SingleEvalResult;
				} catch (error) {
					return {
						filename,
						testDate: formatDateLabel(testDate),
						testDateRaw: testDate,
						success: false,
						expectedValidFrom: expected.validFrom,
						expectedExpiry: expected.expiry,
						error: error instanceof Error ? error.message : String(error),
					} as SingleEvalResult;
				}
			}),
		);

		return { filename, results };
	},
});

// --- extract.ts ---
type ExtractedData = {
	type: number;
	validFromDay?: number;
	validFromMonth?: number;
	expiryDay?: number;
	expiryMonth?: number;
	expiryYear?: number;
	barcode?: string;
	isThreePlus?: boolean;
};

type ParsedDates = {
	validFrom: string | undefined;
	expiryDate: string | undefined;
};

/**
 * Clean up Gemini response to extract valid JSON
 * Handles: markdown wrapping, conversational text, trailing text
 */
function cleanJsonResponse(text: string): string {
	let cleaned = text.trim();

	// Remove markdown code blocks
	cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
	cleaned = cleaned.replace(/```\s*$/i, "");

	// Extract JSON object - find first { and last }
	const start = cleaned.indexOf("{");
	const end = cleaned.lastIndexOf("}");

	if (start === -1 || end === -1 || end <= start) {
		throw new Error("No valid JSON object found in response");
	}

	return cleaned.slice(start, end + 1).trim();
}

/**
 * Parse raw extracted dates into actual dates
 * Uses extracted year if available, otherwise computes from test date
 */
function parseVoucherDates(
	extracted: ExtractedData,
	currentDate: string,
): ParsedDates {
	const validFromDay = Number(extracted.validFromDay);
	const validFromMonth = Number(extracted.validFromMonth);
	const expiryDay = Number(extracted.expiryDay);
	const expiryMonth = Number(extracted.expiryMonth);
	const extractedExpiryYear = Number(extracted.expiryYear);

	const hasValidFromFields =
		Number.isFinite(validFromDay) &&
		validFromDay > 0 &&
		Number.isFinite(validFromMonth) &&
		validFromMonth > 0;

	const hasExpiryFields =
		Number.isFinite(expiryDay) &&
		expiryDay > 0 &&
		Number.isFinite(expiryMonth) &&
		expiryMonth > 0;

	if (!hasValidFromFields && !hasExpiryFields) {
		return { validFrom: undefined, expiryDate: undefined };
	}

	const testDate = dayjs(currentDate);
	const testYear = testDate.year();
	const testMonth = testDate.month() + 1; // dayjs months are 0-indexed

	// Compute the year for validFrom and expiry based on test date context
	let validFromYear = testYear;
	let expiryYear =
		Number.isFinite(extractedExpiryYear) && extractedExpiryYear > 0
			? extractedExpiryYear
			: testYear;

	if (hasValidFromFields && hasExpiryFields) {
		const computedYears = computeYears(
			validFromMonth,
			expiryMonth,
			testYear,
			testMonth,
			numberOrUndefined(extractedExpiryYear),
		);
		validFromYear = computedYears.validFromYear;
		expiryYear = computedYears.expiryYear;
	}

	// Build dates
	const validFrom = hasValidFromFields
		? dayjs()
				.year(validFromYear)
				.month(validFromMonth - 1)
				.date(validFromDay)
				.startOf("day")
				.format("YYYY-MM-DD")
		: undefined;

	const expiryDate = hasExpiryFields
		? dayjs()
				.year(expiryYear)
				.month(expiryMonth - 1)
				.date(expiryDay)
				.startOf("day")
				.format("YYYY-MM-DD")
		: undefined;

	return { validFrom, expiryDate };
}

function numberOrUndefined(value: number): number | undefined {
	return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Compute years for validFrom and expiry dates
 *
 * Logic:
 * - If extracted expiryYear is provided, use it
 * - For year-crossing vouchers (e.g., Dec-Jan), determine appropriate years:
 *   - If validFromMonth > testMonth: validFrom is in previous year (testYear - 1)
 *   - Otherwise: validFrom is in testYear
 *   - Expiry is always validFromYear or validFromYear + 1 for year-crossing
 */
function computeYears(
	validFromMonth: number,
	expiryMonth: number,
	testYear: number,
	testMonth: number,
	extractedExpiryYear?: number,
): { validFromYear: number; expiryYear: number } {
	// If extracted year provided, derive validFromYear from it
	if (extractedExpiryYear) {
		const crossesYearBoundary = expiryMonth < validFromMonth;
		const validFromYear = crossesYearBoundary
			? extractedExpiryYear - 1
			: extractedExpiryYear;
		return { validFromYear, expiryYear: extractedExpiryYear };
	}

	// Determine validFrom year based on test date context
	const crossesYearBoundary =
		!Number.isNaN(expiryMonth) &&
		!Number.isNaN(validFromMonth) &&
		expiryMonth < validFromMonth;

	if (crossesYearBoundary) {
		// For Dec-Jan vouchers: if test is Jan and validFrom is Dec, validFrom is in previous year
		const validFromYear = validFromMonth > testMonth ? testYear - 1 : testYear;
		return { validFromYear, expiryYear: validFromYear + 1 };
	}

	// Same year voucher
	return { validFromYear: testYear, expiryYear: testYear };
}

async function callApiForExtraction(
	imageBase64: string,
	prompt: string,
	useOpenRouter: boolean,
	geminiModel = "gemini-3.1-flash-lite",
): Promise<{ text: string; raw: string }> {
	if (useOpenRouter) {
		const openRouterApiKey = process.env.OPENROUTER_API_KEY;
		if (!openRouterApiKey) {
			throw new Error("OpenRouter API key not configured");
		}
		return callOpenRouterApi(imageBase64, prompt, openRouterApiKey);
	}

	const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
	if (!geminiApiKey) {
		throw new Error("Gemini API key not configured");
	}

	try {
		return await callGeminiApi(
			[
				{ text: prompt },
				{ inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
			],
			geminiApiKey,
			geminiModel,
			{ temperature: 0, maxOutputTokens: 8192 },
		);
	} catch (geminiError) {
		console.warn("Gemini extraction failed, trying OpenRouter:", geminiError);
		const openRouterApiKey = process.env.OPENROUTER_API_KEY;
		if (!openRouterApiKey) {
			throw new Error("OpenRouter API key not configured and Gemini failed");
		}
		return callOpenRouterApi(imageBase64, prompt, openRouterApiKey);
	}
}

async function extractVoucherData(
	imageBase64: string,
	currentDate: string,
	useOpenRouter = false,
): Promise<{
	type: number;
	validFrom: string | undefined;
	expiryDate: string | undefined;
	barcode: string | undefined;
	isThreePlus: boolean;
	rawResponse: string;
}> {
	const currentYear = new Date(currentDate).getFullYear();
	const prompt = buildPrompt(currentYear);

	for (let attempt = 0; attempt < 2; attempt++) {
		let result: { text: string; raw: string };
		try {
			if (attempt === 0) {
				result = await callApiForExtraction(imageBase64, prompt, useOpenRouter);
			} else {
				// Retry with Gemini 3.1 Flash (more capable model) for a second attempt
				result = await callApiForExtraction(
					imageBase64,
					prompt,
					false,
					"gemini-3.1-flash",
				);
			}
		} catch (apiError) {
			if (attempt < 1) {
				console.warn(
					`API call failed (attempt ${attempt + 1}), retrying:`,
					apiError,
				);
				continue;
			}
			throw apiError;
		}

		try {
			const cleanedText = cleanJsonResponse(result.text);
			const normalizedText = cleanedText.replace(/(:\s*)0+(\d)/g, "$1$2");
			const extracted: ExtractedData = JSON.parse(normalizedText);

			console.log("Extracted (raw):", extracted);

			const { validFrom, expiryDate } = parseVoucherDates(
				extracted,
				currentDate,
			);

			// Retry if we got no useful data (type=0 or no expiry date)
			if (extracted.type === 0 || !expiryDate) {
				if (attempt < 1) {
					console.warn(
						`Attempt ${attempt + 1} returned no valid data (type=${extracted.type}, expiryDate=${expiryDate}), retrying with Gemini 2.5 Flash...`,
					);
					continue;
				}
			}

			console.log("Extracted (final):", {
				type: extracted.type,
				validFrom,
				expiryDate,
				barcode: extracted.barcode,
			});

			return {
				type: extracted.type,
				validFrom,
				expiryDate,
				barcode: extracted.barcode,
				isThreePlus: extracted.isThreePlus ?? false,
				rawResponse: result.raw,
			};
		} catch (parseError) {
			console.error(`JSON parse failed (attempt ${attempt + 1}):`, parseError);
			console.error("Raw AI text:", result.text);
			if (attempt < 1) {
				console.warn("Retrying with Gemini 2.5 Flash...");
				continue;
			}
			// All attempts exhausted — return type 0 so raw response
			// gets saved to failedUploads via storeVoucherFromOcr
			return {
				type: 0,
				validFrom: undefined,
				expiryDate: undefined,
				barcode: undefined,
				isThreePlus: false,
				rawResponse: result.raw,
			};
		}
	}

	// Unreachable (the loop always returns or throws)
	return {
		type: 0,
		validFrom: undefined,
		expiryDate: undefined,
		barcode: undefined,
		isThreePlus: false,
		rawResponse: "",
	};
}

function buildPrompt(currentYear: number): string {
	return `You are analyzing an image of a voucher.
We are ONLY looking for specific Dunnes Stores vouchers (Ireland) of these exact types:
- €5 off €20
- €5 off €25
- €10 off €40
- €10 off €50
- €20 off €80
- €20 off €100

Any other voucher type (e.g. "€1 off", "€3 off", product specific, or from other stores) is INVALID.

Three+ vouchers are special: they are issued by Three mobile and say "with Three+" or "Three+" on them. They typically only have an expiry date ("valid until X") and NO start date. These ARE valid €5 off €25 vouchers and should return type "5".

The date on the voucher is relative to the voucher issue date of ${currentYear}.

The date format on the voucher can vary:
- "Valid 30 Dec - 5 Jan" (day month)
- "11/02/26 to 17/02/26" means day 11, month 02 (February), year 26 (DD/MM/YY format)
- "Valid from 11/02/26 to 17/02/26" means validFrom is day 11, month 2, and expiry is day 17, month 2
- "Valid until 31st March 2026" means ONLY an expiry date, no start date

Extract ONLY the day and month numbers from the voucher validity range:
1. **Type**: The discount amount (5, 10, or 20). For example, if the voucher says "SAVE €5" and "When you spend €25 or more", return "5". If it is NOT one of these specific amounts, return "0".
2. **validFromDay**: Day of month for the START of validity range (e.g., "Valid 30 Dec - 5 Jan" → 30, "11/02/26" → 11). If there is no start date (e.g., "valid until X"), return null.
3. **validFromMonth**: Month number for the START of validity range (e.g., "Valid 30 Dec - 5 Jan" → 12, "11/02/26" → 2 for February). If there is no start date, return null.
4. **expiryDay**: Day of month for the END of validity range (e.g., "Valid 30 Dec - 5 Jan" → 5, "17/02/26" → 17, "valid until 31st March" → 31)
5. **expiryMonth**: Month number for the END of validity range (e.g., "Valid 30 Dec - 5 Jan" → 1, "17/02/26" → 2 for February, "valid until 31st March" → 3)
6. **expiryYear**: If the image shows a full date with year (e.g., "11/02/26"), extract the full year as 2026. Otherwise leave as null.
7. **barcode**: The number below the barcode.
8. **isThreePlus**: true if this is a Three+ voucher (says "Three+" or "with Three+"), false otherwise.

Return ONLY JSON:
{"type": "10", "validFromDay": 11, "validFromMonth": 2, "expiryDay": 17, "expiryMonth": 2, "expiryYear": 2026, "barcode": "1234567890", "isThreePlus": false}

If barcode is missing: null.
If type is unknown or invalid: "0".
If any date field is unknown: null.
If the voucher only has "valid until" with no start date: set validFromDay and validFromMonth to null.`;
}

async function callOpenRouterApi(
	imageBase64: string,
	prompt: string,
	apiKey: string,
): Promise<{ text: string; raw: string }> {
	const response = await fetch(
		"https://openrouter.ai/api/v1/chat/completions",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
				"HTTP-Referer": "https://open-voucher.com",
				"X-Title": "Open Voucher",
			},
			body: JSON.stringify({
				model: "openai/gpt-5-mini",
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: prompt },
							{
								type: "image_url",
								image_url: {
									url: `data:image/jpeg;base64,${imageBase64}`,
								},
							},
						],
					},
				],
				temperature: 0.0,
				max_tokens: 10000,
			}),
		},
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenRouter API error: ${error}`);
	}

	const result = (await response.json()) as {
		choices?: Array<{ message?: { content?: string } }>;
	};
	const rawResponse = JSON.stringify(result);
	console.log("OpenRouter response:", rawResponse);

	const textContent = result.choices?.[0]?.message?.content;
	if (!textContent) {
		throw new Error("No text in OpenRouter response");
	}

	return { text: textContent, raw: rawResponse };
}

export const extractFromImage = internalAction({
	args: { imageStorageId: v.id("_storage") },
	handler: async (ctx, { imageStorageId }) => {
		const imageUrl = await ctx.storage.getUrl(imageStorageId);
		if (!imageUrl) {
			throw new Error("Could not get image URL");
		}

		const imageBase64 = await fetchImageAsBase64(imageUrl);
		const currentDate = new Date().toISOString().split("T")[0];
		return extractVoucherData(imageBase64, currentDate);
	},
});

export const extractFromUrl = internalAction({
	args: {
		imageUrl: v.string(),
		currentDate: v.optional(v.string()),
		useOpenRouter: v.optional(v.boolean()),
	},
	handler: async (_ctx, { imageUrl, currentDate, useOpenRouter }) => {
		const imageBase64 = await fetchImageAsBase64(imageUrl);
		const dateToUse = currentDate ?? new Date().toISOString().split("T")[0];
		return extractVoucherData(imageBase64, dateToUse, useOpenRouter ?? false);
	},
});

export const extractFromBase64 = internalAction({
	args: {
		imageBase64: v.string(),
		currentDate: v.string(),
		useOpenRouter: v.optional(v.boolean()),
	},
	handler: async (_ctx, { imageBase64, currentDate, useOpenRouter }) => {
		return extractVoucherData(imageBase64, currentDate, useOpenRouter);
	},
});

async function fetchImageAsBase64(url: string): Promise<string> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch image: ${response.status}`);
	}

	const arrayBuffer = await response.arrayBuffer();
	const uint8Array = new Uint8Array(arrayBuffer);

	let binary = "";
	for (let i = 0; i < uint8Array.length; i++) {
		binary += String.fromCharCode(uint8Array[i]);
	}
	return btoa(binary);
}

// --- process.ts ---
export const processVoucherImage = internalAction({
	args: {
		userId: v.id("users"),
		imageStorageId: v.id("_storage"),
	},
	handler: async (ctx, args) => {
		const { userId, imageStorageId } = args;

		try {
			const extracted = await ctx.runAction(
				internal.ocr.extractFromImage,
				{
					imageStorageId,
				},
			);

			const result = await ctx.runMutation(
				internal.ocr.storeVoucherFromOcr,
				{
					userId,
					imageStorageId,
					type: String(extracted.type),
					validFrom: extracted.validFrom || undefined,
					expiryDate: extracted.expiryDate || undefined,
					barcode: extracted.barcode || undefined,
					isThreePlus: extracted.isThreePlus,
					rawResponse: extracted.rawResponse,
				},
			);

			if (result.success) {
				console.log(`Voucher created: ${result.voucherId}`);
			} else {
				console.log(`Voucher rejected: ${result.reason}`);
				// Error message is sent by storeVoucherFromOcr
			}
		} catch (error: any) {
			console.error("OCR system error:", { userId, imageStorageId, error });

			const errorMessage = error?.message || String(error);

			await ctx.runMutation(internal.ocr.recordSystemError, {
				userId,
				imageStorageId,
				errorMessage: errorMessage.substring(0, 1000),
			});

			const user = await ctx.runQuery(internal.users.getUserById, { userId });
			if (user) {
				await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
					chatId: user.telegramChatId,
					text: `❌ <b>Voucher Processing Failed</b>\n\nWe encountered an error while processing your voucher. Please try again.`,
				});
			}
		}
	},
});

// --- store.ts ---
type VoucherOcrFailureReason =
	| "EXPIRED"
	| "TOO_LATE_TODAY"
	| "COULD_NOT_READ_AMOUNT"
	| "COULD_NOT_READ_BARCODE"
	| "COULD_NOT_READ_EXPIRY_DATE"
	| "INVALID_TYPE"
	| "DUPLICATE_BARCODE"
	| "UNKNOWN_ERROR";

async function recordFailedUpload(
	ctx: MutationCtx,
	userId: Id<"users">,
	imageStorageId: Id<"_storage">,
	reason: VoucherOcrFailureReason,
	ocrData: {
		rawResponse: string;
		type?: string;
		barcode?: string;
		expiryDate?: string;
		validFrom?: string;
	},
) {
	await ctx.db.insert("failedUploads", {
		userId,
		imageStorageId,
		failureType: "validation",
		failureReason: reason,
		rawOcrResponse: ocrData.rawResponse,
		extractedType: ocrData.type,
		extractedBarcode: ocrData.barcode,
		extractedExpiryDate: ocrData.expiryDate,
		extractedValidFrom: ocrData.validFrom,
	});
}

export const storeVoucherFromOcr = internalMutation({
	args: {
		userId: v.id("users"),
		imageStorageId: v.id("_storage"),
		type: v.string(),
		validFrom: v.optional(v.string()),
		expiryDate: v.optional(v.string()),
		barcode: v.optional(v.string()),
		isThreePlus: v.optional(v.boolean()),
		rawResponse: v.string(),
	},
	handler: async (ctx, args) => {
		const {
			userId,
			imageStorageId,
			type,
			validFrom,
			expiryDate,
			barcode,
			rawResponse,
		} = args;

		const user = await ctx.db.get(userId);
		if (!user) {
			throw new Error("User not found");
		}

		const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
		const now = dayjs();

		// Parse and validate type
		const isValidType = type === "5" || type === "10" || type === "20";

		// Parse and validate expiry date
		const dayjsExpiry = dayjs(expiryDate!);
		const isExpiryDateValid =
			expiryDate && dayjsExpiry.isValid() && dayjsExpiry.valueOf() > oneYearAgo;
		const isAlreadyExpired = dayjsExpiry.isBefore(now, "day");
		// Check if it's after 9 PM Irish time
		const irishHour = Number(
			new Intl.DateTimeFormat("en-IE", {
				timeZone: "Europe/Dublin",
				hour: "numeric",
				hour12: false,
			}).format(new Date()),
		);
		const isTooLateToday = dayjsExpiry.isSame(now, "day") && irishHour >= 21;
		// Store at 22:59 UTC so it displays as the correct day in both UTC+0 and UTC+1
		const expiryDateMs = Date.UTC(
			dayjsExpiry.year(),
			dayjsExpiry.month(),
			dayjsExpiry.date(),
			22,
			59,
			0,
			0,
		);

		// Parse validFrom for later validation
		const dayjsValidFrom = dayjs(validFrom);
		const isValidFromValid =
			validFrom &&
			dayjsValidFrom.isValid() &&
			dayjsValidFrom.valueOf() > oneYearAgo;

		// 1. Check type validity first
		if (!isValidType) {
			await recordFailedUpload(ctx, userId, imageStorageId, "INVALID_TYPE", {
				rawResponse,
				type,
				barcode,
				expiryDate,
				validFrom,
			});
			await sendErrorMessage(ctx, user.telegramChatId, "INVALID_TYPE");
			return { success: false, reason: "INVALID_TYPE" };
		}

		// 2. Check expiry date validity
		if (!isExpiryDateValid) {
			await recordFailedUpload(
				ctx,
				userId,
				imageStorageId,
				"COULD_NOT_READ_EXPIRY_DATE",
				{
					rawResponse,
					type,
					barcode,
					expiryDate,
					validFrom,
				},
			);
			await sendErrorMessage(
				ctx,
				user.telegramChatId,
				"COULD_NOT_READ_EXPIRY_DATE",
			);
			return { success: false, reason: "COULD_NOT_READ_EXPIRY_DATE" };
		}

		if (isAlreadyExpired) {
			await recordFailedUpload(ctx, userId, imageStorageId, "EXPIRED", {
				rawResponse,
				type,
				barcode,
				expiryDate,
				validFrom,
			});
			await sendErrorMessage(ctx, user.telegramChatId, "EXPIRED", expiryDateMs);
			return { success: false, reason: "EXPIRED", expiryDate: expiryDateMs };
		}

		if (isTooLateToday) {
			await recordFailedUpload(ctx, userId, imageStorageId, "TOO_LATE_TODAY", {
				rawResponse,
				type,
				barcode,
				expiryDate,
				validFrom,
			});
			await sendErrorMessage(
				ctx,
				user.telegramChatId,
				"TOO_LATE_TODAY",
				expiryDateMs,
			);
			return {
				success: false,
				reason: "TOO_LATE_TODAY",
				expiryDate: expiryDateMs,
			};
		}

		if (!barcode) {
			await recordFailedUpload(
				ctx,
				userId,
				imageStorageId,
				"COULD_NOT_READ_BARCODE",
				{
					rawResponse,
					type,
					barcode,
					expiryDate,
					validFrom,
				},
			);
			await sendErrorMessage(
				ctx,
				user.telegramChatId,
				"COULD_NOT_READ_BARCODE",
			);
			return { success: false, reason: "COULD_NOT_READ_BARCODE" };
		}

		const existing = await ctx.db
			.query("vouchers")
			.withIndex("by_barcode", (q) => q.eq("barcodeNumber", barcode))
			.first();

		if (existing) {
			await recordFailedUpload(
				ctx,
				userId,
				imageStorageId,
				"DUPLICATE_BARCODE",
				{
					rawResponse,
					type,
					barcode,
					expiryDate,
					validFrom,
				},
			);
			await sendErrorMessage(ctx, user.telegramChatId, "DUPLICATE_BARCODE");
			return { success: false, reason: "DUPLICATE_BARCODE" };
		}

		const nowMs = Date.now();
		const voucherId = await ctx.db.insert("vouchers", {
			type,
			status: "available",
			imageStorageId,
			uploaderId: userId,
			expiryDate: expiryDateMs,
			validFrom:
				validFrom && isValidFromValid
					? Date.UTC(
							dayjsValidFrom.year(),
							dayjsValidFrom.month(),
							dayjsValidFrom.date(),
							0,
							0,
							0,
							0,
						)
					: undefined,
			barcodeNumber: barcode,
			ocrRawResponse: rawResponse,
			createdAt: nowMs,
		});

		const reward = UPLOAD_REWARDS[type];
		const { newBalance } = await applyCoinDelta(ctx, {
			userId,
			delta: reward,
			type: "upload_reward",
			voucherId,
		});

		await ctx.db.patch(userId, {
			uploadCount: (user.uploadCount || 0) + 1,
		});

		await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
			chatId: user.telegramChatId,
			text: `✅ <b>Voucher Accepted!</b>\n\nThanks for sharing a €${type} voucher.\nCoins earned: +${reward}\nNew balance: ${newBalance}`,
		});

		console.log(
			`Voucher created: ${voucherId} (type=${type}, barcode=${barcode})`,
		);

		return { success: true, voucherId };
	},
});

async function sendErrorMessage(
	ctx: any,
	chatId: string | number,
	reason: VoucherOcrFailureReason,
	expiryDate?: number,
) {
	let message = "❌ <b>Voucher Processing Failed</b>\n\n";

	switch (reason) {
		case "COULD_NOT_READ_AMOUNT":
			message += `We couldn't determine the voucher amount (e.g., €5, €10, €20). Please make sure the value is clear in the photo.`;
			break;
		case "COULD_NOT_READ_EXPIRY_DATE":
			message += `We couldn't determine the expiry date. Please make sure it's clear in the photo.`;
			break;
		case "COULD_NOT_READ_BARCODE":
			message += `We couldn't read the barcode. Please ensure it's fully visible and clear.`;
			break;
		case "EXPIRED": {
			const dateStr = expiryDate
				? dayjs(expiryDate).format("DD-MM-YYYY")
				: "unknown";
			message += `This voucher expired on ${dateStr}.`;
			break;
		}
		case "TOO_LATE_TODAY": {
			const todayDateStr = expiryDate
				? dayjs(expiryDate).format("DD-MM-YYYY")
				: "today";
			message += `This voucher expires ${todayDateStr}, but it's after 9 PM. Vouchers expiring today can only be uploaded before 9 PM.`;
			break;
		}
		case "INVALID_TYPE":
			message +=
				"This voucher does not appear to be a valid €5, €10, or €20 Dunnes voucher. We only accept these specific general spend vouchers.";
			break;
		case "DUPLICATE_BARCODE":
			message +=
				"This voucher has already been uploaded by someone. Each voucher can only be uploaded once.";
			break;
		default:
			message +=
				"We encountered an unknown error while processing your voucher. Please try again or contact support.";
	}

	await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
		chatId,
		text: message,
	});
}

export const recordSystemError = internalMutation({
	args: {
		userId: v.id("users"),
		imageStorageId: v.id("_storage"),
		errorMessage: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.db.insert("failedUploads", {
			userId: args.userId,
			imageStorageId: args.imageStorageId,
			failureType: "system",
			failureReason: "SYSTEM_ERROR",
			errorMessage: args.errorMessage,
		});
	},
});
