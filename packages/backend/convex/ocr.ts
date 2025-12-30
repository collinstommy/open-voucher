import { v } from "convex/values";
import { internalAction } from "./_generated/server";

export const OCR_ERROR = {
	NETWORK_ERROR: "NETWORK_ERROR",
	API_ERROR: "API_ERROR",
	COULD_NOT_READ_AMOUNT: "COULD_NOT_READ_AMOUNT",
	COULD_NOT_READ_BARCODE: "COULD_NOT_READ_BARCODE",
	COULD_NOT_READ_EXPIRY_DATE: "COULD_NOT_READ_EXPIRY_DATE",
	COULD_NOT_READ_VALID_FROM: "COULD_NOT_READ_VALID_FROM",
	INVALID_TYPE: "INVALID_TYPE",
	PARSE_ERROR: "PARSE_ERROR",
	EXPIRED: "EXPIRED",
	DUPLICATE_BARCODE: "DUPLICATE_BARCODE",
} as const;

export type OcrError = (typeof OCR_ERROR)[keyof typeof OCR_ERROR];

interface VoucherData {
	type: "5" | "10" | "20" | "0";
	validFrom: string | null;
	expiryDate: string | null;
	barcode: string | null;
}

interface OcrResult {
	success: true;
	data: VoucherData;
	rawResponse: string;
}

interface OcrErrorResult {
	success: false;
	error: OcrError;
	rawResponse: string;
}

type ExtractResult = OcrResult | OcrErrorResult;

export const extractVoucherData = internalAction({
	args: {
		imageStorageId: v.id("_storage"),
	},
	handler: async (ctx, { imageStorageId }) => {
		try {
			const imageUrl = await ctx.storage.getUrl(imageStorageId);
			if (!imageUrl) {
				return {
					success: false as const,
					error: OCR_ERROR.NETWORK_ERROR,
					rawResponse: "Could not get image URL",
				};
			}

			const imageBase64 = await fetchImageAsBase64(imageUrl);

			const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
			if (!geminiApiKey) {
				return {
					success: false as const,
					error: OCR_ERROR.API_ERROR,
					rawResponse: "Gemini API key not configured",
				};
			}

			const currentYear = new Date().getFullYear();
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

Where year is not specified, assume it is the current year.

Extract:
1. **Type**: The discount amount (5, 10, or 20). If it is NOT one of these specific amounts, return "0".
2. **ValidFrom**: The start date of validity period in YYYY-MM-DD format (e.g., in "Valid 23 Nov - 29 Nov", extract 23 Nov).
3. **Expiry**: The end date of validity period in YYYY-MM-DD format (e.g., in "Valid 23 Nov - 29 Nov", extract 29 Nov).
4. **Barcode**: The number below the barcode.

Return ONLY JSON:
{"type": "5", "validFrom": "2026-12-23", "expiryDate": "2026-12-31", "barcode": "1234567890"}

If barcode is missing: null.
If type is unknown or invalid: "0".
If validFrom is unknown: null.
If expiry is unknown: null.`;

			const response = await fetch(
				`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite-preview-02-05:generateContent?key=${geminiApiKey}`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
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
				const errorText = await response.text();
				return {
					success: false as const,
					error: OCR_ERROR.API_ERROR,
					rawResponse: `Gemini API error: ${errorText}`,
				};
			}

			const result = await response.json();
			const rawResponse = JSON.stringify(result);

			const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text;
			if (!textContent) {
				return {
					success: false as const,
					error: OCR_ERROR.COULD_NOT_READ_AMOUNT,
					rawResponse,
				};
			}

			let extracted: VoucherData;
			try {
				extracted = JSON.parse(textContent);
			} catch {
				return {
					success: false as const,
					error: OCR_ERROR.PARSE_ERROR,
					rawResponse,
				};
			}

			console.log("Extracted:", extracted);

			return {
				success: true as const,
				data: extracted,
				rawResponse,
			};
		} catch (error) {
			console.error("OCR error:", error);
			return {
				success: false as const,
				error: OCR_ERROR.NETWORK_ERROR,
				rawResponse: error instanceof Error ? error.message : "Unknown error",
			};
		}
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
