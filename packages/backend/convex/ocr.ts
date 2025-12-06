import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

type VoucherOcrFailureReason =
  | "EXPIRED"
  | "COULD_NOT_READ_AMOUNT"
  | "COULD_NOT_READ_BARCODE"
  | "COULD_NOT_READ_EXPIRY_DATE"
  | "INVALID_TYPE"
  | "UNKNOWN_ERROR";

class VoucherValidationError extends Error {
  constructor(public reason: VoucherOcrFailureReason, message?: string) {
    super(message || reason);
    this.name = "VoucherValidationError";
  }
}

/**
 * Process a voucher image with Gemini OCR.
 * Extracts voucher type, expiry date, and barcode number.
 */
export const processVoucherImage = internalAction({
  args: {
    voucherId: v.id("vouchers"),
    imageStorageId: v.id("_storage"),
  },
  handler: async (ctx, { voucherId, imageStorageId }) => {
    try {
      // Get image URL from Convex storage
      const imageUrl = await ctx.storage.getUrl(imageStorageId);
      if (!imageUrl) {
        throw new Error("Could not get image URL");
      }

      // Download image and convert to base64
      const imageBase64 = await fetchImageAsBase64(imageUrl);

      // Call Gemini API
      const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!geminiApiKey) {
        throw new Error("Gemini API key not configured");
      }

      const currentYear = new Date().getFullYear();
      const prompt = `You are analyzing an image of a voucher.
We are ONLY looking for specific Dunnes Stores vouchers (Ireland) of these exact types:
- €5 off €25
- €10 off €50
- €20 off €100

Any other voucher type (e.g. "€1 off", "€3 off", product specific, or from other stores) is INVALID.

The current year is ${currentYear}.
The date format on the voucher can vary, examples:
- Valid 23 Nov - 29 Nov
- Coupon valid from 23/11/25 to 29/11/25

Where year is not specified, assume it is the current year.

Extract:
1. **Type**: The discount amount (5, 10, or 20). If it is NOT one of these specific amounts, return "0".
2. **Expiry**: YYYY-MM-DD.
3. **Barcode**: The number below the barcode.

Return ONLY JSON:
{"type": "5", "expiryDate": "2024-12-31", "barcode": "1234567890"}

If barcode is missing: null.
If type is unknown or invalid: "0".
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
              temperature: 0.0, // Reduced temperature for more deterministic output
              maxOutputTokens: 256,
              responseMimeType: "application/json"
            },
          }),
        }
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
        throw new VoucherValidationError("COULD_NOT_READ_AMOUNT", "No text in Gemini response");
      }

      const extracted = JSON.parse(textContent);

      console.log('Extracted:', extracted);

      // Validate and normalize type
      let voucherType: "5" | "10" | "20";
      if (extracted.type === "10" || extracted.type === 10) {
        voucherType = "10";
      } else if (extracted.type === "20" || extracted.type === 20) {
        voucherType = "20";
      } else if (extracted.type === "5" || extracted.type === 5) {
        voucherType = "5";
      } else {
        throw new VoucherValidationError("INVALID_TYPE", "Invalid voucher type detected");
      }

      // Parse expiry date
      let expiryDate: number = 0;

      if (extracted.expiryDate) {
        // Parse YYYY-MM-DD
        const date = new Date(extracted.expiryDate);
        if (!isNaN(date.getTime()) && date.getTime() > Date.now() - 365 * 24 * 60 * 60 * 1000) {
             // Set to end of the day (23:59:59.999) to be inclusive
             date.setHours(23, 59, 59, 999);
             expiryDate = date.getTime();
        } else {
             throw new VoucherValidationError("EXPIRED", "Invalid or past expiry date");
        }
      } else {
        throw new VoucherValidationError("COULD_NOT_READ_EXPIRY_DATE", "Could not determine expiry date");
      }

      // Get barcode (optional)
      const barcodeNumber = extracted.barcode || undefined;

      // Update voucher with extracted data
      await ctx.runMutation(internal.vouchers.updateVoucherFromOcr, {
        voucherId,
        type: voucherType,
        expiryDate,
        barcodeNumber,
        ocrRawResponse: rawResponse,
      });

      console.log(`OCR completed for voucher ${voucherId}: type=${voucherType}, expiry=${new Date(expiryDate).toISOString()}, barcode=${barcodeNumber}, rawResponse=${JSON.stringify(rawResponse)}`);
    } catch (error: any) {
      console.error(`OCR failed for voucher ${voucherId}:`, error);

      let reason: VoucherOcrFailureReason = "UNKNOWN_ERROR";

      if (error instanceof VoucherValidationError) {
          reason = error.reason;
      }

      // Mark voucher as failed
      await ctx.runMutation(internal.vouchers.markVoucherOcrFailed, {
        voucherId,
        error: error.message || "Unknown error",
        reason,
      });
    }
  },
});
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
