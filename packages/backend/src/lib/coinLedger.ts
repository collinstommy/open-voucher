import type { MutationCtx } from "../../convex/_generated/server";
import type { Id } from "../../convex/_generated/dataModel";
import { MIN_COINS } from "./constants";

/**
 * Transaction types recorded in the `transactions` table.
 * Mirrors the union defined on the table in `schema.ts`.
 */
export type TransactionType =
	| "signup_bonus"
	| "upload_reward"
	| "claim_spend"
	| "refund"
	| "report_refund"
	| "uploader_refund"
	| "uploader_denied"
	| "admin_expiry_deduction"
	| "admin_manual_deduction"
	| "admin_report_deduction"
	| "claim_reversed"
	| "self_invalidated"
	| "claim_returned"
	| "replacement_received"
	| "fork_merge_clawback";

export type ApplyCoinDeltaArgs = {
	userId: Id<"users">;
	delta: number;
	type: TransactionType;
	voucherId?: Id<"vouchers">;
	minCoins?: number;
};

export type ApplyCoinDeltaResult = {
	newBalance: number;
};

export async function applyCoinDelta(
	ctx: MutationCtx,
	args: ApplyCoinDeltaArgs,
): Promise<ApplyCoinDeltaResult> {
	const user = await ctx.db.get(args.userId);
	if (!user) {
		throw new Error(`User not found: ${args.userId}`);
	}

	const minCoins = args.minCoins ?? MIN_COINS;
	const newBalance = Math.max(minCoins, user.coins + args.delta);

	// Record the balance change that actually happened, so the ledger
	// always sums to the user's balance even when the delta is clamped
	// at MIN_COINS.
	const effectiveDelta = newBalance - user.coins;

	await ctx.db.patch(args.userId, { coins: newBalance });
	await ctx.db.insert("transactions", {
		userId: args.userId,
		type: args.type,
		amount: effectiveDelta,
		voucherId: args.voucherId,
		createdAt: Date.now(),
	});

	return { newBalance };
}
