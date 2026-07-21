import type { QueryCtx } from "../../convex/_generated/server";

export async function lookupSessionByToken(
	ctx: { db: QueryCtx["db"] },
	token: string,
) {
	return await ctx.db
		.query("adminSessions")
		.withIndex("by_token", (q) => q.eq("token", token))
		.first();
}

export async function verifyAdminSession(
	ctx: { db: QueryCtx["db"] },
	token: string,
): Promise<void> {
	const session = await lookupSessionByToken(ctx, token);

	if (!session) {
		throw new Error("Unauthorized: Invalid session token");
	}

	if (session.expiresAt < Date.now()) {
		throw new Error("Unauthorized: Session expired");
	}
}

export function assertValidSession(
	session: { expiresAt: number } | null,
): asserts session is { expiresAt: number } {
	if (!session) {
		throw new Error("Unauthorized: Invalid session token");
	}

	if (session.expiresAt < Date.now()) {
		throw new Error("Unauthorized: Session expired");
	}
}
