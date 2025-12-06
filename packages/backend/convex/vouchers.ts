import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { UPLOAD_REWARDS, MAX_COINS } from "./constants";

import { MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import dayjs from "dayjs";

// Shared helper to mark voucher as failed/rejected
async function failVoucherHelper(
    ctx: MutationCtx, 
    voucherId: Id<"vouchers">, 
    error: string, 
    reason: "EXPIRED" | "COULD_NOT_READ_AMOUNT" | "COULD_NOT_READ_BARCODE" | "COULD_NOT_READ_EXPIRY_DATE" | "INVALID_TYPE" | "UNKNOWN_ERROR",
    detectedExpiryDate?: number
) {
    const voucher = await ctx.db.get(voucherId);
    if(voucher) {
        // If we have a specific expiry date detected (even if expired), update the record
        // This ensures the DB reflects the reality of what was scanned
        if (detectedExpiryDate !== undefined) {
             await ctx.db.patch(voucherId, { expiryDate: detectedExpiryDate });
        }

        await ctx.db.patch(voucherId, {
            status: "expired", 
            ocrRawResponse: JSON.stringify({ error, reason }),
        });

        const uploader = await ctx.db.get(voucher.uploaderId);
        if (uploader) {
             let userMessage = `❌ <b>Voucher Processing Failed</b>\n\n`;
             if (reason === "COULD_NOT_READ_AMOUNT") {
                 userMessage += `We couldn't determine the voucher amount (e.g., €5, €10, €20). Please make sure the value is clear in the photo.`;
             } else if (reason === "COULD_NOT_READ_EXPIRY_DATE") {
                 userMessage += `We couldn't determine the expiry date. Please make sure it's clear in the photo.`;
             } else if (reason === "COULD_NOT_READ_BARCODE") {
                 userMessage += `We couldn't read the barcode. Please ensure it's fully visible and clear.`;
             } else if (reason === "EXPIRED") {
                 // Use detected date if available, otherwise DB date (which might be 0/1970 if not set)
                 const dateToUse = detectedExpiryDate !== undefined ? detectedExpiryDate : voucher.expiryDate;
                 userMessage += `This voucher expired on ${dayjs(dateToUse).format('DD-MM-YYYY')}.`;
             } else if (reason === "INVALID_TYPE") {
                 userMessage += `This voucher does not appear to be a valid €5, €10, or €20 Dunnes voucher. We only accept these specific general spend vouchers.`;
             } else {
                 userMessage += `We encountered an unknown error while processing your voucher. Please try again or contact support.`;
             }
             userMessage += `\n\nError details: ${error}`;

             await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
               chatId: uploader.telegramChatId,
               text: userMessage
           });
        }
    }
}

/**
 * Upload a new voucher image.
 * Creates voucher in "processing" status and triggers OCR.
 * Internal mutation - only called from actions.
 */
export const uploadVoucher = internalMutation({
  args: {
    userId: v.id("users"),
    imageStorageId: v.id("_storage"),
  },
  handler: async (ctx, { userId, imageStorageId }) => {
    // Check user exists and is not banned
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (user.isBanned) {
      throw new Error("You have been banned from this service");
    }

    // Create voucher in processing status
    // Type defaults to "0" and will be updated by OCR
    // ExpiryDate defaults to 0 and will be updated by OCR
    const now = Date.now();
    const voucherId = await ctx.db.insert("vouchers", {
      type: "0",
      status: "processing",
      imageStorageId,
      uploaderId: userId,
      expiryDate: 0,
      createdAt: now,
    });

    // Schedule OCR processing (runs immediately)
    await ctx.scheduler.runAfter(0, internal.ocr.processVoucherImage, {
      voucherId,
      imageStorageId,
    });

    return voucherId;
  },
});

/**
 * Update voucher with OCR results.
 * Called internally by the OCR action after processing.
 * Awards coins to uploader.
 */
export const updateVoucherFromOcr = internalMutation({
  args: {
    voucherId: v.id("vouchers"),
    type: v.union(v.literal("5"), v.literal("10"), v.literal("20")),
    expiryDate: v.number(),
    barcodeNumber: v.optional(v.string()),
    ocrRawResponse: v.string(),
  },
  handler: async (ctx, { voucherId, type, expiryDate, barcodeNumber, ocrRawResponse }) => {
    // Get voucher
    const voucher = await ctx.db.get(voucherId);
    if (!voucher) {
      throw new Error("Voucher not found");
    }

    const uploader = await ctx.db.get(voucher.uploaderId);
    if (!uploader) {
       // Should not happen, but safe check
       return;
    }

    const now = Date.now();

    // Check for duplicates
    if (barcodeNumber) {
        const duplicate = await ctx.db
            .query("vouchers")
            .withIndex("by_barcode", (q) => q.eq("barcodeNumber", barcodeNumber))
            .first();

        if (duplicate && duplicate._id !== voucherId) {
             await ctx.db.patch(voucherId, {
                type,
                expiryDate,
                barcodeNumber,
                ocrRawResponse,
                status: "expired", // Rejected as duplicate
            });

            await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
                chatId: uploader.telegramChatId,
                text: `⚠️ <b>Duplicate Voucher</b>\n\nThis voucher (barcode ending in ${barcodeNumber.slice(-4)}) has already been uploaded by someone else.`
            });
            return;
        }
    }

    // Check if voucher is already expired
    // We assume expiryDate is set to the END of the valid day
    const isExpired = expiryDate < now;
    
    if (isExpired) {
         await failVoucherHelper(
            ctx, 
            voucherId, 
            `Voucher expired on ${dayjs(expiryDate).format('DD-MM-YYYY')}`, 
            "EXPIRED",
            expiryDate
        );
        return;
    }

    const status = "available";

    // Update voucher with OCR data
    await ctx.db.patch(voucherId, {
      type,
      expiryDate,
      barcodeNumber,
      ocrRawResponse,
      status,
    });

    // Award coins to uploader (only if not expired)
    if (status === "available") {
        const reward = UPLOAD_REWARDS[type];
        const newCoins = Math.min(MAX_COINS, uploader.coins + reward);
        await ctx.db.patch(voucher.uploaderId, { coins: newCoins });

        // Record transaction
        await ctx.db.insert("transactions", {
          userId: voucher.uploaderId,
          type: "upload_reward",
          amount: reward,
          voucherId,
          createdAt: now,
        });

        // Notify user
        await ctx.scheduler.runAfter(0, internal.telegram.sendMessageAction, {
           chatId: uploader.telegramChatId,
           text: `✅ <b>Voucher Accepted!</b>\n\nThanks for sharing a €${type} voucher.\nCoins earned: +${reward}\nNew balance: ${newCoins}`
       });
    }
  },
});

/**
 * Mark a voucher as failed OCR processing.
 * Called internally when OCR fails.
 */
export const markVoucherOcrFailed = internalMutation({
  args: {
    voucherId: v.id("vouchers"),
    error: v.string(),
    reason: v.union(
        v.literal("EXPIRED"),
        v.literal("COULD_NOT_READ_AMOUNT"),
        v.literal("COULD_NOT_READ_BARCODE"),
        v.literal("COULD_NOT_READ_EXPIRY_DATE"),
        v.literal("INVALID_TYPE"),
        v.literal("UNKNOWN_ERROR")
    ),
    expiryDate: v.optional(v.number()),
  },
  handler: async (ctx, { voucherId, error, reason, expiryDate }) => {
    await failVoucherHelper(ctx, voucherId, error, reason, expiryDate);
  },
});
