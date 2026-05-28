# Mini App Hub — Implementation Plan

**Status:** Implemented (Mini App only; bot work in #53)  
**Design source:** `/prototype/mini-app-home?variant=D` (+ menu subtext from A)  
**Architecture:** [telegram-ux-architecture](../telegram-ux-architecture/index.html)  
**Bot follow-up:** [#53 — Telegram bot: align help menu and chat menu button](https://github.com/collinstommy/open-voucher/issues/53)

---

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| **Queries** | All Mini App data access uses `userQuery` (session-scoped). Convert `getVoucherAvailability` from public `query` → `userQuery`. |
| **Mutations** | Feedback uses `userMutation` (mirror `userQuery`) for `submitAppFeedback`. |
| **Logout** | Remove — not needed in Mini App UI. |
| **FAQ** | Full landing FAQ list, shared content module. **First two items:** How to upload, How to claim (copy from bot help text), then remaining landing FAQs in existing order. |
| **Bot changes** | **Out of scope** for this work — tracked in GitHub issue. |
| **Prototype** | Delete `routes/prototype/mini-app-home*` after Mini App ships. |

---

## Goal

Replace the current `/app` experience (debug account card + availability/transactions on one scroll page) with a **mobile hub**: balance hero + menu list, each item opening its own screen.

**In scope:** Mini App frontend + feedback API + FAQ shared content + delete prototype.  
**Out of scope:** Telegram bot changes, upload/claim in app, voucher logic.

---

## Target UX

```
┌─────────────────────────────┐
│ Open Vouchers    [Support] │  ← compact header (no logout)
├─────────────────────────────┤
│         127                 │
│   YOUR COIN BALANCE         │
├─────────────────────────────┤
│ 📊 Voucher availability  → │
│ 📋 Transactions          → │
│ ❓ FAQ                   → │
│ 💬 Give feedback         → │
│ ☕ Donate                ↗ │
└─────────────────────────────┘
```

- Light mode on `/app` (`text-slate-900`, `[color-scheme:light]`).
- No hover; `cursor-pointer` + `active:` only.
- Donate / Support → `openDonateLink()` (Telegram `WebApp.openLink` + fallback).

---

## Phase 1 — Mini App frontend

### 1.1 Routing

| Route | Screen |
|-------|--------|
| `/app` | Home hub |
| `/app/availability` | Stock grid |
| `/app/transactions` | History |
| `/app/faq` | FAQ accordion |
| `/app/feedback` | Feedback form |

### 1.2 Layout (`app.tsx`)

- Keep: loading, error, unauthenticated states.
- Remove: account info card, **logout button**.
- Add: `AppHeader`, `BalanceHero`, `<Outlet />`.

### 1.3 Components (`components/mini-app/`)

`AppHeader`, `BalanceHero`, `MenuList` / `MenuRow`, `AppScreen` (back + scroll).

### 1.4 Data layer — `userQuery` only

| Endpoint | Change |
|----------|--------|
| `users.getTransactionHistory` | Already `userQuery` — pass `sessionToken` from `useUserAuth` |
| `vouchers.getVoucherAvailability` | **Migrate** from public `query` to `userQuery` (same return shape; requires auth on mini app) |

Frontend pattern (all sub-routes):

```ts
convex.query(api.users.getTransactionHistory, { sessionToken: user.sessionToken })
convex.query(api.vouchers.getVoucherAvailability, { sessionToken: user.sessionToken })
```

Do **not** use unauthenticated Convex queries from `/app` routes.

### 1.5 FAQ content (`lib/faqContent.ts` or shared with landing)

1. **How to upload** — from `telegram.ts` help:upload copy (screenshot + barcode).
2. **How to claim** — from `telegram.ts` help:claim copy (`5` / `10` / `20`).
3. Remaining items — same Q&A as `LandingPage.tsx` `FAQ()` array (9 items), in current landing order.

Refactor landing to import shared FAQ data (optional in same PR; preferred to avoid drift).

### 1.6 Phase 1 deliverables

- Refactor `app.tsx`, `app/index.tsx`
- Add sub-routes + mini-app components
- Add `lib/openDonateLink.ts`
- Backend: `getVoucherAvailability` → `userQuery`

---

## Phase 2 — Feedback API

### 2.1 Backend

- Add `userMutation` in `auth.ts` (mirror `userQuery`).
- `users.submitAppFeedback` — `sessionToken` + `text`, insert into `feedback` table (same as internal path).

### 2.2 Frontend

- Wire `app/feedback.tsx` — textarea, submit, sonner toast, disable when empty/pending.

---

## Phase 3 — Telegram bot (deferred → GitHub issue)

Not part of this implementation. Issue covers:

- `setChatMenuButton` → `web_app` → `/app` (button label: **"My Account"**, not "Open App")
- Slim `help` menu
- Optional `setMyCommands` trim

---

## Phase 4 — Cleanup

| Item | Action |
|------|--------|
| Prototype | **Delete** `apps/web/src/routes/prototype/mini-app-home*` + `prototype:mini-app-home` script |
| Plan / NOTES | Mark complete |
| Landing FAQ | Import shared FAQ if extracted |

---

## PR scope (single PR or two)

| PR | Contents |
|----|----------|
| **1** | Phase 1 + Phase 2 + Phase 4 (full Mini App + delete prototype) |

Bot issue separate.

---

## Test plan

### Mini App

- [ ] Auth + balance matches bot
- [ ] All routes work; back to hub
- [ ] Availability/transactions require session (fail gracefully if logged out)
- [ ] FAQ: upload + claim first; full list scrolls
- [ ] Feedback submits and confirms
- [ ] Donate/Support open BMC
- [ ] No logout control visible
- [ ] Readable light UI

---

## Effort estimate

| Phase | Size |
|-------|------|
| Phase 1 | ~1 day |
| Phase 2 | ~2–3 hrs |
| Phase 4 | ~30 min |
