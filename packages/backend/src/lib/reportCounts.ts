import type { Id } from "../../convex/_generated/dataModel";
import type { MutationCtx } from "../../convex/_generated/server";

export async function recalculateReportCounts(
	ctx: MutationCtx,
	userIds: Id<"users">[],
) {
	const uniqueUserIds = [...new Set(userIds)];

	await Promise.all(
		uniqueUserIds.map(async (userId) => {
			const [uploadReports, claimReports] = await Promise.all([
				ctx.db
					.query("reports")
					.withIndex("by_uploader", (q) => q.eq("uploaderId", userId))
					.collect(),
				ctx.db
					.query("reports")
					.withIndex("by_reporterId", (q) => q.eq("reporterId", userId))
					.collect(),
			]);

			await ctx.db.patch(userId, {
				uploadReportCount: uploadReports.length,
				claimReportCount: claimReports.length,
			});
		}),
	);
}
