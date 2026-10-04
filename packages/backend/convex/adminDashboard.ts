import { v } from "convex/values";
import { runCleanup } from "../src/lib/voucherImageCleanup";
import { adminMutation, adminQuery } from "./adminGuards";
import { voucherAggregate } from "./aggregates";
import { internalQuery } from "./_generated/server";

export const getStats = adminQuery({
	args: {},
	handler: async (ctx) => {
		const users = await ctx.db.query("users").collect();

		const [five, ten, twenty, claimedCount, totalUploaded] = await Promise.all([
			voucherAggregate.count(ctx, { bounds: { prefix: ["available", "5"] } }),
			voucherAggregate.count(ctx, { bounds: { prefix: ["available", "10"] } }),
			voucherAggregate.count(ctx, { bounds: { prefix: ["available", "20"] } }),
			voucherAggregate.count(ctx, { bounds: { prefix: ["claimed"] } }),
			voucherAggregate.count(ctx),
		]);

		return {
			vouchersByType: { "5": five, "10": ten, "20": twenty },
			claimedCount,
			totalUploaded,
			userCount: users.length,
		};
	},
});

export const getExpiringVouchers = internalQuery({
	args: {},
	handler: async (ctx) => {
		const now = new Date();
		const nowTimestamp = now.getTime();
		const startOfToday = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
		).getTime();
		const endOfTomorrow = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate() + 2,
		).getTime();

		const vouchers = await ctx.db.query("vouchers").collect();

		const expiringVouchers = vouchers
			.filter(
				(v) =>
					v.expiryDate >= startOfToday &&
					v.expiryDate < endOfTomorrow &&
					v.status === "available" &&
					(!v.validFrom || v.validFrom <= nowTimestamp),
			)
			.map((v) => ({
				id: v._id,
				type: v.type,
				expiryDate: new Date(v.expiryDate).toISOString().split("T")[0],
				status: v.status,
			}));

		return expiringVouchers;
	},
});

function getWeekStart(ts: number): Date {
	const date = new Date(ts);
	const day = date.getUTCDay(); // 0 = Sun, 1 = Mon
	const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff));
}

function formatWeekLabel(monday: Date): string {
	const month = monday.toLocaleDateString("en-US", { month: "short" });
	const day = monday.getUTCDate();
	return `${month} ${day}`;
}

export const getWeeklyFailureStats = adminQuery({
	args: {},
	handler: async (ctx) => {
		const [vouchers, failedUploads] = await Promise.all([
			ctx.db.query("vouchers").collect(),
			ctx.db.query("failedUploads").collect(),
		]);

		const weeks = new Map<
			string,
			{ weekStart: string; label: string; total: number; failed: number }
		>();

		for (const v of vouchers) {
			const monday = getWeekStart(v._creationTime);
			const key = monday.toISOString().split("T")[0];
			const existing = weeks.get(key);
			if (existing) {
				existing.total++;
			} else {
				weeks.set(key, {
					weekStart: key,
					label: formatWeekLabel(monday),
					total: 1,
					failed: 0,
				});
			}
		}

		for (const f of failedUploads) {
			if (f.failureReason === "DUPLICATE_BARCODE") continue;

			const monday = getWeekStart(f._creationTime);
			const key = monday.toISOString().split("T")[0];
			const existing = weeks.get(key);
			if (existing) {
				existing.total++;
				existing.failed++;
			} else {
				weeks.set(key, {
					weekStart: key,
					label: formatWeekLabel(monday),
					total: 1,
					failed: 1,
				});
			}
		}

		let sorted = Array.from(weeks.values()).sort((a, b) =>
			b.weekStart.localeCompare(a.weekStart),
		);

		const now = Date.now();
		const currentMonday = getWeekStart(now);
		const currentKey = currentMonday.toISOString().split("T")[0];
		if (!weeks.has(currentKey)) {
			sorted.unshift({
				weekStart: currentKey,
				label: formatWeekLabel(currentMonday),
				total: 0,
				failed: 0,
			});
		}

		sorted = sorted.slice(0, 12);

		return sorted.map((w) => ({
			...w,
			rate: w.total > 0 ? Math.round((w.failed / w.total) * 100) : 0,
		}));
	},
});

export const getWeeklyVouchers = adminQuery({
	args: {},
	handler: async (ctx) => {
		const now = new Date();
		const startOfToday = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
		).getTime();

		const sevenDaysAgo = startOfToday - 7 * 24 * 60 * 60 * 1000;

		const vouchers = await ctx.db
			.query("vouchers")
			.withIndex("by_creation_time", (q) =>
				q.gte("_creationTime", sevenDaysAgo),
			)
			.collect();

		const dailyData: Record<
			string,
			{ uploaded: number; claimed: number; date: string }
		> = {};

		for (let i = 0; i < 7; i++) {
			const date = new Date(startOfToday - i * 24 * 60 * 60 * 1000);
			const dateKey = date.toISOString().split("T")[0];
			dailyData[dateKey] = { uploaded: 0, claimed: 0, date: dateKey };
		}

		for (const voucher of vouchers) {
			const dateKey = new Date(voucher._creationTime)
				.toISOString()
				.split("T")[0];
			if (dailyData[dateKey]) {
				dailyData[dateKey].uploaded++;
			}
		}

		const claimedVouchers = vouchers.filter(
			(v) => v.status === "claimed" && v.claimedAt,
		);
		for (const voucher of claimedVouchers) {
			const dateKey = new Date(voucher.claimedAt!).toISOString().split("T")[0];
			if (dailyData[dateKey]) {
				dailyData[dateKey].claimed++;
			}
		}

		return Object.values(dailyData).sort(
			(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
		);
	},
});

export const getWeeklyUploadAverage = adminQuery({
	args: {
		range: v.union(v.literal("recent"), v.literal("all")),
	},
	handler: async (ctx, { range }) => {
		const vouchers = await ctx.db.query("vouchers").collect();

		const weeks = new Map<
			string,
			{ weekStart: string; label: string; uploaded: number }
		>();

		for (const v of vouchers) {
			const monday = getWeekStart(v._creationTime);
			const key = monday.toISOString().split("T")[0];
			const existing = weeks.get(key);
			if (existing) {
				existing.uploaded++;
			} else {
				weeks.set(key, {
					weekStart: key,
					label: formatWeekLabel(monday),
					uploaded: 1,
				});
			}
		}

		const now = Date.now();
		const currentMonday = getWeekStart(now);
		const currentKey = currentMonday.toISOString().split("T")[0];
		if (!weeks.has(currentKey)) {
			weeks.set(currentKey, {
				weekStart: currentKey,
				label: formatWeekLabel(currentMonday),
				uploaded: 0,
			});
		}

		const sorted = Array.from(weeks.values()).sort((a, b) =>
			a.weekStart.localeCompare(b.weekStart),
		);
		const scoped = range === "recent" ? sorted.slice(-12) : sorted;
		const total = scoped.reduce((sum, w) => sum + w.uploaded, 0);
		const average =
			scoped.length > 0 ? Math.round((total / scoped.length) * 10) / 10 : 0;

		return { weeks: scoped, average };
	},
});

export const cleanupExpiredVoucherImages = adminMutation({
	args: {
		token: v.string(),
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, { dryRun }) => {
		return runCleanup(ctx, dryRun !== false);
	},
});
