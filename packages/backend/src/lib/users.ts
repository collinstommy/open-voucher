// Shared user-creation path. Both the bot webhook (users.createUser) and
// Google sign-in (authIdentities.resolveGoogleUser) must go through this so
// the signup bonus and initial-row shape cannot drift between the two flows.

import type { Id } from "../../convex/_generated/dataModel";
import type { MutationCtx } from "../../convex/_generated/server";
import { applyCoinDelta } from "./coinLedger";
import { SIGNUP_BONUS } from "./constants";

export interface CreateUserRecordArgs {
	/** Omitted for Google-only (chatless) users. */
	telegramChatId?: string;
	username?: string;
	firstName?: string;
}

export type CreatedUserRecord = {
	userId: Id<"users">;
	coins: number;
	isBanned: boolean;
};

/**
 * Insert a users row and grant the signup bonus. Callers are responsible for
 * their own upsert/existence checks.
 */
export async function createUserRecord(
	ctx: MutationCtx,
	args: CreateUserRecordArgs,
): Promise<CreatedUserRecord> {
	const now = Date.now();
	const userId = await ctx.db.insert("users", {
		telegramChatId: args.telegramChatId,
		username: args.username,
		firstName: args.firstName,
		coins: 0,
		isBanned: false,
		createdAt: now,
		lastActiveAt: now,
	});

	await applyCoinDelta(ctx, {
		userId,
		delta: SIGNUP_BONUS,
		type: "signup_bonus",
	});

	return { userId, coins: SIGNUP_BONUS, isBanned: false };
}
