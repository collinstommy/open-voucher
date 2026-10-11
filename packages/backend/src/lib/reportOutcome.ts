import { v } from "convex/values";

export const reportOutcome = v.union(
	v.literal("open"),
	v.literal("uploader_admitted"),
	v.literal("uploader_denied"),
	v.literal("admin_cleared"),
);

export type ReportOutcome =
	| "open"
	| "uploader_admitted"
	| "uploader_denied"
	| "admin_cleared";

/** Missing outcome is an existing row from before outcomes were stored. */
export function reportCountsTowardLimits(report: {
	outcome?: ReportOutcome;
}): boolean {
	return (
		report.outcome === undefined ||
		report.outcome === "open" ||
		report.outcome === "uploader_denied"
	);
}
