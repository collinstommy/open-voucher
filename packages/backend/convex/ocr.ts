import { v } from "convex/values";
import dayjs from "dayjs";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

type VoucherOcrFailureReason =
	| "EXPIRED"
	| "COULD_NOT_READ_AMOUNT"
	| "COULD_NOT_READ_BARCODE"
	| "COULD_NOT_READ_EXPIRY_DATE"
	| "COULD_NOT_READ_VALID_FROM"
	| "INVALID_TYPE"
	| "DUPLICATE_BARCODE"
	| "UNKNOWN_ERROR";

class VoucherValidationError extends Error {
	constructor(
		public reason: VoucherOcrFailureReason,
		message?: string,
		public expiryDate?: number,
	) {
		super(message || reason);
		this.name = "VoucherValidationError";
	}
}

type ExtractedVoucherData = {
	type: "5" | "10" | "20";
	expiryDate: string;
	validFrom: string | null;
	barcodeNumber: string;
	rawResponse: string;
};

type ValidationResult = {
	valid: boolean;
	reason?: VoucherOcrFailureReason;
	expiryDate?: number;
	validFrom?: number;
	parsedExpiryDate?: number;
};

/**
 * Fetch an image from URL and convert to base64.
 */
async function fetchImageAsBase64(url: string): Promise<string> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch image: ${response.status}`);
	}

	const arrayBuffer = await response.arrayBuffer();
	const uint8Array = new Uint8Array(arrayBuffer);

	// Convert to base64
	let binary = "";
	for (let i = 0; i < uint8Array.length; i++) {
		binary += String.fromCharCode(uint8Array[i]);
	}
	return btoa(binary);
}

/**
 * Extract voucher data from image using Gemini OCR.
 * Pure function that only handles OCR extraction.
 */
async function extractVoucherData(
	imageUrl: string,
	geminiApiKey: string,
): Promise<ExtractedVoucherData> {
	// Download image and convert to base64
	const imageBase64 = await fetchImageAsBase64(imageUrl);

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
		const error = await response.text();
		throw new Error(`Gemini API error: ${error}`);
	}

	const result = await response.json();
	const rawResponse = JSON.stringify(result);

	// Extract text from response
	const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text;
	if (!textContent) {
		throw new VoucherValidationError(
			"COULD_NOT_READ_AMOUNT",
			"No text in Gemini response",
		);
	}

	const extracted = JSON.parse(textContent);
	console.log("Extracted:", extracted);

	// Validate and normalize type
	let voucherType: "5" | "10" | "20";
	if (extracted.type === "10" || extracted.type === 10) {
		voucherType = "10";
	} else if (extracted.type === "20" || extracted.type === 20) {
		voucherType = "20";
	} else if (extracted.type === "5" || extracted.type === 5) {
		voucherType = "5";
	} else {
		throw new VoucherValidationError(
			"INVALID_TYPE",
			"Invalid voucher type detected",
		);
	}

	const barcodeNumber = extracted.barcode;
	if (!barcodeNumber) {
		throw new VoucherValidationError(
			"COULD_NOT_READ_BARCODE",
			"Could not read barcode from voucher",
		);
	}

	return {
		type: voucherType,
		expiryDate: extracted.expiryDate,
		validFrom: extracted.validFrom,
		barcodeNumber,
		rawResponse,
	};
}

/**
 * Validate extracted voucher data.
 * Pure function that validates dates and expiry.
 */
function validateVoucherData(extracted: ExtractedVoucherData): ValidationResult {
	// Parse validFrom date
	let validFrom: number | undefined;

	if (extracted.validFrom) {
		const dayjsValidFrom = dayjs(extracted.validFrom);

		// Parse YYYY-MM-DD
		if (
			dayjsValidFrom.isValid() &&
			dayjsValidFrom.valueOf() > Date.now() - 365 * 24 * 60 * 60 * 1000
		) {
			// Set to start of the day (00:00:00.000)
			validFrom = dayjsValidFrom.startOf("day").valueOf();
		} else {
			return {
				valid: false,
				reason: "COULD_NOT_READ_VALID_FROM",
			};
		}
	} else {
		return {
			valid: false,
			reason: "COULD_NOT_READ_VALID_FROM",
		};
	}

	// Parse expiry date
	let expiryDate: number = 0;

	if (extracted.expiryDate) {
		const dayjsDate = dayjs(extracted.expiryDate);
		const now = dayjs();

		// Parse YYYY-MM-DD
		if (
			dayjsDate.isValid() &&
			dayjsDate.valueOf() > Date.now() - 365 * 24 * 60 * 60 * 1000
		) {
			// Set to end of the day (23:59:59.999) to be inclusive
			expiryDate = dayjsDate.endOf("day").valueOf();

			// Check if already expired (yesterday or older)
			if (dayjsDate.isBefore(now, "day")) {
				return {
					valid: false,
					reason: "EXPIRED",
					expiryDate,
				};
			}

			// Check if expiring today and it's too late (after 9 PM)
			if (dayjsDate.isSame(now, "day") && now.hour() >= 21) {
				return {
					valid: false,
					reason: "EXPIRED",
					expiryDate,
				};
			}
		} else {
			return {
				valid: false,
				reason: "EXPIRED",
			};
		}
	} else {
		return {
			valid: false,
			reason: "COULD_NOT_READ_EXPIRY_DATE",
		};
	}

	return {
		valid: true,
		validFrom,
		parsedExpiryDate: expiryDate,
	};
}

/**
 * Process a voucher image with Gemini OCR.
 * New flow: Extract -> Validate -> Create voucher (only if valid).
 * Invalid vouchers are logged but not saved to DB.
 */
export const processVoucherImage = internalAction({
	args: {
		userId: v.id("users"),
		imageStorageId: v.id("_storage"),
	},
	handler: async (ctx, { userId, imageStorageId }) => {
		try {
			// Get image URL from Convex storage
			const imageUrl = await ctx.storage.getUrl(imageStorageId);
			if (!imageUrl) {
				throw new Error("Could not get image URL");
			}

			// Get Gemini API key
			const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
			if (!geminiApiKey) {
				throw new Error("Gemini API key not configured");
			}

			// Step 1: Extract voucher data via OCR
			const extracted = await extractVoucherData(imageUrl, geminiApiKey);

			// Step 2: Validate extracted data
			const validation = validateVoucherData(extracted);
			if (!validation.valid) {
				throw new VoucherValidationError(
					validation.reason!,
					`Validation failed: ${validation.reason}`,
					validation.expiryDate,
				);
			}

			// Step 3: Check for duplicate barcode
			const existingVoucher = await ctx.runQuery(
				internal.vouchers.getVoucherByBarcode,
				{
					barcodeNumber: extracted.barcodeNumber,
				},
			);
			if (existingVoucher) {
				throw new VoucherValidationError(
					"DUPLICATE_BARCODE",
					"This voucher has already been uploaded",
				);
			}

			// Step 4: Create validated voucher (handles rewards, notifications, limits)
			await ctx.runMutation(internal.vouchers.createValidatedVoucher, {
				userId,
				imageStorageId,
				type: extracted.type,
				expiryDate: validation.parsedExpiryDate!,
				validFrom: validation.validFrom!,
				barcodeNumber: extracted.barcodeNumber,
				ocrRawResponse: extracted.rawResponse,
			});

			console.log(
				`OCR completed successfully for user ${userId}: type=${extracted.type}, barcode=${extracted.barcodeNumber}`,
			);
		} catch (error: any) {
			console.error(`OCR failed for user ${userId}:`, error);

			let reason: VoucherOcrFailureReason = "UNKNOWN_ERROR";
			let expiryDate: number | undefined;

			if (error instanceof VoucherValidationError) {
				reason = error.reason;
				expiryDate = error.expiryDate;
			}

			// Log failure (no DB record created)
			await ctx.runMutation(internal.vouchers.logFailedOcrAttempt, {
				userId,
				imageStorageId,
				reason,
				error: error.message || "Unknown error",
				expiryDate,
			});

			// Send user notification about failure
			await ctx.runMutation(internal.vouchers.sendOcrFailureNotification, {
				userId,
				reason,
				expiryDate,
			});
		}
	},
});
