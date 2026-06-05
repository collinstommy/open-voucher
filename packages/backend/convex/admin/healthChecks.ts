import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { adminAction, verifyAdminSession } from "./auth";

type HealthCheckResult = {
	ocrTest: { success: boolean; message: string };
	voucherCount: { success: boolean; count: number; message: string };
	telegramToken: { success: boolean; message: string };
};

export const getAvailableVouchersCount = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("vouchers")
			.withIndex("by_status_created", (q) => q.eq("status", "available"))
			.collect();
	},
});

export const getHealthCheckData = internalQuery({
	args: { token: v.string() },
	handler: async (ctx, { token }) => {
		const session = await ctx.db
			.query("adminSessions")
			.withIndex("by_token", (q) => q.eq("token", token))
			.first();

		if (!session) {
			return { valid: false, error: "Invalid session" };
		}

		if (session.expiresAt < Date.now()) {
			return { valid: false, error: "Session expired" };
		}

		const now = Date.now();
		const vouchers = await ctx.db
			.query("vouchers")
			.withIndex("by_status_created", (q) => q.eq("status", "available"))
			.collect();

		const voucherCount = vouchers.filter(
			(v) => (v.expiryDate as number) > now,
		).length;

		return { valid: true, voucherCount };
	},
});

async function performHealthCheck(ctx: ActionCtx): Promise<HealthCheckResult> {
	const currentYear = new Date().getFullYear();
	const expectedExpiry = `${currentYear}-01-29`;

	const now = Date.now();
	const vouchers: { expiryDate: number }[] = await ctx.runQuery(
		internal.admin.healthChecks.getAvailableVouchersCount,
		{},
	);
	const voucherCount = vouchers.filter(
		(v: { expiryDate: number }) => v.expiryDate > now,
	).length;

	const setting = await ctx.runQuery(internal.settings.getSetting, {
		key: "test-voucher-image",
	});

	let ocrTest: { success: boolean; message: string };
	if (!setting) {
		ocrTest = {
			success: false,
			message: "No test voucher image configured",
		};
	} else {
		const ocrResult = await ctx.runAction(
			internal.ocr.extract.extractFromImage,
			{ imageStorageId: setting as Id<"_storage"> },
		);

		if (ocrResult.expiryDate === expectedExpiry) {
			ocrTest = {
				success: true,
				message: `Expiry date ${ocrResult.expiryDate} matches expected ${expectedExpiry}`,
			};
		} else {
			ocrTest = {
				success: false,
				message: `Expected expiry ${expectedExpiry}, got ${ocrResult.expiryDate ?? "null"}`,
			};
		}
	}

	const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
	let telegramTest: { success: boolean; message: string };
	if (!telegramToken) {
		telegramTest = {
			success: false,
			message: "TELEGRAM_BOT_TOKEN not configured",
		};
	} else {
		const response = await fetch(
			`https://api.telegram.org/bot${telegramToken}/getMe`,
		);
		if (response.ok) {
			telegramTest = {
				success: true,
				message: "Telegram token is valid",
			};
		} else {
			telegramTest = {
				success: false,
				message: `Telegram token invalid: ${response.status} ${response.statusText}`,
			};
		}
	}

	return {
		ocrTest,
		voucherCount: {
			success: voucherCount > 20,
			count: voucherCount,
			message:
				voucherCount > 20
					? `${voucherCount} available vouchers (threshold: 20)`
					: `${voucherCount} available vouchers, need > 20`,
		},
		telegramToken: telegramTest,
	};
}

export const runHealthCheck = adminAction({
	args: { token: v.string() },
	handler: async (ctx, { token }) => {
		await verifyAdminSession(ctx, token);
		return performHealthCheck(ctx);
	},
});

export const runHealthCheckInternal = internalAction({
	args: {},
	handler: async (ctx) => {
		return performHealthCheck(ctx);
	},
});

export const runOcrEvals = adminAction({
	args: {
		token: v.string(),
		images: v.array(
			v.object({
				filename: v.string(),
				imageBase64: v.string(),
			}),
		),
		useOpenRouter: v.optional(v.boolean()),
	},
	handler: async (
		ctx,
		{ token: _token, images, useOpenRouter },
	): Promise<{
		overallSuccess: boolean;
		passed: number;
		total: number;
		results: Array<{
			filename: string;
			testDate: string;
			success: boolean;
			expectedValidFrom: string | undefined;
			expectedExpiry: string;
			actualValidFrom?: string;
			actualExpiry?: string;
			error?: string;
		}>;
	}> => {
		return ctx.runAction(internal.ocr.evals.runOcrEvalsInternal, {
			images,
			useOpenRouter,
		});
	},
});

export const runSingleOcrEval = adminAction({
	args: {
		token: v.string(),
		filename: v.string(),
		imageBase64: v.string(),
		useOpenRouter: v.optional(v.boolean()),
	},
	handler: async (
		ctx,
		{ token: _token, filename, imageBase64, useOpenRouter },
	): Promise<{
		filename: string;
		results: Array<{
			filename: string;
			testDate: string;
			success: boolean;
			expectedValidFrom: string | undefined;
			expectedExpiry: string;
			actualValidFrom?: string;
			actualExpiry?: string;
			error?: string;
		}>;
	}> => {
		return ctx.runAction(internal.ocr.evals.runImageOcrEval, {
			filename,
			imageBase64,
			useOpenRouter,
		});
	},
});
