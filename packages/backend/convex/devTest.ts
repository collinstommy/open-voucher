import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, query } from "./_generated/server";

// Dev-only test seam for local dev and E2E tests. Every public function is
// guarded on ENVIRONMENT === "development" (same pattern as dev-auth in
// http.ts) and does nothing on any other deployment. Keep this namespace
// minimal.

function assertDevOnly() {
	if (process.env.ENVIRONMENT !== "development") {
		throw new Error("devTest functions are only available in development");
	}
}

// Chat id used for the seed uploader so grown (real flow) users are never the
// uploader of a seeded voucher.
const SEED_UPLOADER_CHAT_ID = "e2e-seed-uploader";

// An action because only actions can write to storage; the DB insert happens
// in the internal mutation below.
export const seedVoucher = action({
	args: {
		// Raw bytes of a small test image (JPEG).
		bytes: v.array(v.number()),
		type: v.union(v.literal("5"), v.literal("10"), v.literal("20")),
		// Expiry as UTC ms (must be in the future for the voucher to be claimable).
		expiryDate: v.number(),
		validFrom: v.optional(v.number()),
		barcode: v.optional(v.string()),
	},
	handler: async (
		ctx,
		args,
	): Promise<{
		voucherId: Id<"vouchers">;
		uploaderId: Id<"users">;
		imageStorageId: Id<"_storage">;
	}> => {
		assertDevOnly();

		// Reuse the devSeed storage seam (base64 image in, storage id out).
		const { storageId } = await ctx.runAction(internal.devSeed.uploadSeedImage, {
			bytes: Buffer.from(new Uint8Array(args.bytes)).toString("base64"),
		});

		return await ctx.runMutation(internal.devTest.insertSeedVoucher, {
			imageStorageId: storageId,
			type: args.type,
			expiryDate: args.expiryDate,
			validFrom: args.validFrom,
			barcode: args.barcode,
		});
	},
});

export const insertSeedVoucher = internalMutation({
	args: {
		imageStorageId: v.id("_storage"),
		type: v.union(v.literal("5"), v.literal("10"), v.literal("20")),
		expiryDate: v.number(),
		validFrom: v.optional(v.number()),
		barcode: v.optional(v.string()),
	},
	handler: async (
		ctx,
		args,
	): Promise<{
		voucherId: Id<"vouchers">;
		uploaderId: Id<"users">;
		imageStorageId: Id<"_storage">;
	}> => {
		assertDevOnly();

		let uploader = await ctx.db
			.query("users")
			.withIndex("by_chat_id", (q) =>
				q.eq("telegramChatId", SEED_UPLOADER_CHAT_ID),
			)
			.first();
		if (!uploader) {
			const now = Date.now();
			const uploaderId = await ctx.db.insert("users", {
				telegramChatId: SEED_UPLOADER_CHAT_ID,
				firstName: "E2E Seed Uploader",
				coins: 0,
				isBanned: false,
				createdAt: now,
				lastActiveAt: now,
			});
			uploader = await ctx.db.get(uploaderId);
		}
		if (!uploader) {
			throw new Error("Failed to create seed uploader");
		}

		const barcode =
			args.barcode ?? `E2E-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

		const voucherId = await ctx.db.insert("vouchers", {
			type: args.type,
			status: "available",
			imageStorageId: args.imageStorageId,
			uploaderId: uploader._id,
			expiryDate: args.expiryDate,
			validFrom: args.validFrom,
			barcodeNumber: barcode,
			createdAt: Date.now(),
		});

		return {
			voucherId,
			uploaderId: uploader._id,
			imageStorageId: args.imageStorageId,
		};
	},
});

export const getUserByChatId = query({
	args: { telegramChatId: v.string() },
	handler: async (ctx, args) => {
		assertDevOnly();
		return await ctx.db
			.query("users")
			.withIndex("by_chat_id", (q) =>
				q.eq("telegramChatId", args.telegramChatId),
			)
			.first();
	},
});

export const getUser = query({
	args: { userId: v.id("users") },
	handler: async (ctx, args) => {
		assertDevOnly();
		return await ctx.db.get(args.userId);
	},
});

export const getVoucher = query({
	args: { voucherId: v.id("vouchers") },
	handler: async (ctx, args) => {
		assertDevOnly();
		return await ctx.db.get(args.voucherId);
	},
});

export const getVouchersByUploader = query({
	args: { uploaderId: v.id("users") },
	handler: async (ctx, args) => {
		assertDevOnly();
		return await ctx.db
			.query("vouchers")
			.withIndex("by_uploader", (q) => q.eq("uploaderId", args.uploaderId))
			.collect();
	},
});

export const getVouchersByClaimer = query({
	args: { claimerId: v.id("users") },
	handler: async (ctx, args) => {
		assertDevOnly();
		return await ctx.db
			.query("vouchers")
			.withIndex("by_claimer_claimed_at", (q) =>
				q.eq("claimerId", args.claimerId),
			)
			.collect();
	},
});

export const getStorageUrl = query({
	args: { storageId: v.id("_storage") },
	handler: async (ctx, args) => {
		assertDevOnly();
		return await ctx.storage.getUrl(args.storageId);
	},
});
