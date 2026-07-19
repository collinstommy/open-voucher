import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export const ADMIN_TEST_TELEGRAM_CHAT_ID = "6774789510";
export const MAX_BROADCAST_RECIPIENTS = 500;

export type BroadcastRecipient = {
	userId: Id<"users">;
	telegramChatId: string;
	username?: string;
	firstName?: string;
	claimCount: number;
};

export async function resolveBroadcastAudience(
	ctx: QueryCtx,
	minClaims: number,
	withinDays: number,
): Promise<BroadcastRecipient[]> {
	const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;

	const vouchers = await ctx.db
		.query("vouchers")
		.withIndex("by_claimed_at", (q) => q.gte("claimedAt", cutoff))
		.collect();

	const claimCountByUser = new Map<Id<"users">, number>();
	for (const voucher of vouchers) {
		if (!voucher.claimerId) continue;
		claimCountByUser.set(
			voucher.claimerId,
			(claimCountByUser.get(voucher.claimerId) ?? 0) + 1,
		);
	}

	const recipients: BroadcastRecipient[] = [];
	for (const [userId, claimCount] of claimCountByUser) {
		if (claimCount < minClaims) continue;

		const user = await ctx.db.get(userId);
		if (!user || user.isBanned) continue;

		recipients.push({
			userId,
			telegramChatId: user.telegramChatId,
			username: user.username,
			firstName: user.firstName,
			claimCount,
		});
	}

	recipients.sort((a, b) => b.claimCount - a.claimCount);
	return recipients;
}
