import { v } from "convex/values";
import dayjs from "dayjs";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

// Test configuration: image filename -> test date -> expected result
const TEST_CONFIG: Record<
	string,
	Record<
		string,
		{
			validFrom: string;
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
	expectedValidFrom: string;
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
	},
	handler: async (ctx, args): Promise<EvalsResponse> => {
		const images = args.images || [];

		const defaultImageUrls: ImageInput[] = Object.keys(TEST_CONFIG).map(
			(filename) => ({
				filename,
				imageUrl: `http://localhost:3000/test-images/${filename}`,
			}),
		);

		const imagesToProcess = images.length > 0 ? images : defaultImageUrls;
		const results: EvalResult[] = [];

		for (const imageData of imagesToProcess) {
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
						internal.ocr.extract.extractFromBase64,
						{
							imageBase64: imageBase64,
							currentDate: dateStr,
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
