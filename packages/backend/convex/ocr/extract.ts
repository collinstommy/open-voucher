import { v } from "convex/values";
import dayjs from "dayjs";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

type ExtractedData = {
	type: number;
	validFromDay?: number;
	validFromMonth?: number;
	expiryDate?: string;
	barcode?: string;
};

async function extractVoucherData(
	imageBase64: string,
	currentYear: number,
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

	const prompt = `You are analyzing an image of a voucher.
We are ONLY looking for specific Dunnes Stores vouchers (Ireland) of these exact types:
- €5 off €25
- €10 off €40
- €10 off €50
- €20 off €80
- €20 off €100

Any other voucher type (e.g. "€1 off", "€3 off", product specific, or from other stores) is INVALID.

The current year is ${currentYear}.
The date format on the voucher can vary, examples:
- Valid 23 Nov - 29 Nov
- Coupon valid from 23/11/25 to 29/11/25
- Expires 04-01-2025, Valid 18 Dec - 4 Jan
- Expires Monday, Valid 30 Dec - 5 Jan

IMPORTANT: Extract dates from the validity range (e.g., "Valid 30 Dec - 5 Jan"). If there's a conflict between a relative date like "Expires Monday" and an explicit date range, USE THE DATE RANGE.

Extract:
1. **Type**: The discount amount (5, 10, or 20). If it is NOT one of these specific amounts, return "0".
2. **validFromDay**: The day of the month for the start date (e.g., in "Valid 30 Dec - 5 Jan", extract 30).
3. **validFromMonth**: The month number for the start date (e.g., in "Valid 30 Dec - 5 Jan", extract 12 for December).
4. **expiryDate**: Extract from the END of the validity range. If there's a full date with year (e.g., "Expires 04-01-2025"), use that. Otherwise, use the end date from the range (e.g., "Valid 30 Dec - 5 Jan" → use 5 Jan) and convert to YYYY-MM-DD using current year ${currentYear}.
5. **Barcode**: The number below the barcode.

Return ONLY JSON:
{"type": "10", "validFromDay": 1, "validFromMonth": 1, "expiryDate": "2025-01-04", "barcode": "1234567890"}

If barcode is missing: null.
If type is unknown or invalid: "0".
If validFromDay or validFromMonth is unknown: null.
If expiry is unknown: null.`;

	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiApiKey}`,
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

	const extracted: ExtractedData = JSON.parse(textContent);
	console.log("Extracted (raw):", extracted);

	let validFrom: string | undefined;
	const expiryDate = extracted.expiryDate;

	if (extracted.validFromDay && extracted.validFromMonth && expiryDate) {
		const expiryDateParsed = dayjs(expiryDate);
		const expiryYear = expiryDateParsed.year();

		let validFromDate = dayjs()
			.year(expiryYear)
			.month(extracted.validFromMonth - 1) // dayjs months are 0-indexed
			.date(extracted.validFromDay)
			.startOf("day");

		// If validFrom is chronologically after expiryDate, use previous year
		if (validFromDate.isAfter(expiryDateParsed)) {
			validFromDate = validFromDate.subtract(1, "year");
			console.log(
				`Adjusted validFrom year to ${validFromDate.year()} (crosses year boundary)`,
			);
		}

		validFrom = validFromDate.format("YYYY-MM-DD");
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
		rawResponse,
	};
}

/**
 * Extract voucher data from an image using Gemini OCR.
 * Pure extraction - no side effects except logging.
 */
export const extractFromImage = internalAction({
	args: { imageStorageId: v.id("_storage") },
	handler: async (ctx, { imageStorageId }) => {
		const imageUrl = await ctx.storage.getUrl(imageStorageId);
		if (!imageUrl) {
			throw new Error("Could not get image URL");
		}

		const imageBase64 = await fetchImageAsBase64(imageUrl);
		const currentYear = new Date().getFullYear();
		return extractVoucherData(imageBase64, currentYear);
	},
});

/**
 * Extract voucher data from an external URL.
 * Accepts currentYear override for testing year boundary scenarios.
 */
export const extractFromUrl = internalAction({
	args: {
		imageUrl: v.string(),
		currentYear: v.optional(v.number()),
	},
	handler: async (_ctx, { imageUrl, currentYear }) => {
		const imageBase64 = await fetchImageAsBase64(imageUrl);
		const yearToUse = currentYear ?? new Date().getFullYear();
		return extractVoucherData(imageBase64, yearToUse);
	},
});

/**
 * Extract voucher data from base64 image data.
 * Used for OCR evaluations where frontend sends image data directly.
 */
export const extractFromBase64 = internalAction({
	args: {
		imageBase64: v.string(),
		currentYear: v.number(),
	},
	handler: async (_ctx, { imageBase64, currentYear }) => {
		return extractVoucherData(imageBase64, currentYear);
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
