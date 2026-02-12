import { v } from "convex/values";
import dayjs from "dayjs";
import { internalAction } from "../_generated/server";

type ExtractedData = {
	type: number;
	validFromDay?: number;
	validFromMonth?: number;
	expiryDay?: number;
	expiryMonth?: number;
	expiryYear?: number;
	barcode?: string;
};

type ParsedDates = {
	validFrom: string | undefined;
	expiryDate: string | undefined;
};

/**
 * Parse raw extracted dates into actual dates
 * Uses extracted year if available, otherwise computes from test date
 */
function parseVoucherDates(
	extracted: ExtractedData,
	currentDate: string,
): ParsedDates {
	if (!extracted.validFromDay || !extracted.validFromMonth) {
		return { validFrom: undefined, expiryDate: undefined };
	}

	const testDate = dayjs(currentDate);
	const testYear = testDate.year();
	const testMonth = testDate.month() + 1; // dayjs months are 0-indexed

	const validFromMonth = Number(extracted.validFromMonth);
	const expiryMonth = Number(extracted.expiryMonth);

	// Compute the year for validFrom and expiry based on test date context
	const { validFromYear, expiryYear } = computeYears(
		validFromMonth,
		expiryMonth,
		testYear,
		testMonth,
		extracted.expiryYear,
	);

	// Build dates
	const validFrom = dayjs()
		.year(validFromYear)
		.month(validFromMonth - 1)
		.date(extracted.validFromDay)
		.startOf("day")
		.format("YYYY-MM-DD");

	const expiryDate = dayjs()
		.year(expiryYear)
		.month((extracted.expiryMonth ?? 1) - 1)
		.date(extracted.expiryDay ?? 1)
		.startOf("day")
		.format("YYYY-MM-DD");

	return { validFrom, expiryDate };
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

async function extractVoucherData(
	imageBase64: string,
	currentDate: string,
): Promise<{
	type: number;
	validFrom: string | undefined;
	expiryDate: string | undefined;
	barcode: string | undefined;
	rawResponse: string;
}> {
	const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
	if (!geminiApiKey) {
		throw new Error("Gemini API key not configured");
	}

	const currentYear = new Date(currentDate).getFullYear();

	const prompt = buildPrompt(currentYear);
	const result = await callGeminiApi(imageBase64, prompt, geminiApiKey);
	const extracted: ExtractedData = JSON.parse(result.text);

	console.log("Extracted (raw):", extracted);

	const { validFrom, expiryDate } = parseVoucherDates(extracted, currentDate);

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
		rawResponse: result.raw,
	};
}

function buildPrompt(currentYear: number): string {
	return `You are analyzing an image of a voucher.
We are ONLY looking for specific Dunnes Stores vouchers (Ireland) of these exact types:
- €5 off €25
- €10 off €40
- €10 off €50
- €20 off €80
- €20 off €100

Any other voucher type (e.g. "€1 off", "€3 off", product specific, or from other stores) is INVALID.

The date on the voucher is relative to the voucher issue date of ${currentYear}.

The date format on the voucher can vary:
- "Valid 30 Dec - 5 Jan" (day month)
- "11/02/26 to 17/02/26" means day 11, month 02 (February), year 26 (DD/MM/YY format)
- "Valid from 11/02/26 to 17/02/26" means validFrom is day 11, month 2, and expiry is day 17, month 2

Extract ONLY the day and month numbers from the voucher validity range:
1. **Type**: The discount amount (5, 10, or 20). If it is NOT one of these specific amounts, return "0".
2. **validFromDay**: Day of month for the START of validity range (e.g., "Valid 30 Dec - 5 Jan" → 30, "11/02/26" → 11)
3. **validFromMonth**: Month number for the START of validity range (e.g., "Valid 30 Dec - 5 Jan" → 12, "11/02/26" → 2 for February)
4. **expiryDay**: Day of month for the END of validity range (e.g., "Valid 30 Dec - 5 Jan" → 5, "17/02/26" → 17)
5. **expiryMonth**: Month number for the END of validity range (e.g., "Valid 30 Dec - 5 Jan" → 1, "17/02/26" → 2 for February)
6. **expiryYear**: If the image shows a full date with year (e.g., "11/02/26"), extract the year (26). Otherwise leave as null.
7. **Barcode**: The number below the barcode.

Return ONLY JSON:
{"type": "10", "validFromDay": 11, "validFromMonth": 2, "expiryDay": 17, "expiryMonth": 2, "expiryYear": 2026, "barcode": "1234567890"}

If barcode is missing: null.
If type is unknown or invalid: "0".
If any date field is unknown: null.`;
}

async function callGeminiApi(
	imageBase64: string,
	prompt: string,
	apiKey: string,
): Promise<{ text: string; raw: string }> {
	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				contents: [
					{
						parts: [
							{ text: prompt },
							{
								inlineData: {
									mimeType: "image/jpeg",
									data: imageBase64,
								},
							},
						],
					},
				],
				generationConfig: {
					temperature: 0.0,
					maxOutputTokens: 256,
					responseMimeType: "application/json",
				},
			}),
		},
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Gemini API error: ${error}`);
	}

	const result = await response.json();
	const rawResponse = JSON.stringify(result);

	const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text;
	if (!textContent) {
		throw new Error("No text in Gemini response");
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
	},
	handler: async (_ctx, { imageUrl, currentDate }) => {
		const imageBase64 = await fetchImageAsBase64(imageUrl);
		const dateToUse = currentDate ?? new Date().toISOString().split("T")[0];
		return extractVoucherData(imageBase64, dateToUse);
	},
});

export const extractFromBase64 = internalAction({
	args: {
		imageBase64: v.string(),
		currentDate: v.string(),
	},
	handler: async (_ctx, { imageBase64, currentDate }) => {
		return extractVoucherData(imageBase64, currentDate);
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
