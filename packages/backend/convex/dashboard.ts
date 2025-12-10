import { query } from "./_generated/server";

export const getStats = query({
	handler: async (ctx) => {
		const [vouchers, users] = await Promise.all([
			ctx.db.query("vouchers").collect(),
			ctx.db.query("users").collect(),
		]);

		const availableVouchers = vouchers.filter((v) => v.status === "available");

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
