import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

type TestImage = {
	filename: string;
	expectedValidFromDay: number;
	expectedValidFromMonth: number;
	expectedExpiryDay: number;
	expectedExpiryMonth: number;
	testDates?: string[]; // Override default test dates (date strings like "2025-12-22")
};

// Default test dates applied to all images unless overridden
const DEFAULT_TEST_DATES = [
	{ label: "Dec 22 2025", year: 2025, date: "2025-12-22" },
	{ label: "Jan 1 2026", year: 2026, date: "2026-01-01" },
	{ label: "Jan 3 2026", year: 2026, date: "2026-01-03" },
	{ label: "Jan 25 2025", year: 2025, date: "2025-01-25" },
	{ label: "Jan 29 2026", year: 2026, date: "2026-01-29" },
	{ label: "Feb 1 2026", year: 2026, date: "2026-02-01" },
	{ label: "Feb 10 2026", year: 2026, date: "2026-02-10" },
];

const TEST_IMAGES: TestImage[] = [
	{
		filename: "23dec-3jan.jpg",
		expectedValidFromDay: 23,
		expectedValidFromMonth: 12,
		expectedExpiryDay: 5,
		expectedExpiryMonth: 1,
	},
	{
		filename: "23dec-5jan.jpg",
		expectedValidFromDay: 23,
		expectedValidFromMonth: 12,
		expectedExpiryDay: 5,
		expectedExpiryMonth: 1,
	},
	{
		filename: "29dec-7jan.jpg",
		expectedValidFromDay: 29,
		expectedValidFromMonth: 12,
		expectedExpiryDay: 7,
		expectedExpiryMonth: 1,
		testDates: ["2025-12-22"],
	},
	{
		filename: "30Dec-8jan.jpg",
		expectedValidFromDay: 30,
		expectedValidFromMonth: 12,
		expectedExpiryDay: 8,
		expectedExpiryMonth: 1,
		testDates: ["2025-12-28"], // Custom date not in default
	},
	{
		filename: "dec21-jan5.jpg",
		expectedValidFromDay: 21,
		expectedValidFromMonth: 12,
		expectedExpiryDay: 5,
		expectedExpiryMonth: 1,
		testDates: ["2025-12-22"],
	},
	{
		filename: "26jan-1feb.jpg",
		expectedValidFromDay: 26,
		expectedValidFromMonth: 1,
		expectedExpiryDay: 1,
		expectedExpiryMonth: 2,
		testDates: ["2025-01-25"],
	},
	{
		filename: "jan26-feb01.jpg",
		expectedValidFromDay: 26,
		expectedValidFromMonth: 1,
		expectedExpiryDay: 1,
		expectedExpiryMonth: 2,
		testDates: ["2025-01-25"],
	},
	{
		filename: "feb2nd-feb11th.jpg",
		expectedValidFromDay: 2,
		expectedValidFromMonth: 2,
		expectedExpiryDay: 11,
		expectedExpiryMonth: 2,
		testDates: ["2026-02-01"],
	},
	{
		filename: "feb11-feb17.jpg",
		expectedValidFromDay: 11,
		expectedValidFromMonth: 2,
		expectedExpiryDay: 17,
		expectedExpiryMonth: 2,
		testDates: ["2026-02-10"],
	},
];

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
		if (!response.ok)
			throw new Error(`Failed to fetch image: ${response.status}`);
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

		const defaultImageUrls: ImageInput[] = [
			{
				filename: "23dec-3jan.jpg",
				imageUrl: "http://localhost:3000/test-images/23dec-3jan.jpg",
			},
			{
				filename: "23dec-5jan.jpg",
				imageUrl: "http://localhost:3000/test-images/23dec-5jan.jpg",
			},
			{
				filename: "29dec-7jan.jpg",
				imageUrl: "http://localhost:3000/test-images/29dec-7jan.jpg",
			},
			{
				filename: "30Dec-8jan.jpg",
				imageUrl: "http://localhost:3000/test-images/30Dec-8jan.jpg",
			},
			{
				filename: "dec21-jan5.jpg",
				imageUrl: "http://localhost:3000/test-images/dec21-jan5.jpg",
			},
			{
				filename: "26jan-1feb.jpg",
				imageUrl: "http://localhost:3000/test-images/26jan-1feb.jpg",
			},
			{
				filename: "feb11-feb17.jpg",
				imageUrl: "http://localhost:3000/test-images/feb11-feb17.jpg",
			},
		];

		const imagesToProcess = images.length > 0 ? images : defaultImageUrls;
		const results: EvalResult[] = [];

		for (const imageData of imagesToProcess) {
			const imageBase64 = await getImageBase64(imageData);
			const imageConfig = TEST_IMAGES.find(
				(img) => img.filename === imageData.filename,
			);
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

			// Use image-specific test dates if provided, otherwise use default
			let testDatesToRun: typeof DEFAULT_TEST_DATES;
			if (imageConfig.testDates) {
				// Map custom dates, looking up in DEFAULT_TEST_DATES or creating custom ones
				testDatesToRun = imageConfig.testDates.map((dateStr) => {
					const found = DEFAULT_TEST_DATES.find((td) => td.date === dateStr);
					if (found) return found;
					// Create custom date entry
					const year = Number(dateStr.split("-")[0]);
					return { label: dateStr, year, date: dateStr };
				});
			} else {
				testDatesToRun = DEFAULT_TEST_DATES;
			}

			for (const testDate of testDatesToRun) {
				const expiryYear =
					imageConfig.expectedExpiryMonth < imageConfig.expectedValidFromMonth
						? testDate.year + 1
						: testDate.year;

				const validFromMonthDay =
					imageConfig.expectedValidFromMonth * 100 +
					imageConfig.expectedValidFromDay;
				const expiryMonthDay =
					imageConfig.expectedExpiryMonth * 100 + imageConfig.expectedExpiryDay;
				const validFromIsAfterExpiry = validFromMonthDay > expiryMonthDay;

				const expectedValidFromYear = validFromIsAfterExpiry
					? expiryYear - 1
					: expiryYear;
				const expectedExpiryYear = expiryYear;

				const expectedValidFrom = `${expectedValidFromYear}-${String(imageConfig.expectedValidFromMonth).padStart(2, "0")}-${String(imageConfig.expectedValidFromDay).padStart(2, "0")}`;
				const expectedExpiry = `${expectedExpiryYear}-${String(imageConfig.expectedExpiryMonth).padStart(2, "0")}-${String(imageConfig.expectedExpiryDay).padStart(2, "0")}`;

				try {
					const ocrResult = await ctx.runAction(
						internal.ocr.extract.extractFromBase64,
						{
							imageBase64: imageBase64,
							currentDate: testDate.date,
						},
					);

					console.log(
						`[OCR Eval] ${imageData.filename} | testDate: ${testDate.date} | raw: ${ocrResult.rawResponse}`,
					);

					const success =
						ocrResult.validFrom === expectedValidFrom &&
						ocrResult.expiryDate === expectedExpiry;

					results.push({
						filename: imageData.filename,
						testDate: testDate.label,
						success,
						expectedValidFrom,
						expectedExpiry,
						actualValidFrom: ocrResult.validFrom,
						actualExpiry: ocrResult.expiryDate,
					});
				} catch (error) {
					results.push({
						filename: imageData.filename,
						testDate: testDate.label,
						success: false,
						expectedValidFrom,
						expectedExpiry,
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
