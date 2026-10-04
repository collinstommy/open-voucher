import { v } from "convex/values";
import { runCleanup } from "../src/lib/voucherImageCleanup";
import { adminMutation, adminQuery } from "./adminGuards";
import { internalQuery } from "./_generated/server";

const DAY_MS = 86_400_000;
const RECENT_VOUCHER_WINDOW_MS = 31 * DAY_MS;
const WEEKLY_WINDOW_MS = 12 * 7 * DAY_MS;

/**
 * Voucher inventory: available stock per type, read from the by_status_type
 * index so it only touches in-stock documents. Cheap enough to run on every
 * dashboard load; the expensive lifetime totals live in getLifetimeStats.
 */
export const getVoucherInventory = adminQuery({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const shelves = await Promise.all([
			ctx.db
				.query("vouchers")
				.withIndex("by_status_type", (q) =>
					q.eq("status", "available").eq("type", "5"),
				)
				.collect(),
			ctx.db
				.query("vouchers")
				.withIndex("by_status_type", (q) =>
					q.eq("status", "available").eq("type", "10"),
				)
				.collect(),
			ctx.db
				.query("vouchers")
				.withIndex("by_status_type", (q) =>
					q.eq("status", "available").eq("type", "20"),
				)
				.collect(),
		]);

		// status "available" alone isn't claimability: a voucher whose
		// validFrom is in the future is still locked.
		const vouchersByType = {
			"5": shelves[0].filter((v) => !v.validFrom || v.validFrom <= now).length,
			"10": shelves[1].filter((v) => !v.validFrom || v.validFrom <= now).length,
			"20": shelves[2].filter((v) => !v.validFrom || v.validFrom <= now).length,
		};

		return { vouchersByType };
	},
});

/**
 * Lifetime totals across all vouchers and users. Expensive (full-table
 * reads) — the dashboard loads this only behind an explicit button.
 */
export const getLifetimeStats = adminQuery({
	args: {},
	handler: async (ctx) => {
		const [vouchers, users] = await Promise.all([
			ctx.db
				.query("vouchers")
				.withIndex("by_creation_time", (q) =>
					q.gte("_creationTime", Date.now() - RECENT_VOUCHER_WINDOW_MS),
				)
				.collect(),
			ctx.db.query("users").collect(),
		]);

		return {
			totalUploaded: vouchers.length,
			claimedCount: vouchers.filter((v) => v.status === "claimed").length,
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
		const since = Date.now() - WEEKLY_WINDOW_MS;
		const [vouchers, failedUploads] = await Promise.all([
			ctx.db
				.query("vouchers")
				.withIndex("by_creation_time", (q) => q.gte("_creationTime", since))
				.collect(),
			ctx.db
				.query("failedUploads")
				.withIndex("by_creation_time", (q) => q.gte("_creationTime", since))
				.collect(),
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
	args: {},
	handler: async (ctx) => {
		const vouchers = await ctx.db
			.query("vouchers")
			.withIndex("by_creation_time", (q) =>
				q.gte("_creationTime", Date.now() - WEEKLY_WINDOW_MS),
			)
			.collect();

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

		const sorted = Array.from(weeks.values())
			.sort((a, b) => a.weekStart.localeCompare(b.weekStart))
			.slice(-12);
		const total = sorted.reduce((sum, w) => sum + w.uploaded, 0);
		const average =
			sorted.length > 0 ? Math.round((total / sorted.length) * 10) / 10 : 0;

		return { weeks: sorted, average };
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
