import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { assertValidSession } from "../src/lib/adminAuth";
import { adminQuery } from "./adminGuards";
import {
	ensureDunnesTokens,
	labelFromLink,
	linkVoucher,
	storedLinkResult,
	loginWithPassword,
	refreshAccessToken,
	type DunnesHttpResult,
	type DunnesTokens,
} from "../src/dunnes/account";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery } from "./_generated/server";

type DetailsResult = {
	outcome: "not-configured" | "no-barcode" | "checked" | "error";
	label: string;
	response: unknown;
};

export const getBarcode = internalQuery({
	args: { voucherId: v.id("vouchers") },
	handler: async (ctx, { voucherId }) => {
		const voucher = await ctx.db.get(voucherId);
		if (!voucher) return null;
		return {
			barcodeNumber: voucher.barcodeNumber ?? null,
			uploaderId: voucher.uploaderId,
		};
	},
});

export const saveCheck = internalMutation({
	args: {
		voucherId: v.id("vouchers"),
		userId: v.id("users"),
		result: v.union(
			v.literal("claimed"),
			v.literal("redeemed"),
			v.literal("unlinked"),
			v.literal("other"),
		),
		rawJson: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.db.insert("voucherChecks", {
			voucherId: args.voucherId,
			userId: args.userId,
			result: args.result,
			rawJson: args.rawJson,
			createdAt: Date.now(),
		});
	},
});

export const getSession = internalQuery({
	args: { username: v.string() },
	handler: async (ctx, { username }) => {
		const session = await ctx.db
			.query("dunnesSessions")
			.withIndex("by_username", (q) => q.eq("username", username))
			.first();
		if (!session) return null;
		return {
			accessToken: session.accessToken,
			expiresAtMs: session.expiresAtMs,
			...(session.refreshToken !== undefined
				? { refreshToken: session.refreshToken }
				: {}),
		};
	},
});

export const saveSession = internalMutation({
	args: {
		username: v.string(),
		accessToken: v.string(),
		refreshToken: v.optional(v.string()),
		expiresAtMs: v.number(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("dunnesSessions")
			.withIndex("by_username", (q) => q.eq("username", args.username))
			.take(8);
		const [first, ...rest] = existing;
		const patch: {
			username: string;
			accessToken: string;
			expiresAtMs: number;
			refreshToken?: string;
		} = {
			username: args.username,
			accessToken: args.accessToken,
			expiresAtMs: args.expiresAtMs,
		};
		if (args.refreshToken !== undefined) patch.refreshToken = args.refreshToken;
		if (first) {
			await ctx.db.patch(first._id, patch);
		} else {
			await ctx.db.insert("dunnesSessions", patch);
		}
		for (const extra of rest) {
			await ctx.db.delete(extra._id);
		}
	},
});

function logDetails(payload: {
	voucherId: string;
	label: string;
	response: unknown;
}) {
	console.log(JSON.stringify(payload));
}

async function authorizedLink(
	username: string,
	password: string,
	voucherNumber: string,
	stored: {
		accessToken: string;
		refreshToken?: string;
		expiresAtMs: number;
	} | null,
): Promise<{ tokens: DunnesTokens; responses: DunnesHttpResult[] }> {
	const tokens = await ensureDunnesTokens({
		stored,
		username,
		password,
		nowMs: Date.now(),
		login: loginWithPassword,
		refresh: refreshAccessToken,
	});
	const responses = [await linkVoucher(tokens.accessToken, voucherNumber)];
	const first = responses[0];
	if (first === undefined || first.status !== 401) return { tokens, responses };
	const retried = await ensureDunnesTokens({
		stored: {
			accessToken: tokens.accessToken,
			refreshToken: tokens.refreshToken,
			expiresAtMs: 0,
		},
		username,
		password,
		nowMs: Date.now(),
		login: loginWithPassword,
		refresh: refreshAccessToken,
	});
	responses.push(await linkVoucher(retried.accessToken, voucherNumber));
	return { tokens: retried, responses };
}

export const getVoucherDetails = action({
	args: {
		token: v.string(),
		voucherId: v.id("vouchers"),
	},
	handler: async (ctx, { token, voucherId }): Promise<DetailsResult> => {
		const session = await ctx.runQuery(
			internal.adminSession.getSessionByToken,
			{
				token,
			},
		);
		assertValidSession(session);

		const username = process.env.DUNNES_USERNAME;
		const password = process.env.DUNNES_PASSWORD;
		if (!username || !password) {
			const result = {
				outcome: "not-configured" as const,
				label: "Dunnes login is not configured.",
				response: null,
			};
			logDetails({ voucherId, ...result });
			return result;
		}

		const voucher: {
			barcodeNumber: string | null;
			uploaderId: Id<"users">;
		} | null = await ctx.runQuery(internal.dunnesVoucherDetails.getBarcode, {
			voucherId,
		});
		if (!voucher) {
			throw new Error("Voucher not found");
		}
		if (!voucher.barcodeNumber) {
			const result = {
				outcome: "no-barcode" as const,
				label: "No barcode on this voucher.",
				response: null,
			};
			logDetails({ voucherId, ...result });
			return result;
		}

		try {
			const stored = await ctx.runQuery(
				internal.dunnesVoucherDetails.getSession,
				{
					username,
				},
			);
			const { tokens, responses } = await authorizedLink(
				username,
				password,
				voucher.barcodeNumber,
				stored,
			);
			await ctx.runMutation(internal.dunnesVoucherDetails.saveSession, {
				username: tokens.username,
				accessToken: tokens.accessToken,
				expiresAtMs: tokens.expiresAtMs,
				...(tokens.refreshToken !== undefined
					? { refreshToken: tokens.refreshToken }
					: {}),
			});
			const response = responses[responses.length - 1] ?? null;
			if (response !== null) {
				await ctx.runMutation(internal.dunnesVoucherDetails.saveCheck, {
					voucherId,
					userId: voucher.uploaderId,
					result: storedLinkResult(response),
					rawJson: JSON.stringify(responses),
				});
			}
			const result: DetailsResult = {
				outcome: "checked",
				label:
					response === null
						? "LinkVoucher returned nothing."
						: labelFromLink(response),
				response,
			};
			logDetails({ voucherId, label: result.label, response });
			return result;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Dunnes request failed";
			const result = {
				outcome: "error" as const,
				label: message,
				response: null,
			};
			logDetails({ voucherId, ...result });
			return result;
		}
	},
});

export const listVoucherChecks = adminQuery({
	args: { paginationOpts: paginationOptsValidator },
	handler: async (ctx, { paginationOpts }) => {
		const results = await ctx.db
			.query("voucherChecks")
			.order("desc")
			.paginate(paginationOpts);

		const page = await Promise.all(
			results.page.map(async (check) => {
				const voucher = await ctx.db.get(check.voucherId);
				const user = await ctx.db.get(check.userId);
				return {
					_id: check._id,
					createdAt: check.createdAt,
					result: check.result,
					rawJson: check.rawJson,
					voucherId: check.voucherId,
					userId: check.userId,
					userFirstName: user?.firstName ?? null,
					voucherType: voucher?.type ?? null,
					voucherStatus: voucher?.status ?? null,
					barcodeNumber: voucher?.barcodeNumber ?? null,
					imageUrl: voucher
						? await ctx.storage.getUrl(voucher.imageStorageId)
						: null,
				};
			}),
		);

		return {
			page,
			isDone: results.isDone,
			continueCursor: results.continueCursor,
		};
	},
});
