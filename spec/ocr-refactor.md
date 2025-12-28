# OCR Module Refactoring Plan

## Overview

Refactor [ocr.ts](packages/backend/convex/ocr.ts) to separate concerns and ensure voucher records are only created for valid vouchers.

## Problems Being Fixed

1. ❌ Voucher records created even for invalid/expired/duplicate vouchers
2. ❌ Upload limit counts ALL uploads (including invalid ones)
3. ❌ OCR module handles too many responsibilities (extraction, validation, DB operations)
4. ❌ Error handling creates DB records via `markVoucherOcrFailed`

## New Architecture

**Current Flow:**
```
Upload → Create voucher (processing) → OCR → Update/Fail voucher
```

**New Flow:**
```
Upload → Store image → OCR → Validate → Create voucher (only if valid)
```

**Key Changes:**
- Only valid vouchers get DB records
- Upload count only increments for valid uploads
- OCR split into separate functions (extract → validate → create)
- Invalid uploads logged but no DB record created

## Implementation Steps

### Step 1: Add Helper Functions to [ocr.ts](packages/backend/convex/ocr.ts)

**1.1 Extract `extractVoucherData()` function**
- Extract lines 38-133 (Gemini API call logic)
- Pure function: takes imageUrl and API key, returns extracted data
- Returns: `{type, expiryDate, validFrom, barcodeNumber, rawResponse}`

**1.2 Extract `validateVoucherData()` function**
- Extract lines 138-221 (validation logic)
- Pure function: validates type, dates, expiry
- Returns: `{valid: boolean, reason?: string, expiryDate?: number}`

### Step 2: Create New Mutations in [vouchers.ts](packages/backend/convex/vouchers.ts)

**2.1 Add `createValidatedVoucher` mutation**
- Creates voucher record with status="available" (NOT "processing")
- Checks upload limit BEFORE creating (only count valid uploads: status = available/claimed/reported)
- Increments uploadCount
- Awards coins based on type (€5=15, €10=10, €20=5)
- Records transaction
- Sends success notification
- Called ONLY after full validation passes

**2.2 Add `logFailedOcrAttempt` mutation**
- Simple console.error with structured data
- Logs: userId, storageId, reason, error, timestamp
- No DB record created

### Step 3: Refactor Main OCR Action in [ocr.ts](packages/backend/convex/ocr.ts)

**3.1 Rewrite `processVoucherImage` action**
- Remove `voucherId` arg (no voucher exists yet)
- Add `userId` arg instead
- Rename to `processVoucherOcr` (optional, clearer name)
- Flow:
  1. Get image URL from storage
  2. Call `extractVoucherData()` helper
  3. Call `validateVoucherData()` helper
  4. Check duplicate via `getVoucherByBarcode` query
  5. If all valid: call `createValidatedVoucher` mutation
  6. If invalid: call `logFailedOcrAttempt` and send user notification

### Step 4: Update Upload Handler in [telegram.ts](packages/backend/convex/telegram.ts)

**4.1 Modify `handleTelegramMessage` action (lines 147-182)**
- Remove call to `uploadVoucher` mutation
- Directly schedule `processVoucherOcr` action with userId and imageStorageId
- Change:
  ```typescript
  // OLD:
  const voucherId = await ctx.runMutation(internal.vouchers.uploadVoucher, {...});

  // NEW:
  await ctx.scheduler.runAfter(0, internal.ocr.processVoucherOcr, {
    userId: user._id,
    imageStorageId: storageId
  });
  ```

### Step 5: Remove Obsolete Code from [vouchers.ts](packages/backend/convex/vouchers.ts)

**5.1 Delete these functions:**
- `uploadVoucher` mutation (lines 90-146) - No longer needed
- `updateVoucherFromOcr` mutation (lines 274-345) - Replaced by createValidatedVoucher
- `markVoucherOcrFailed` mutation (lines 351-370) - Replaced by logFailedOcrAttempt
- `failVoucherHelper` function (lines 21-83) - No longer needed

**5.2 Extract notification helper**
- Extract failure notification logic from `failVoucherHelper` (lines 51-81)
- Create standalone helper for sending notifications
- Call from OCR action on failure

### Step 6: Update Upload Limit Logic

**6.1 Modify upload count query**
- In `createValidatedVoucher`: only count vouchers with valid status
- Filter to include ONLY: status = "available" OR "claimed" OR "reported"
- Exclude: "processing" (won't exist anymore) and "expired" (failed uploads)

## Critical Files

- [packages/backend/convex/ocr.ts](packages/backend/convex/ocr.ts) - Extract helpers, refactor main action
- [packages/backend/convex/vouchers.ts](packages/backend/convex/vouchers.ts) - Add createValidatedVoucher, remove obsolete mutations
- [packages/backend/convex/telegram.ts](packages/backend/convex/telegram.ts) - Update upload flow (lines 147-182)

## Success Criteria

After refactoring:
- ✅ Valid vouchers create DB records with status="available"
- ✅ Invalid vouchers do NOT create DB records
- ✅ Upload count only increments for valid vouchers
- ✅ Rewards only given for valid vouchers
- ✅ Images kept in storage for all uploads (debugging)
- ✅ Failed uploads logged with storage ID
- ✅ Upload limit (10/24h) only counts valid vouchers
- ✅ Separated concerns: extract → validate → create

## Testing Checklist

1. Valid €5/€10/€20 voucher → creates record, increments count, awards coins
2. Expired voucher → no record, no count increment, no coins, notification sent
3. Invalid type (€1 off) → no record, failure notification
4. Duplicate barcode → second upload fails, no duplicate record
5. Upload 10 valid + 1 invalid + 1 valid → 11th valid rejected (limit), invalid doesn't count
6. Unreadable image → no record, error logged with storage ID
