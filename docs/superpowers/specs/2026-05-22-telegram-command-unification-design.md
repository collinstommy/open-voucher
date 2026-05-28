# Telegram Command Unification Design

**Date:** 2026-05-22
**Status:** Approved

## Context

`@DunnesVoucherBot` currently has commands spread across 3 surfaces with significant overlap and inconsistency:

- **Bot commands** (`/` menu): `/help`, `/balance`, `/faq`, `/feedback`, `/donate` — missing `/app`
- **Text commands** (typed in chat): `help`, `balance`, `faq`, `donate`, `app`, `feedback`, `5`/`10`/`20` — mostly a superset of bot commands
- **Help menu** (inline keyboard): 9 buttons including Balance, FAQ, Feedback, Voucher Availability, Transactions, Donate, plus help topics

**Pain points:** Duplicate commands across surfaces (Balance in all 3), no `/app` in bot menu, `/start` silently fails, help menu has data-heavy items (Transactions, Availability) that belong in the Mini App, and the Mini App `/app` page is empty.

## Design

### Principle: Right command, right surface

- **Chat**: Quick, simple actions (balance check, voucher claiming, image upload, help/FAQ, feedback, donate)
- **Mini App**: Data-heavy views (transaction history, voucher availability)

### 1. Bot Commands Menu (`/`)

Registered via `setMyCommands`. Reduced from 5 to 4 commands:

| Command | Description |
|---------|-------------|
| `/help` | Show help menu |
| `/balance` | Check your coin balance |
| `/app` | Open the Mini App (NEW) |
| `/donate` | Support the project |

Removed: `/faq` and `/feedback` — accessible via `/help` submenu.

Onboarding remains automatic (no `/start` needed — new user detection triggers `handleNewUser`).

### 2. Text Commands (typed in chat)

All `/`-prefixed and plain text variants should work identically. Current text commands are fine but need:

- Ensure `start` maps to the existing new-user flow (instead of silently falling through)
- `/app` handler already exists but needs `setBotCommands` registration

Full supported text inputs:

| Input | Action |
|-------|--------|
| `help` | Help menu |
| `balance` | Coin balance |
| `app` | Open mini app |
| `donate` | Support link |
| `5`/`10`/`20` | Claim voucher |
| `faq` | FAQ (via help) |
| `feedback` | Feedback (via help) |
| Image upload | Auto-detect voucher |

### 3. Help Menu (Inline Keyboard)

Simplified from 9 to 8 buttons, organized in 3 rows:

**Row 1 — Main actions:**
- 💰 Check Balance
- 📊 Open Mini App (NEW — opens `openvouchers.org/app`)

**Row 2 — Help:**
- 📸 How to Upload
- 🎫 How to Claim

**Row 3 — More:**
- ❓ FAQ → FAQ submenu
- 💬 Give Feedback
- ☕ Donate

**Removed from help menu:**
- 📦 Voucher Availability → Mini App
- 📋 View Transactions → Mini App
- 🔄 View updates → Removed entirely

**Callback data changes:**
- `help:balance` — keep
- `help:app` — NEW, sends `web_app` button to open mini app
- `help:upload` — keep
- `help:claim` — keep
- `help:faq` — keep
- `help:feedback` — keep
- `help:donate` — keep
- `help:availability` — REMOVE
- `help:transactions` — REMOVE
- `help:updates` — REMOVE

### 4. Mini App (`/app` page)

Currently renders an empty page. Needs to show:

1. **Coin balance** (in header, already works)
2. **Transaction history** — last N transactions
3. **Voucher availability** — pool levels for €5, €10, €20

These replace the data that was previously only available in the bot chat via help menu buttons.

**Backend needed:**
- `getTransactionHistory` query — returns user's recent transactions
- `getVoucherAvailability` query — returns pool levels per denomination

## Implementation Tasks

### Backend (`packages/backend/convex/`)

1. **`telegram.ts` — `setBotCommands()`**: Update to 4 commands (`/help`, `/balance`, `/app`, `/donate`)
2. **`telegram.ts` — `handleCommand()`**: Ensure `start` is handled (map to new-user flow or help menu)
3. **`telegram.ts` — `sendHelpMenu()`**: Rework inline keyboard:
   - Remove `help:availability`, `help:transactions`, `help:updates`
   - Add `help:app` (sends `web_app` button)
4. **`telegram.ts` — `handleTelegramCallback()`**: Remove handlers for removed callbacks. Add `help:app` handler.
5. **New/updated queries**: `getTransactionHistory`, `getVoucherAvailability` — if they don't already exist in a usable form
6. **Register updated commands**: Run `register-commands` script to push new bot commands to Telegram

### Frontend (`apps/web/src/`)

7. **`routes/app/index.tsx`**: Replace empty placeholder with:
   - Transaction history list
   - Voucher availability display
8. **`hooks/useVoucherData.ts`** (or similar): New hook for fetching transaction history and availability from Convex

### Cleanup

9. **Remove from spec**:
   - Session token 30-day → 1 year (already the case in code, remove from spec)
   - Landing page dual CTA requirement (spec said returning users should see two CTAs — removing)

## Out of Scope

- Voucher return/used management in Mini App (future)
- Landing page redesign
- FAQ submenu changes (stay as-is)

## Reference

- `spec/user-web-app.md` — the Mini App spec (needs updating to remove dual CTA and 30-day session references)
- `packages/backend/convex/telegram.ts` — main bot handler
- `apps/web/src/routes/app/index.tsx` — empty Mini App placeholder
