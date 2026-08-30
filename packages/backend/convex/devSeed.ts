import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";

const DAY_MS = 86_400_000;

// Seeds write arbitrary voucher rows and reset-free test users, so they must
// never run on a production deployment (mirrors clearUserData's guard).
function requireDevelopment(): void {
	if (process.env.ENVIRONMENT !== "development") {
		throw new Error(
			"devSeed is only available in development. This operation is blocked in production.",
		);
	}
}

// Voucher date conventions follow storeVoucherFromOcr: expiry at 22:59 UTC on
// the target day, validFrom at midnight UTC.
function dayAtUtc(daysFromNow: number, hours: number, minutes: number): number {
	const day = new Date(Date.now() + daysFromNow * DAY_MS);
	return Date.UTC(
		day.getUTCFullYear(),
		day.getUTCMonth(),
		day.getUTCDate(),
		hours,
		minutes,
		0,
		0,
	);
}

// Days between validFrom and expiry when the spec doesn't say otherwise.
const DEFAULT_VALID_FROM_DAYS_BEFORE_EXPIRY = 9;

// Storage writes (ctx.storage.store) are action-only in Convex; mutations
// cannot upload blobs, so this runs as an internalAction.
export const uploadSeedImage = internalAction({
	args: {
		bytes: v.string(), // base64-encoded PNG
	},
	handler: async (ctx, { bytes }) => {
		requireDevelopment();

		const binary = atob(bytes);
		const png = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			png[i] = binary.charCodeAt(i);
		}
		const storageId = await ctx.storage.store(
			new Blob([png], { type: "image/png" }),
		);
		return { storageId };
	},
});

const seedVoucherSpec = v.object({
	type: v.union(v.literal("5"), v.literal("10"), v.literal("20")),
	status: v.union(
		v.literal("available"),
		v.literal("claimed"),
		v.literal("expired"),
		v.literal("invalidated"),
	),
	barcode: v.string(),
	expiryDaysFromNow: v.number(),
	createdDaysAgo: v.number(),
	validFromDaysBeforeExpiry: v.optional(v.number()),
	imageStorageId: v.id("_storage"),
});

export const seedDevVouchers = internalMutation({
	args: {
		chatId: v.optional(v.string()),
		vouchers: v.array(seedVoucherSpec),
	},
	handler: async (ctx, { chatId, vouchers }) => {
		requireDevelopment();

		const telegramChatId = chatId ?? process.env.DEV_TELEGRAM_CHAT_ID;
		if (!telegramChatId) {
			throw new Error(
				"No chat id: pass chatId or set DEV_TELEGRAM_CHAT_ID on the deployment.",
			);
		}

		const existingUser = await ctx.db
			.query("users")
			.withIndex("by_chat_id", (q) => q.eq("telegramChatId", telegramChatId))
			.first();

		// Find-or-create only: no coins, no signup bonus, no counters.
		const userId = existingUser
			? existingUser._id
			: await ctx.db.insert("users", {
					telegramChatId,
					coins: 0,
					isBanned: false,
					createdAt: Date.now(),
					lastActiveAt: Date.now(),
				});

		// Seed rows live under a fixed list of known numeric barcodes shared
		// with scripts/seed-dev.ts: duplicates are skipped here and
		// clearSeedVouchers only deletes explicitly listed barcodes, so
		// neither path can touch a real user's voucher.
		const inserted: Array<{
			barcode: string;
			status: string;
			type: string;
		}> = [];
		const skipped: string[] = [];

		for (const spec of vouchers) {
			const duplicate = await ctx.db
				.query("vouchers")
				.withIndex("by_barcode", (q) => q.eq("barcodeNumber", spec.barcode))
				.first();
			if (duplicate) {
				skipped.push(spec.barcode);
				continue;
			}

			const now = Date.now();
			const claimed = spec.status === "claimed";
			const validFromDays =
				spec.validFromDaysBeforeExpiry ?? DEFAULT_VALID_FROM_DAYS_BEFORE_EXPIRY;
			await ctx.db.insert("vouchers", {
				type: spec.type,
				status: spec.status,
				imageStorageId: spec.imageStorageId,
				barcodeNumber: spec.barcode,
				expiryDate: dayAtUtc(spec.expiryDaysFromNow, 22, 59),
				validFrom: dayAtUtc(spec.expiryDaysFromNow - validFromDays, 0, 0),
				uploaderId: userId,
				claimerId: claimed ? userId : undefined,
				claimedAt: claimed ? now - DAY_MS : undefined,
				createdAt: now - spec.createdDaysAgo * DAY_MS,
			});
			inserted.push({
				barcode: spec.barcode,
				status: spec.status,
				type: spec.type,
			});
		}

		return { userId, chatId: telegramChatId, inserted, skipped };
	},
});

export const clearSeedVouchers = internalMutation({
	args: {
		barcodes: v.array(v.string()),
	},
	handler: async (ctx, { barcodes }) => {
		requireDevelopment();

		// Only the explicitly listed barcodes are touched; there is no prefix
		// or pattern scan, so a real user's voucher can never be deleted.
		const deleted: string[] = [];
		const missing: string[] = [];
		for (const barcode of barcodes) {
			const voucher = await ctx.db
				.query("vouchers")
				.withIndex("by_barcode", (q) => q.eq("barcodeNumber", barcode))
				.first();
			if (!voucher) {
				missing.push(barcode);
				continue;
			}
			await ctx.storage.delete(voucher.imageStorageId);
			await ctx.db.delete(voucher._id);
			deleted.push(barcode);
		}
		return { deleted, missing };
	},
});
