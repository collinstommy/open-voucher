# Self-Invalidate Uploaded Voucher

**Date:** 2026-05-25

## Summary

Add a `/app/my-uploads` screen to the Telegram Mini App where users can see their own uploaded vouchers that are still `"available"` in the pool, and self-invalidate ones they later used.

## Motivation

From analysis of 958 unknown inbound messages, ~20 users reported accidentally using vouchers they had uploaded to the pool. Currently the only way to handle this is via Telegram chat support. A self-service screen lets users fix their own mistakes.

## Backend Changes

### Schema (`packages/backend/convex/schema.ts`)

Add `v.literal("invalidated")` to the voucher `status` union:

```ts
status: v.union(
    v.literal("processing"),
    v.literal("available"),
    v.literal("claimed"),
    v.literal("reported"),
    v.literal("expired"),
    v.literal("uploader_admitted_used"),
    v.literal("uploader_denied"),
    v.literal("invalidated"),  // NEW
)
```

Add `v.literal("self_invalidated")` to the transactions `type` union:

```ts
type: v.union(
    "upload_reward",
    "claim_spend",
    "refund",
    "admin_expiry_deduction",
    "claim_reversed",
    "uploader_refund",
    "uploader_denied",
    "self_invalidated",  // NEW
)
```

### User Query (`packages/backend/convex/vouchers.ts`)

`getMyAvailableUploads` — returns the current user's vouchers with `status: "available"`:

- Decodes user from `sessionToken`
- Queries vouchers: `uploaderId = userId`, `status = "available"`, ordered by `createdAt` desc
- Returns: `_id`, `type`, `expiryDate`, `createdAt`, `imageUrl` (from storage)

### User Mutation (`packages/backend/convex/vouchers.ts`)

`invalidateMyUpload` — marks a voucher as invalidated and deducts coins:

- Decodes user from `sessionToken`
- Guards: voucher `status` must be `"available"`, `uploaderId` must be current user
- Sets voucher status to `"invalidated"`
- Deducts `UPLOAD_REWARDS[type]` coins from user (minimum `MIN_COINS`)
- Creates transaction with type `"self_invalidated"`

### Constants (`packages/backend/convex/constants.ts`)

No changes. Reuses `UPLOAD_REWARDS` and `MIN_COINS` for coin deduction.

## Frontend Changes

### New Route (`apps/web/src/routes/app/my-uploads.tsx`)

Route path: `/app/my-uploads`

**Data fetching:** TanStack Query wrapping manual Convex call to `api.vouchers.getMyAvailableUploads` with `sessionToken`.

**States:**
- `isPending` → "Loading..." text
- `error` → red error text
- `!data || data.length === 0` → "No vouchers in the pool right now"
- `data` → scrollable card grid

**Each voucher card:**
- Voucher image (full width, rounded top)
- Type badge (€5 / €10 / €20)
- Expiry date ("Expires Jun 8")
- Uploaded date ("Uploaded May 24")
- "I used this" button — full width, calls confirmation

**Confirmation (`window.confirm`):** "Mark this voucher as used? {UPLOAD_REWARDS[type]} coins will be deducted from your balance."

**Mutation:** Calls `api.vouchers.invalidateMyUpload` via `useMutation` → on success removes card from list, shows toast "Voucher marked as used."

**Layout:** Uses `AppHeader` (title: "My Uploads", back to `/app`) + scrollable body. Follows existing `/app` patterns (custom Tailwind, no shadcn/ui).

### Menu Config (`apps/web/src/components/mini-app/menuConfig.ts`)

Add new menu item linking to `/app/my-uploads`:
- Icon: `x-circle` or `rotate-ccw`
- Label: "My Uploads"
- Description: "Mark vouchers you've used"

### Edge Cases

- **Already claimed voucher:** Guard rejects with "This voucher has already been claimed."
- **Wrong user's voucher:** Guard rejects with "You can only invalidate your own vouchers."
- **Coins at minimum:** `MIN_COINS` acts as floor; deduction won't go below 0.
