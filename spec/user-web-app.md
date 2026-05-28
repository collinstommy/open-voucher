# User-Facing Web App Specification

## Overview

Add a user-facing web app to the existing `apps/web` TanStack Start application, allowing Telegram-authenticated users to view and return their claimed vouchers. The app serves **three personas** from a single Cloudflare Worker deployment at `openvouchers.org`.

## Status

### ✅ Done
- [x] Route refactor — split into `routes/admin.tsx`, `routes/app.tsx`, `routes/index.tsx`
- [x] Admin routes moved under `/admin/*` with password auth in `admin.tsx`
- [x] Landing page migrated from `apps/landing/public/index.html` to React components
- [x] App placeholder routes at `/app/` (vouchers placeholder)

### 🔲 Todo — Backend
- [ ] Add `userSessions` table to `packages/backend/convex/schema.ts`
- [ ] Create `packages/backend/convex/userApp.ts` with:
  - `validateInitData` (verify HMAC-SHA-256, create session, return user + token)
  - `validateSession` (check token → user or null)
  - `getClaimedVouchers` (return vouchers where claimerId = user and status = "claimed")
  - `returnVoucher` (set voucher → available, refund coins, insert transaction)
  - `logoutUser` (delete session row)
  - `cleanupExpiredUserSessions` (internal, delete rows where expiresAt < now)
- [ ] Add cron entry in `crons.ts` for `cleanupExpiredUserSessions`

### 🔲 Todo — Frontend
- [ ] Create `hooks/useUserAuth.ts` — reads `WebApp.initData`, sends to `validateInitData`, stores session token
- [ ] Update `routes/app.tsx` — Telegram auth gate (show "Open in Telegram" if no session)
- [ ] Add banned-user check in `routes/app.tsx` — show appropriate message when `user.isBanned` (decide on UX: full-page ban notice, restricted mode, etc.)
- [ ] Update `routes/app/index.tsx` — fetch claimed vouchers via `getClaimedVouchers`, render `VoucherCard` list
- [ ] Create `components/VoucherCard.tsx` — voucher image, type badge, expiry date, return button
- [ ] Create `components/ReturnConfirmDialog.tsx` — confirmation before returning
- [x] ~~Add dual CTAs to landing page when session token is detected ("View your vouchers" + Telegram bot link)~~ — REMOVED. Landing page now uses a single CTA.

### 🔲 Todo — Cleanup
- [ ] Delete `apps/landing/` directory (static HTML no longer needed)
- [ ] Register `openvouchers.org/app` as Telegram Mini App via @BotFather

---

## Decision Log

### 1. App Architecture
**Question:** Separate TanStack Start app or extend the existing `apps/web`?

**Answer:** Extend `apps/web` (Option 2).

**Rationale:**
- Single deployment target — one `wrangler deploy`
- Shares Convex client, shadcn/ui components, Tailwind config, Vite plugins
- TanStack Router layout routes naturally separate admin/user/public concerns
- Less monorepo overhead (no new `turbo.json` task, no new `package.json`)
- Code-splitting via TanStack Start handles bundle size
- `apps/landing` (static HTML) gets absorbed and deleted

---

### 2. Route Structure
**Question:** What URLs map to each persona?

**Answer:** Three layout groups under `openvouchers.org`:

```
/                    → PUBLIC — Landing page (no auth gate)
/app/*               → USER   — Telegram WebApp auth gate
/admin/*             → ADMIN  — Password auth gate
```

**TanStack Router file tree:**

```
routes/
├── __root.tsx                   # HTML shell + ConvexProvider — NO auth gate
│
├── index.tsx                    # /          → Landing page (public)
│
├── app/                         # /app/*     → USER zone
│   ├── __layout.tsx             #   Telegram initData auth gate
│   ├── index.tsx                #   /app (redirect to /app/vouchers)
│   └── vouchers.tsx             #   /app/vouchers
│
└── admin/                       # /admin/*   → ADMIN zone
    ├── __layout.tsx             #   Password auth gate + NavigationLayout
    ├── index.tsx                #   /admin (dashboard, migrated from routes/index.tsx)
    ├── vouchers.tsx             #   /admin/vouchers
    ├── users/                   #   /admin/users, /admin/users/$userId
    ├── banned.tsx               #   /admin/banned
    ├── feedback.tsx             #   /admin/feedback
    ├── evals.tsx                #   /admin/evals
    ├── failed-uploads.tsx       #   /admin/failed-uploads
    ├── health-check.tsx         #   /admin/health-check
    └── settings.tsx             #   /admin/settings
```

---

## Research: Telegram Web Authentication

Telegram offers two distinct mechanisms for authenticating web users. They serve different purposes and are not interchangeable.

### A. Mini App initData (our primary path)

**Source:** https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

When a user opens a Mini App inside Telegram, the client automatically populates `window.Telegram.WebApp.initData` — a query string of field-value pairs including `user`, `auth_date`, and `hash`.

The `user` field is a JSON object with `id`, `first_name`, `username`, `language_code`, etc.

**Verification (server-side):**
```
1. data_check_string = all fields except hash, sorted alphabetically,
   formatted as "key=<value>" joined by \n
2. secret_key = HMAC_SHA256(<bot_token>, "WebAppData")
3. computed_hash = hex(HMAC_SHA256(data_check_string, secret_key))
4. if computed_hash == received hash → valid
5. Optionally check auth_date to prevent replay (e.g., reject if > 1 hour old)
```

**Key properties:**
- Zero friction — no popup, no redirect, no user action needed
- Only works inside Telegram (no `WebApp` object in regular browsers)
- The `id` field is the Telegram user ID (same as the `telegramChatId` in our `users` table)
- Can validate `auth_date` freshness to prevent replay attacks
- No Client ID/Secret needed — just the bot token

### B. Telegram Login Widget (OIDC)

**Source:** https://core.telegram.org/bots/telegram-login

For standalone websites accessed in a regular browser, Telegram offers an OIDC-based login flow:

```
1. Register bot with @BotFather → Bot Settings → Web Login
2. Add Allowed URLs (e.g., https://openvouchers.org)
3. @BotFather provides Client ID and Client Secret
4. Frontend: Telegram.Login.init({ client_id, ... }, callback)
5. User clicks button → Telegram popup → user authorizes
6. Callback receives id_token (signed JWT)
7. Backend verifies JWT signature using JWKS endpoint
```

**id_token claims:**
```json
{
  "iss": "https://oauth.telegram.org",
  "aud": "<bot_id>",
  "sub": "<unique_user_id>", 
  "id": 987654321,
  "name": "John Doe",
  "preferred_username": "johndoe",
  "picture": "https://cdn...",
  "iat": 1700000000,
  "exp": 1700003600
}
```

**Key properties:**
- Works in any browser (not just inside Telegram)
- Requires user interaction (popup, consent screen)
- Requires Client ID/Secret registration with @BotFather
- Returns JWT id_token with standard OIDC claims
- The `id` field matches the Telegram user ID

**Important note:** The `sub` field in the OIDC id_token is a *different* identifier from the `id` field. The `id` field is the actual Telegram user ID. Use `id` (not `sub`) to match against `telegramChatId`.

### C. Chosen Approach: initData + Session Tokens

We use the **Mini App initData** flow as the primary auth path, with session tokens to bridge browser visits:

| Scenario | Auth mechanism |
|----------|---------------|
| User opens `/app` inside Telegram | `WebApp.initData` verified → session token stored |
| User visits `/` in a regular browser (returning) | Session token checked in localStorage (can navigate to `/app`) |
| User visits `/` for the first time | No token → "Open Bot in Telegram" CTA only |

**Why not the Telegram Login Widget (OIDC):**
- Our app is primarily a Mini App, accessed from within Telegram
- The OIDC flow requires registering domains with @BotFather and managing Client ID/Secret
- The popup-based flow adds friction for mobile users
- initData verification is the same HMAC pattern we already use for Telegram bot webhooks
- Session tokens handle the browser gap cleanly without the complexity of OIDC

**Why not Convex Auth:**
- Convex Auth's built-in providers don't include a Telegram Mini App provider
- We'd need a custom provider anyway, which is similar complexity to manual verification
- Manual verification follows the admin auth pattern already established in the codebase
- No schema migration needed

**Future:** If we ever need to support full login from a regular browser (without Telegram), we can add the OIDC flow as a secondary auth path alongside the existing session token mechanism.

---

### 3. Authentication Strategy
**Question:** Convex Auth or manual initData verification?

**Answer:** Manual `initData` verification, matching the admin token pattern.

**Implementation:**
- Frontend reads `window.Telegram.WebApp.initData` (only available inside Telegram)
- Frontend sends `initData` to a Convex query `userApp.validateSession({ initData })`
- Backend verifies HMAC-SHA-256 signature against `TELEGRAM_BOT_TOKEN`
- Backend returns `{ user, sessionToken }` — frontend stores `sessionToken` in `localStorage`
- Subsequent requests send `sessionToken` instead of `initData` (lighter, works outside Telegram)
- Session tokens are long-lived (no expiry, same as admin sessions)

**Rationale:**
- Consistent pattern with existing admin auth (token-based)
- No new dependency (`@convex-dev/auth`)
- No schema migration needed (no Convex Auth fields on `users` table)
- `sessionToken` enables the landing page to recognize returning users in any browser
- Simpler than Convex Auth for this use case

---

### 4. Auth Gate Behavior
**Question:** What does each layout's auth gate do?

**Answer:**

| Layout | Not authenticated | Authenticated | Banned |
|--------|------------------|---------------|--------|
| `__root.tsx` | Render children (no gate) | Render children | N/A |
| `app/__layout.tsx` | "Open this page in Telegram" message | Render user nav + children | Banned message |
| `admin/__layout.tsx` | Password login form | Render admin nav + children | N/A (admin can't be banned) |

---

### 5. Landing Page Behavior
**Question:** What happens when a returning user visits `/`?

**Answer:** ~~The landing page checks for a stored session token. If valid, it shows **two CTAs**.~~

**⚠️ DEPRECATED — Dual CTAs removed.** The landing page now uses a **single CTA** for all visitors ("Open Bot in Telegram"), regardless of session state. Returning users can navigate directly to `/app` using the nav bar or a bookmark. The dual-CTA design below is kept for historical reference only.

<details>
<summary>Original dual-CTA design (deprecated)</summary>

```
┌──────────────────────────────────────┐
│         Landing page content         │
│                                      │
│  ┌──────────────────────────────┐    │
│  │  📋 View your vouchers  →   │    │  ← /app (web interface)
│  └──────────────────────────────┘    │
│                                      │
│  ┌──────────────────────────────┐    │
│  │  🤖 Open Bot in Telegram    │    │  ← t.me link (upload & claim)
│  └──────────────────────────────┘    │
│                                      │
│  (Upload & claim via the bot)        │
└──────────────────────────────────────┘
```

**First-time visitor** sees only the Telegram CTA. No silent redirect — the landing page stays a proper marketing surface.

</details>

---

### 6. Initial Feature Scope
**Question:** What features does the user-facing web app include initially?

**Answer:** Minimal scope — **view claimed vouchers + return a voucher**.

| Feature | Web app? | Telegram bot? |
|---------|----------|---------------|
| View claimed vouchers | ✅ | ❌ (no built-in list) |
| Return a voucher | ✅ | ❌ (not supported yet) |
| Upload voucher | ❌ | ✅ |
| Claim voucher | ❌ | ✅ |
| Report voucher | ❌ | ✅ |
| Check balance | ❌ | ✅ |
| View transactions | ❌ | ✅ |

**Rationale:**
- Upload and claim require camera access or image handling optimized for Telegram
- The web app fills a gap: the bot has no "my vouchers" list or return flow
- Start small, validate usage, expand later
- Return functionality is a new feature not yet available anywhere

---

### 7. Return Voucher Flow
**Question:** How does returning a voucher work?

**Answer:** The user sees their claimed vouchers. Each has a "Return" button.

```
Step 1: User taps "Return" on a voucher
Step 2: Confirmation dialog: "Return this €X voucher? You'll get Y coins back."
Step 3: User confirms
Step 4: Backend:
  - Sets voucher status to "available"
  - Clears claimerId and claimedAt
  - Refunds CLAIM_COSTS[type] coins to user
  - Inserts "refund" transaction (or new "return" transaction type)
Step 5: UI updates — voucher removed from list, balance updated
```

**Backend mutation:** `userApp.returnVoucher({ sessionToken, voucherId })`

---

### 8. Session Token Lifecycle
**Question:** How long do sessions last? Where are they stored? How are they cleaned up?

**Answer:** Absolute expiry + daily cleanup cron (same pattern as admin sessions).

- **Duration:** 365 days (1 year) from creation (matches `USER_SESSION_DURATION_MS` in `constants.ts`). Admin sessions use 24 hours; user sessions get a longer window since re-auth requires opening Telegram.
- **Storage:** `localStorage` key `user-session-{deployment}` (same pattern as `admin-token-{deployment}`)
- **Creation:** When user first visits `/app` and verifies `initData` → `expiresAt = now + 365 days`
- **Validation:** `/` and `/app` check on load; `expiresAt < now` → clear token, show unauthenticated state
- **Logout:** Deletes the `userSessions` row immediately (same as `admin.logout`)
- **Cleanup:** Daily cron runs `cleanupExpiredUserSessions` → `DELETE FROM userSessions WHERE expiresAt < now`
- **Sharing:** Same token works for the landing page and `/app` routes

**Why not sliding expiry:** Adds a write on every request. For a voucher-viewing app, 365-day (1 year) fixed expiry is generous enough and keeps reads cheap.

**Why not forever:** Unbounded DB growth. Even at modest scale, abandoned sessions accumulate indefinitely.

---

### 9. Backend Structure
**Question:** Where do the new queries/mutations live?

**Answer:** New file `convex/userApp.ts` with public queries and mutations.

```typescript
// convex/userApp.ts

// Public queries (called from frontend)
- validateInitData({ initData: string }) → { user, sessionToken, expiresAt }
- validateSession({ sessionToken: string }) → { user } | null
- getClaimedVouchers({ sessionToken: string }) → Voucher[]

// Public mutations
- returnVoucher({ sessionToken: string, voucherId: Id<"vouchers"> }) → { success, refundedCoins }
- logoutUser({ sessionToken: string }) → { success: boolean }

// Internal (scheduled cleanup)
- cleanupExpiredUserSessions → { deletedCount: number }
```

New table for user sessions (mirrors `adminSessions`):

```typescript
// schema.ts addition
userSessions: defineTable({
  token: v.string(),
  userId: v.id("users"),
  createdAt: v.number(),
  expiresAt: v.number(),
}).index("by_token", ["token"]),
```

New cron job:

```typescript
// crons.ts addition
crons.daily(
  "cleanup user sessions",
  { hourUTC: 2, minuteUTC: 15 },
  internal.userApp.cleanupExpiredUserSessions,
);
```

**Rationale:**
- Exact same structure as `adminSessions` (token, userId, createdAt, expiresAt, by_token index)
- Same cleanup pattern (daily cron, internal mutation)
- No overlap with admin auth — separate tables, separate concerns
- `telegramChatId` on users table remains required (all users come from Telegram)

---

### 10. Rate Limiting
**Question:** Does the return action have rate limits?

**Answer:** Initially none. Monitor for abuse and add if needed.

**Rationale:**
- Returning a voucher is net-neutral for the economy (coins refunded, voucher available for others)
- No obvious abuse vector
- Can add per-day return limit later if abuse emerges

---

### 11. Refactoring Admin Routes (✅ Done)
**Question:** What moved where?

**Answer:**

| Current location | New location |
|-----------------|--------------|
| `__root.tsx` — `AdminApp` wrapper | `admin/__layout.tsx` |
| `__root.tsx` — `NavigationLayout` | `admin/__layout.tsx` |
| `routes/index.tsx` | `admin/index.tsx` |
| `routes/vouchers.tsx` | `admin/vouchers.tsx` |
| `routes/users/index.tsx` | `admin/users/index.tsx` |
| `routes/users/$userId.tsx` | `admin/users/$userId.tsx` |
| `routes/banned.tsx` | `admin/banned.tsx` |
| `routes/evals.tsx` | `admin/evals.tsx` |
| `routes/failed-uploads.tsx` | `admin/failed-uploads.tsx` |
| `routes/feedback.tsx` | `admin/feedback.tsx` |
| `routes/health-check.tsx` | `admin/health-check.tsx` |
| `routes/settings.tsx` | `admin/settings.tsx` |
| `apps/landing/public/index.html` | `routes/index.tsx` (rebuilt as React) ✅ |

---

### 12. Component Changes

**`__root.tsx`** — Stripped to HTML shell only:
```tsx
function RootDocument() {
  return (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body>
        <Outlet />
        <Toaster richColors />
        <Scripts />
      </body>
    </html>
  );
}
```

**`admin/__layout.tsx`** — Absorbs current AdminApp + NavigationLayout:
```tsx
function AdminLayout() {
  const { isValid, isLoading, login, logout } = useAdminAuth();
  if (isLoading) return <Loader />;
  if (!isValid) return <AdminLoginForm onLogin={login} />;
  return (
    <div className="px-4 py-2">
      <NavigationLayout onLogout={logout} />
      <Outlet />
    </div>
  );
}
```

**`app/__layout.tsx`** — New Telegram auth gate:
```tsx
function UserAppLayout() {
  const { user, isLoading, error } = useUserAuth();
  if (isLoading) return <Loader />;
  if (error || !user) return <TelegramRequiredMessage />;
  if (user.isBanned) return <BannedMessage />;
  return (
    <div className="px-4 py-2">
      <UserHeader user={user} />
      <Outlet />
    </div>
  );
}
```

---

### 13. User App UI Components

New components:
- **`UserHeader`** — Shows coin balance, minimal branding
- **`VoucherCard`** — Displays voucher type, image, expiry date, return button
- **`ReturnConfirmDialog`** — Confirmation before returning a voucher
- **`TelegramRequiredMessage`** — Instructions for opening in Telegram

---

### 14. Environment Variables

No new env vars needed. Existing `TELEGRAM_BOT_TOKEN` is used for `initData` verification.

---

### 15. Deployment & Rollout

**Single deploy command:**
```bash
bun run deploy:web
```

**Rollout steps:**

1. ✅ Frontend route refactor — admin routes under `/admin/*`, app routes under `/app/*`
2. ✅ Landing page migrated from static HTML to React
3. 🔲 Backend — `userSessions` table + `convex/userApp.ts` + cron
4. 🔲 Frontend — Telegram auth hook + voucher listing + return flow
5. 🔲 Delete `apps/landing/` directory
6. 🔲 Register `openvouchers.org/app` as Telegram Mini App via @BotFather

---

## Summary

| Decision | Choice |
|----------|--------|
| Architecture | Extend `apps/web` (Option 2) ✅ |
| Routes | `/` public ✅, `/app/*` user (placeholder), `/admin/*` admin ✅ |
| Auth | Manual initData verification + session tokens |
| Convex Auth | Not used |
| Initial features | View claimed vouchers + return |
| Session duration | 365 days (1 year), daily cron cleanup |
| Landing page | At `/` with single CTA ("Open Bot in Telegram") — migrated ✅, dual CTAs removed |
| Landing page migration | Rebuild as React — ✅; delete `apps/landing/` — 🔲 |
