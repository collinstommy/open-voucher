import { internalQuery, query } from "./_generated/server";

export const getStats = query({
	handler: async (ctx) => {
		const [vouchers, users] = await Promise.all([
			ctx.db.query("vouchers").collect(),
			ctx.db.query("users").collect(),
		]);

		const now = Date.now();
		const availableVouchers = vouchers.filter(
			(v) =>
				v.status === "available" &&
				(!v.validFrom || v.validFrom <= now),
		);

		const vouchersByType = {
			"5": availableVouchers.filter((v) => v.type === "5").length,
			"10": availableVouchers.filter((v) => v.type === "10").length,
			"20": availableVouchers.filter((v) => v.type === "20").length,
		};

		const claimedCount = vouchers.filter((v) => v.status === "claimed").length;
		const totalUploaded = vouchers.length;
		const userCount = users.length;

		return {
			vouchersByType,
			claimedCount,
			totalUploaded,
			userCount,
		};
	},
});

export const getExpiringVouchers = internalQuery({
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
