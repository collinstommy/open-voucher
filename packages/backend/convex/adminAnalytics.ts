import { v } from "convex/values";
import {
	buildAnalyticsEventCounts,
	buildMessageAnalytics,
} from "../src/lib/messageAnalytics";
import { adminQuery } from "./adminGuards";

export const getMessageAnalytics = adminQuery({
	args: {
		since: v.optional(v.number()),
	},
	handler: async (ctx, { since }) => {
		return await buildMessageAnalytics(ctx, since);
	},
});

export const getAnalyticsEventCounts = adminQuery({
	args: {
		since: v.optional(v.number()),
	},
	handler: async (ctx, { since }) => {
		return await buildAnalyticsEventCounts(ctx, since);
	},
});

export const getTransactionTotalsByType = adminQuery({
	args: {
		since: v.optional(v.number()),
	},
	handler: async (ctx, { since }) => {
		const filtered = since
			? await ctx.db
					.query("transactions")
					.withIndex("by_creation_time", (q) =>
						q.gte("_creationTime", since),
					)
					.collect()
			: await ctx.db.query("transactions").collect();

		const totals: Record<string, number> = {};
		for (const t of filtered) {
			totals[t.type] = (totals[t.type] ?? 0) + 1;
		}

		return { totals, totalCount: filtered.length };
	},
});

export const getUserGrowth = adminQuery({
	args: {
		range: v.union(v.literal("all"), v.literal("30days")),
	},
	handler: async (ctx, { range }) => {
		const now = Date.now();
		const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

		const users = await ctx.db.query("users").collect();

		const filteredUsers =
			range === "30days"
				? users.filter((u) => u.createdAt >= thirtyDaysAgo)
				: users;

		if (filteredUsers.length === 0) {
			return { data: [] };
		}

		const dateMap = new Map<string, number>();

		for (const user of filteredUsers) {
			const date = new Date(user.createdAt);
			const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
			dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + 1);
		}

		const sortedDates = Array.from(dateMap.entries()).sort(
			(a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime(),
		);

		const data: { date: string; cumulative: number }[] = [];
		let cumulative = 0;

		if (range === "30days") {
			for (let i = 29; i >= 0; i--) {
				const d = new Date(now - i * 24 * 60 * 60 * 1000);
				const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
				const count = dateMap.get(dateKey) || 0;
				cumulative += count;
				data.push({ date: dateKey, cumulative });
			}
		} else {
			for (const [date, count] of sortedDates) {
				cumulative += count;
				data.push({ date, cumulative });
			}
		}

		return { data };
	},
});
