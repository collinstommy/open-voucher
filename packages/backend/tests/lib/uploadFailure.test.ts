import { describe, expect, test } from "vitest";
import { uploadFailureBody } from "../../src/lib/uploadFailure";

describe("uploadFailureBody", () => {
	test("maps known reasons without mentioning support", () => {
		expect(uploadFailureBody("INVALID_TYPE")).toContain("€5, €10, or €20");
		expect(uploadFailureBody("DUPLICATE_BARCODE")).toContain(
			"already been uploaded",
		);
		expect(uploadFailureBody("SYSTEM_ERROR")).toBe(
			"We encountered an error while processing your voucher. Please try again.",
		);
		expect(uploadFailureBody("SYSTEM_ERROR").toLowerCase()).not.toContain(
			"support",
		);
	});

	test("formats expiry dates for expired vouchers", () => {
		expect(uploadFailureBody("EXPIRED", "2026-01-15")).toContain("15-01-2026");
		expect(uploadFailureBody("EXPIRED")).toContain("unknown");
	});
});
