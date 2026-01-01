import { Id } from "./_generated/dataModel";
import dayjs from "dayjs";

type OcrSuccess = {
	status: "success";
	type: "5" | "10" | "20";
	barcodeNumber: string;
	expiryDate: number;
	validFrom: number | undefined;
	rawResponse: string;
};

type OcrError =
	| { status: "error"; reason: "INVALID_TYPE" }
	| { status: "error"; reason: "EXPIRED"; expiryDate: number }
	| { status: "error"; reason: "MISSING_BARCODE" }
	| { status: "error"; reason: "MISSING_EXPIRY_DATE" }
	| { status: "error"; reason: "MISSING_VALID_FROM" }
	| { status: "error"; reason: "API_ERROR"; details: string };

type OcrResult = OcrSuccess | OcrError;

export async function extractVoucherData(
	imageStorageId: Id<"_storage">,
	storage: { getUrl: (id: Id<"_storage">) => Promise<string | null> },
): Promise<OcrResult> {
	const imageUrl = await storage.getUrl(imageStorageId);
	if (!imageUrl) {
		return {
			status: "error",
			reason: "API_ERROR",
			details: "Could not get image URL",
		};
	}

	const imageBase64 = await fetchImageAsBase64(imageUrl);

	const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
	if (!geminiApiKey) {
		return {
			status: "error",
			reason: "API_ERROR",
			details: "Gemini API key not configured",
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

	try {
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
			return {
				status: "error",
				reason: "API_ERROR",
				details: `Gemini API error: ${error}`,
			};
		}

		const result = await response.json();
		const rawResponse = JSON.stringify(result);

		const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text;
		if (!textContent) {
			return { status: "error", reason: "MISSING_EXPIRY_DATE" };
		}

		const extracted = JSON.parse(textContent);

		let voucherType: "5" | "10" | "20";
		if (extracted.type === "10" || extracted.type === 10) {
			voucherType = "10";
		} else if (extracted.type === "20" || extracted.type === 20) {
			voucherType = "20";
		} else if (extracted.type === "5" || extracted.type === 5) {
			voucherType = "5";
		} else {
			return { status: "error", reason: "INVALID_TYPE" };
		}

		let validFrom: number | undefined;

		if (extracted.validFrom) {
			const dayjsValidFrom = dayjs(extracted.validFrom);

			if (
				dayjsValidFrom.isValid() &&
				dayjsValidFrom.valueOf() > Date.now() - 365 * 24 * 60 * 60 * 1000
			) {
				validFrom = dayjsValidFrom.startOf("day").valueOf();
			} else {
				return { status: "error", reason: "MISSING_VALID_FROM" };
			}
		} else {
			return { status: "error", reason: "MISSING_VALID_FROM" };
		}

		let expiryDate: number = 0;

		if (extracted.expiryDate) {
			const dayjsDate = dayjs(extracted.expiryDate);
			const now = dayjs();

			if (
				dayjsDate.isValid() &&
				dayjsDate.valueOf() > Date.now() - 365 * 24 * 60 * 60 * 1000
			) {
				expiryDate = dayjsDate.endOf("day").valueOf();

				if (dayjsDate.isBefore(now, "day")) {
					return { status: "error", reason: "EXPIRED", expiryDate };
				}

				if (dayjsDate.isSame(now, "day") && now.hour() >= 21) {
					return { status: "error", reason: "EXPIRED", expiryDate };
				}
			} else {
				return { status: "error", reason: "MISSING_EXPIRY_DATE" };
			}
		} else {
			return { status: "error", reason: "MISSING_EXPIRY_DATE" };
		}

		const barcodeNumber = extracted.barcode;
		if (!barcodeNumber) {
			return { status: "error", reason: "MISSING_BARCODE" };
		}

		return {
			status: "success",
			type: voucherType,
			barcodeNumber,
			expiryDate,
			validFrom,
			rawResponse,
		};
	} catch (error: any) {
		return {
			status: "error",
			reason: "API_ERROR",
			details: error?.message || "Unknown error",
		};
	}
}

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
