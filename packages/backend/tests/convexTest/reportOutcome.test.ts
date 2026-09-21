import { describe, expect, test } from "vitest";
import { reportCountsTowardLimits } from "../../src/lib/reportOutcome";

describe("reportCountsTowardLimits", () => {
	test("open reports and rows stored before outcomes count", () => {
		expect(reportCountsTowardLimits({})).toBe(true);
		expect(reportCountsTowardLimits({ outcome: "open" })).toBe(true);
		expect(reportCountsTowardLimits({ outcome: "uploader_denied" })).toBe(true);
	});

	test("an admission or an admin clear does not count", () => {
		expect(reportCountsTowardLimits({ outcome: "uploader_admitted" })).toBe(
			false,
		);
		expect(reportCountsTowardLimits({ outcome: "admin_cleared" })).toBe(false);
	});
});
