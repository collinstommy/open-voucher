# Web Frontend Specification

## Overview
Building a user-facing web frontend for the voucher app, integrated into the existing TanStack Start application.

## Goals
- Allow users to authenticate via Telegram Login Widget
- Share identity with existing Telegram bot users (same coins, history, etc.)
- Provide mobile-first interface for upload, claim, and report functionality
- Integrate landing page into the main app

## Decision Log

The following questions were discussed and answered during the scoping phase:

### 1. Authentication Methods
**Question:** Should we support Google OAuth and/or Telegram auth? Which should we prioritize?

**Answer:** Start with Telegram auth only. The existing user base is already using Telegram, and the Telegram Login Widget provides a seamless web-to-bot experience. Google OAuth can be added later if needed.

**Rationale:**
- Existing users already have Telegram accounts linked to the bot
- Telegram Login Widget provides same identity across platforms
- Simpler initial implementation
- Can add Google later without breaking changes

---

### 2. User Identity & Data Sharing
**Question:** Should web users be the same as Telegram users (shared coins/balance), or separate? If shared, how do we link them?

**Answer:** Yes, same identity. Web users and Telegram bot users share the same database record. When a user logs in via web, we look up their existing record by `telegramChatId` and link to it.

**Implementation:**
- Use Convex Auth with custom `ConvexCredentials` provider
- Verify Telegram Login Widget hash using bot token
- Look up user by `telegramChatId` in `authorize()` function
- Return existing user ID if found, otherwise create new user
- All data (coins, upload count, claim count, transaction history) is shared

**Rationale:**
- Users expect their balance to be the same across platforms
- Simpler mental model: one account, multiple access methods
- Existing rate limits apply to combined usage

---

### 3. Voucher Display Format
**Question:** When a user claims a voucher, do they see just the barcode number, the actual voucher image, or both?

**Answer:** Full voucher image display (same as Telegram bot).

**Implementation:**
- Show full voucher image from storage
- Display expiration date prominently
- Include report button for non-working vouchers
- Optimized for mobile viewing

**Rationale:**
- Consistent with Telegram bot experience
- Users need the barcode to scan at checkout
- Visual confirmation of voucher value and expiration

---

### 4. Upload Processing
**Question:** Should web uploads work the same as Telegram (OCR processing), or do you want manual barcode entry as a fallback?

**Answer:** OCR processing only, same as Telegram.

**Implementation:**
- Image upload triggers same OCR pipeline
- No manual barcode entry (would complicate the UI)
- Users get feedback on upload success/failure

**Rationale:**
- Maintains consistency with Telegram bot
- Reduces user error (typos in manual entry)
- Leverages existing OCR infrastructure

---

### 5. Device Support
**Question:** Is this primarily mobile-first? Do we need desktop support?

**Answer:** Mobile-first only. No desktop support needed.

**Implementation:**
- Optimize for camera access (voucher photos)
- Touch-friendly UI components
- Responsive layout that works on all mobile sizes
- No desktop-specific features or layouts

**Rationale:**
- Users will primarily access this on phones
- Camera access is critical for upload feature
- Simpler development (one form factor)
- Can add desktop support later if analytics show demand

---

### 6. Landing Page Architecture
**Question:** Should the landing page be at root `/` and require auth to access `/dashboard`, or should `/` redirect to dashboard if logged in? What is the common pattern?

**Answer:** Keep `/` as landing page (marketing), authenticated users go to `/app/dashboard`.

**Route Structure:**
```
/              → Landing page (marketing content)
/login         → Telegram Login Widget (redirects to /app if already logged in)
/app/*         → Protected app routes (requires auth)
```

**Common Pattern Used:**
- **SaaS Landing Pages:** Most modern apps (Linear, Vercel, Stripe) keep marketing page at root
- **SEO Benefits:** Landing page content is indexable
- **Shareability:** Users can share the site without exposing app
- **Clear Separation:** Marketing content separate from app functionality

**Alternative Considered:**
- Redirect `/` to `/app` if logged in
- **Rejected:** Would prevent logged-in users from seeing landing page updates, sharing landing page links, and could hurt SEO

---

### 7. Database Schema Strategy
**Question:** Can Convex Auth use a different table name? Can they share the same table? Do we need something custom?

**Answer:** Share the same `users` table by extending it with Convex Auth fields.

**Approach:**
1. Add Convex Auth required fields to existing `users` table (all optional for migration)
2. Use `createOrUpdateUser` callback to control user creation/linking
3. Look up existing users by `telegramChatId` during auth
4. Return existing user ID to link identities

**Schema Strategy:**
```typescript
// Existing fields remain
users: defineTable({
  telegramChatId: v.optional(v.string()),  // Was required, now optional
  username: v.optional(v.string()),
  firstName: v.optional(v.string()),
  coins: v.number(),
  // ... existing fields
  
  // New Convex Auth fields (all optional)
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  email: v.optional(v.string()),
  emailVerificationTime: v.optional(v.number()),
  phone: v.optional(v.string()),
  phoneVerificationTime: v.optional(v.number()),
  isAnonymous: v.optional(v.boolean()),
})
```

**Rationale:**
- Single source of truth for user data
- No data duplication or sync issues
- Backward compatible with existing users
- Works with Convex Auth's session system

---

### 8. Backend Architecture Pattern
**Question:** Can we create a custom query helper like `adminQuery` that handles auth? What should we call it?

**Answer:** Yes, create `webUserQuery` and `webUserMutation` helpers following the existing `adminQuery` pattern.

**Pattern:**
```typescript
export const webUserQuery = customQuery(query, {
  args: {},
  input: async (ctx) => {
    const userId = await ctx.auth.getUserIdentity();
    if (!userId) throw new Error("Not authenticated");
    
    const user = await ctx.db.get(userId.subject as Id<"users">);
    if (!user || user.isBanned) throw new Error("Unauthorized");
    
    return { ctx: { user }, args: {} };
  },
});
```

**Benefits:**
- Consistent with existing codebase patterns
- Automatic auth validation
- Pre-loaded user object in context
- Banned user checking

---

### 9. Session Duration
**Question:** How long should web sessions last?

**Answer:** Forever (long-lived sessions).

**Implementation:**
- Convex Auth sessions don't expire by default
- JWT tokens are valid indefinitely
- Matches Telegram bot behavior (users stay logged in)

**Rationale:**
- Matches Telegram bot experience
- Reduces friction (no frequent re-auth)
- Can implement manual logout
- Can add forced re-auth for sensitive operations later

---

### 10. Web Interface Structure
**Question:** Should web interface go in `convex/web.ts` (single file) or `convex/web/` directory (multiple files)?

**Answer:** Start with `convex/web.ts` (single file), refactor to directory if it grows large.

**Structure:**
```
convex/
  web.ts           # All web-facing mutations/queries
  auth.ts          # Auth helpers (webUserQuery, webUserMutation)
  telegram.ts      # Existing (unchanged)
  vouchers.ts      # Existing (unchanged)
  users.ts         # Existing (unchanged)
  schema.ts        # Extended with auth fields
```

**Rationale:**
- Simple to start with single file
- Easy to refactor later if needed
- Web interface is mostly thin wrappers around internal functions
- Keeps related code together initially

---

### 11. File Upload Flow
**Question:** How does the upload flow work from web?

**Answer:** Same flow as Telegram bot:
1. User selects/takes photo on mobile
2. Frontend uploads to Convex storage (gets `storageId`)
3. Frontend calls `web.uploadVoucher(storageId)`
4. Backend triggers OCR processing (same as Telegram)
5. OCR extracts voucher details
6. Voucher created in database
7. User credited with coins

**Implementation:**
```typescript
// Frontend
const storageId = await convex.mutation(api.storage.store, { blob: imageBlob });
await convex.mutation(api.web.uploadVoucher, { imageStorageId: storageId });

// Backend (convex/web.ts)
export const uploadVoucher = webUserMutation({
  args: { imageStorageId: v.id("_storage") },
  handler: async (ctx, { imageStorageId }) => {
    // Reuse existing internal logic
    await ctx.runMutation(internal.vouchers.uploadVoucher, {
      userId: ctx.user._id,
      imageStorageId,
    });
  },
});
```

**Rationale:**
- Consistent with Telegram bot experience
- Reuses existing OCR pipeline
- No code duplication

---

### 12. Rate Limiting
**Question:** Do web uploads/claims/reports count toward the same rate limits as Telegram?

**Answer:** Yes, combined limits across both platforms.

**Limits:**
- 10 uploads per 24 hours (combined Telegram + web)
- 5 claims per 24 hours (combined Telegram + web)
- 1 report per day (combined Telegram + web)

**Implementation:**
- Rate limiting logic is in `internal.vouchers.uploadVoucher` and `internal.vouchers.requestVoucher`
- Web interface calls these same internal functions
- Limits are enforced at the database query level (checking userId + time range)
- No separate web-only limits

**Rationale:**
- Prevents abuse (can't bypass limits by switching platforms)
- Fair to all users
- Simpler implementation (no separate tracking needed)

---

### 13. Session Storage
**Question:** Should we use Convex Auth's built-in sessions or implement custom session storage?

**Answer:** Use Convex Auth's built-in sessions.

**Implementation:**
- Convex Auth automatically creates `authSessions` table
- Sessions are managed by the library
- JWT tokens stored in browser (httpOnly cookies)
- No custom session storage needed

**Rationale:**
- Less code to maintain
- Secure by default
- Works with Convex React client automatically
- Handles token refresh and expiration

---

### Summary of Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth Method | Telegram only | Existing user base, seamless experience |
| User Identity | Shared | One account, multiple access methods |
| Voucher Display | Full image | Consistent with Telegram, barcode needed |
| Upload Method | OCR only | Consistent, leverages existing pipeline |
| Device Support | Mobile-first | Primary use case, camera access |
| Landing Page | Separate at `/` | SEO, shareability, common pattern |
| Schema | Extend users table | Single source of truth, backward compatible |
| Auth Helpers | webUserQuery/Mutation | Consistent with existing patterns |
| Session Duration | Forever | Matches Telegram, reduces friction |
| Web Interface | Single file initially | Simple start, easy to refactor |
| Rate Limits | Combined | Prevents abuse, fair to users |
| Sessions | Built-in | Less code, secure, automatic |

### 14. Upload Reminders
**Question:** How should we handle upload reminders in the web app?

**Answer:** Two-pronged approach: in-app banner after claim + browser push notification.

**Implementation:**
- Show banner when user claimed yesterday but hasn't uploaded today
- Message: "Upload your new vouchers to keep the exchange flowing"
- Banner auto-dismisses when user uploads a voucher or clicks X
- Also send browser push notification (requires permission)

**Note:** Detailed implementation TBD — keep it simple for now.

---

## Architecture

### Authentication

**Convex Auth Integration**
- Uses `@convex-dev/auth` package
- Implements custom `ConvexCredentials` provider for Telegram Login Widget
- Sessions are long-lived (effectively forever)
- Users share the same `users` table record whether they come from Telegram bot or web

**Auth Flow**
1. User clicks Telegram Login Widget button
2. Widget returns: `id`, `first_name`, `last_name`, `username`, `photo_url`, `auth_date`, `hash`
3. Frontend sends data to `signIn("telegram", credentials)`
4. Backend verifies HMAC-SHA-256 hash using `TELEGRAM_BOT_TOKEN`
5. Backend looks up user by `telegramChatId`:
   - If found: returns existing user ID (linked identity)
   - If not found: creates new user with signup bonus (10 coins)

### Database Schema Changes

**Users Table Extension**
The existing `users` table will be extended with Convex Auth fields:

```typescript
users: defineTable({
  // Convex Auth fields (all optional for migration compatibility)
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  email: v.optional(v.string()),
  emailVerificationTime: v.optional(v.number()),
  phone: v.optional(v.string()),
  phoneVerificationTime: v.optional(v.number()),
  isAnonymous: v.optional(v.boolean()),
  
  // Existing fields (telegramChatId becomes optional)
  telegramChatId: v.optional(v.string()),
  username: v.optional(v.string()),
  firstName: v.optional(v.string()),
  coins: v.number(),
  isBanned: v.boolean(),
  // ... rest of existing fields
})
```

### Backend Structure

**Custom Auth Helpers**

Following the existing `adminQuery`/`adminMutation` pattern, we'll create:

```typescript
// convex/auth.ts
export const webUserQuery = customQuery(query, {
  args: {},
  input: async (ctx) => {
    const userId = await ctx.auth.getUserIdentity();
    if (!userId) throw new Error("Not authenticated");
    
    const user = await ctx.db.get(userId.subject as Id<"users">);
    if (!user || user.isBanned) throw new Error("Unauthorized");
    
    return { ctx: { user }, args: {} };
  },
});

export const webUserMutation = customMutation(mutation, {
  args: {},
  input: async (ctx) => {
    const userId = await ctx.auth.getUserIdentity();
    if (!userId) throw new Error("Not authenticated");
    
    const user = await ctx.db.get(userId.subject as Id<"users">);
    if (!user || user.isBanned) throw new Error("Unauthorized");
    
    return { ctx: { user }, args: {} };
  },
});
```

**Web Interface (`convex/web.ts`)**

Public-facing mutations and queries that wrap internal logic:

```typescript
// Queries
- getBalance(): { coins: number }
- getTransactions(): Transaction[]
- getAvailableVouchers(): { "5": number, "10": number, "20": number }

// Mutations
- uploadVoucher(imageStorageId: Id<"_storage">): void
- claimVoucher(type: "5" | "10" | "20"): ClaimResult
- reportVoucher(voucherId: Id<"vouchers">): ReportResult
```

### Frontend Routes

**Route Structure**
```
/                    → Landing page (migrated from apps/landing)
/login               → Telegram Login Widget page
/app                 → Redirects to /app/dashboard
/app/dashboard       → Main app interface
  - Upload section
  - Claim section (€5/€10/€20 buttons)
  - Balance display
  - Recent transactions
/app/voucher/:id     → Individual voucher view with report button
/app/help            → FAQ and support
```

**Landing Page Integration**
- Migrate `apps/landing/public/index.html` to TanStack Start route
- Preserve all SEO meta tags and content
- Show CTA button that redirects to /login or /app based on auth state

### Mobile-First UI Components

**Authentication**
- TelegramLoginButton - Embeds Telegram Login Widget

**Dashboard**
- CoinBalance - Shows current coin count
- UploadSection - Camera/file picker for voucher upload
- ClaimSection - Three buttons (€5, €10, €20) with cost indicators
- TransactionList - Recent uploads/claims

**Voucher**
- VoucherViewer - Full image display with expiration date
- ReportButton - Triggers report flow

**Help**
- FAQAccordion - Expandable FAQ items (from landing page content)
- SupportButton - Opens support chat interface

### Implementation Phases

**Phase 1: Backend Setup**
1. Install `@convex-dev/auth` package
2. Update schema with Convex Auth fields
3. Create `convex/auth.ts` with Telegram credentials provider
4. Implement `webUserQuery` and `webUserMutation` helpers
5. Create `convex/web.ts` with public interface

**Phase 2: Frontend Auth**
1. Add `ConvexAuthProvider` to router
2. Create `/login` route with Telegram Login Widget
3. Test auth flow (new user + existing user linking)

**Phase 3: Dashboard UI**
1. Create `/app/dashboard` route
2. Build mobile-first layout
3. Implement upload flow (image → storage → OCR)
4. Implement claim flow (select type → get voucher)
5. Display transactions list

**Phase 4: Voucher & Help**
1. Create `/app/voucher/:id` route
2. Implement voucher viewer with report functionality
3. Create `/app/help` route with FAQ

**Phase 5: Landing Page**
1. Migrate landing page content to `/` route
2. Integrate with auth state (show "Open App" vs "Get Started")
3. Delete old `apps/landing` directory

### Key Technical Decisions

1. **Shared Identity**: Users have same record regardless of auth method
2. **Mobile First**: No desktop support needed, optimize for camera access
3. **Internal Reuse**: Web interface wraps existing internal mutations
4. **Long Sessions**: Sessions don't expire (matches Telegram bot behavior)
5. **Schema Migration**: Make new Convex Auth fields optional to support existing users

### Environment Variables

Add to Convex environment:
```
TELEGRAM_BOT_TOKEN        # Existing - used for hash verification
AUTH_TELEGRAM_BOT_TOKEN   # Convex Auth uses this automatically
```

### Files to Create/Modify

**Backend:**
- `packages/backend/convex/auth.ts` (new)
- `packages/backend/convex/web.ts` (new)
- `packages/backend/convex/schema.ts` (modify)

**Frontend:**
- `apps/web/src/routes/index.tsx` (modify - landing page)
- `apps/web/src/routes/login.tsx` (new)
- `apps/web/src/routes/app/dashboard.tsx` (new)
- `apps/web/src/routes/app/voucher.$id.tsx` (new)
- `apps/web/src/routes/app/help.tsx` (new)
- `apps/web/src/components/TelegramLoginButton.tsx` (new)
- `apps/web/src/components/CoinBalance.tsx` (new)
- `apps/web/src/components/UploadSection.tsx` (new)
- `apps/web/src/components/ClaimSection.tsx` (new)
- `apps/web/src/components/VoucherViewer.tsx` (new)
- `apps/web/src/components/FAQAccordion.tsx` (new)

**Dependencies:**
- Add `@convex-dev/auth` to `apps/web/package.json`
- Add `@convex-dev/auth` to `packages/backend/package.json`

### Notes

- The Telegram Login Widget requires the domain to be registered with @BotFather
- Web uploads will use the same OCR processing pipeline as Telegram uploads
- Report functionality uses the same logic/banning system
- All rate limits (10 uploads/day, 5 claims/day, 1 report/day) apply to combined Telegram + web usage
