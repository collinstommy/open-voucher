# Telegram Command Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify Telegram bot commands across surfaces — trim bot commands menu to 4 essentials, simplify help menu, and populate the empty Mini App with transaction history and voucher availability.

**Architecture:** Three changes to `packages/backend/convex/telegram.ts` (bot commands, help menu, callbacks), two new public Convex queries, and a new Mini App page in `apps/web/src/routes/app/index.tsx`. No new files. All existing patterns preserved.

**Tech Stack:** Convex (queries + actions), React + TanStack Router + TailwindCSS (Mini App), D1/Convex DB (transactions + vouchers tables)

---

### Task 1: Update registered bot commands (4 commands)

**Files:**
- Modify: `packages/backend/convex/telegram.ts:637-669`

- [ ] **Step 1: Replace the commands array in `setBotCommands()`**

Replace lines 644-650 (the `commands` array) with:

```typescript
	const commands = [
		{ command: "help", description: "Show help menu" },
		{ command: "balance", description: "Check your coin balance" },
		{ command: "app", description: "Open the Mini App" },
		{ command: "donate", description: "Support the project" },
	];
```

Removes `/faq` and `/feedback`; adds `/app`.

- [ ] **Step 2: Verify the change compiles**

Run: `cd packages/backend && bun check-types`
Expected: No errors.

- [ ] **Step 3: Review changes — do not commit yet**

---

### Task 2: Update help menu inline keyboard

**Files:**
- Modify: `packages/backend/convex/telegram.ts:251-274`

- [ ] **Step 1: Replace the `sendHelpMenu()` function body**

Replace lines 252-274 with:

```typescript
async function sendHelpMenu(chatId: string) {
	await sendTelegramMessage(chatId, "Choose an option below", {
		inline_keyboard: [
			[
				{ text: "💰 Balance", callback_data: "help:balance" },
				{ text: "📊 Open Mini App", callback_data: "help:app" },
			],
			[
				{ text: "📸 How to Upload", callback_data: "help:upload" },
				{ text: "🎫 How to Claim", callback_data: "help:claim" },
			],
			[
				{ text: "❓ FAQ", callback_data: "help:faq" },
				{ text: "💬 Give Feedback", callback_data: "help:feedback" },
			],
			[{ text: "☕ Donate", callback_data: "help:donate" }],
		],
	});
}
```

Changes:
- Row 1 becomes: Balance + Open Mini App (NEW, was Balance + FAQ)
- Row 2 becomes: How to Upload + How to Claim (was just one "Give feedback" row)
- Row 3 becomes: FAQ + Give Feedback (was Availability row)
- Row 4 becomes: Donate only (was Upload/Claim row)
- Removed: Voucher Availability, View Transactions, View Updates

- [ ] **Step 2: Verify the change compiles**

Run: `cd packages/backend && bun check-types`
Expected: No errors.

- [ ] **Step 3: Review changes — do not commit yet**

---

### Task 3: Add help:app callback handler, remove old callbacks, add start command

**Files:**
- Modify: `packages/backend/convex/telegram.ts:296-373` (handleCommand), `packages/backend/convex/telegram.ts:804-913` (help callback switch)

- [ ] **Step 1: Add "start" handler in `handleCommand()`**

In the `handleCommand` function, add a `start` case just before the existing `if (lowerText === "balance")` (around line 303). The `lowerText` is already stripped of `/` prefix (line 492), so `start` and `/start` both arrive as `"start"`.

Add this block before `if (lowerText === "balance")`:

```typescript
	if (lowerText === "start") {
		await sendHelpMenu(chatId);
		return true;
	}
```

- [ ] **Step 2: Remove `help:availability`, `help:transactions`, `help:updates` callback handlers**

Delete the entire case bodies for these three callbacks in the help switch statement (lines 825-912). Specifically remove:
- Lines 825-841 (`case "availability":`)
- Lines 856-898 (`case "transactions":`)
- Lines 899-905 (`case "updates":`)

- [ ] **Step 3: Add `help:app` callback handler**

In the help switch (around line 804), add a new case before the `case "update"` handler (or in place of one of the removed handlers):

```typescript
			case "app": {
				await sendTelegramMessage(
					chatId,
					"📋 <b>My Vouchers</b>\n\nView your transactions and voucher availability in the web app.",
					{
						inline_keyboard: [
							[
								{
									text: "📋 Open My Vouchers",
									web_app: { url: "https://openvouchers.org/app" },
								},
							],
						],
					},
				);
				break;
			}
```

- [ ] **Step 4: Verify the change compiles**

Run: `cd packages/backend && bun check-types`
Expected: No errors.

- [ ] **Step 5: Review changes — do not commit yet**

---

### Task 4: Create public voucher availability query

**Files:**
- Modify: `packages/backend/convex/vouchers.ts` (append new query after line 501)

- [ ] **Step 1: Add a public `query` (not `internalQuery`) for voucher availability**

Add after the closing `});` of `getAvailableVoucherCount` (after line 501):

```typescript
export const getVoucherAvailability = query({
	args: {},
	handler: async (ctx) => {
		const availableVouchers = await ctx.db
			.query("vouchers")
			.withIndex("by_status_type", (q) => q.eq("status", "available"))
			.collect();

		const counts: Record<string, number> = { "5": 0, "10": 0, "20": 0 };
		for (const v of availableVouchers) {
			counts[v.type] = (counts[v.type] || 0) + 1;
		}
		return counts;
	},
});
```

Also add `query` to the import at line 5 of `vouchers.ts`. The current line is:
```typescript
import { internalMutation, internalQuery } from "./_generated/server";
```
Change it to:
```typescript
import { internalMutation, internalQuery, query } from "./_generated/server";
```

- [ ] **Step 2: Verify the change compiles**

Run: `cd packages/backend && bun check-types`
Expected: No errors.

- [ ] **Step 3: Review changes — do not commit yet**

---

### Task 5: Create verifyUserSession + userQuery helper + authenticated queries

**Files:**
- Modify: `packages/backend/convex/auth.ts` (add verifyUserSession + userQuery wrapper)
- Modify: `packages/backend/convex/users.ts` (add getTransactionHistory)

This follows the same `adminQuery` pattern from `admin.ts:103-109` using `customQuery` from `convex-helpers`.

- [ ] **Step 1: Add imports to auth.ts**

The import from `_generated/server` currently reads:
```typescript
import { internalMutation, mutation, query } from "./_generated/server";
```
Add `type QueryCtx`:
```typescript
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
```

Add the convex-helpers import:
```typescript
import { customQuery } from "convex-helpers/server/customFunctions";
```

(The existing import from `convex/values` and `./constants` stay as-is.)

- [ ] **Step 2: Add `verifyUserSession` + `userQuery` to auth.ts**

Add at the end of the file (after `cleanupExpiredUserSessions`, around line 168):

```typescript
export async function verifyUserSession(
	ctx: QueryCtx,
	sessionToken: string,
): Promise<void> {
	const session = await ctx.db
		.query("userSessions")
		.withIndex("by_token", (q) => q.eq("token", sessionToken))
		.first();

	if (!session) {
		throw new Error("Unauthorized: Invalid session token");
	}

	if (session.expiresAt < Date.now()) {
		throw new Error("Unauthorized: Session expired");
	}
}

export const userQuery = customQuery(query, {
	args: { sessionToken: v.string() },
	input: async (ctx, { sessionToken }) => {
		await verifyUserSession(ctx, sessionToken);
		const session = await ctx.db
			.query("userSessions")
			.withIndex("by_token", (q) => q.eq("token", sessionToken))
			.first();
		if (!session) throw new Error("Session not found");
		return { ctx: {}, args: { userId: session.userId } };
	},
});
```

`userQuery` validates the session in `input` (throwing if invalid) and injects `userId` into the handler's args. The `sessionToken` is consumed and not passed to the handler.

This mirrors `adminQuery` at `admin.ts:103-109` exactly — same `customQuery` wrapper, same session-verification pattern.

- [ ] **Step 3: Add `getTransactionHistory` using userQuery to users.ts**

Add after the closing `});` of `getUserTransactions` (line 197):

```typescript
import { userQuery } from "./auth";

export const getTransactionHistory = userQuery({
	args: {},
	handler: async (ctx, { userId }) => {
		const transactions = await ctx.db
			.query("transactions")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		return transactions.sort((a, b) => b.createdAt - a.createdAt).slice(0, 25);
	},
});
```

The `userId` arg is injected by `userQuery`'s `input` — the handler doesn't declare `sessionToken`, it's consumed upstream. The import line for `userQuery` should be added near the top of `users.ts`, grouped with other local imports.

- [ ] **Step 4: Verify the change compiles**

Run: `cd packages/backend && bun check-types`
Expected: No errors.

- [ ] **Step 5: Review changes — do not commit yet**

---

### Task 6: Build Mini App page with transaction history + voucher availability

**Files:**
- Modify: `apps/web/src/routes/app/index.tsx` (replace empty placeholder)

- [ ] **Step 1: Install dayjs in the web app**

```bash
cd apps/web && bun add dayjs
```

- [ ] **Step 2: Replace the empty page with full implementation**

Replace the entire file content:

```tsx
import { api } from "@open-voucher/backend/convex/_generated/api";
import { useConvex } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useUserAuth } from "@/hooks/useUserAuth";
import { useMemo } from "react";

export const Route = createFileRoute("/app/")({
	component: AppIndex,
});

function AppIndex() {
	const { user } = useUserAuth();
	const convex = useConvex();

	const { data: availability } = useQuery({
		queryKey: ["voucherAvailability"],
		queryFn: () => convex.query(api.vouchers.getVoucherAvailability, {}),
		staleTime: 30_000,
	});

	const { data: transactions } = useQuery({
		queryKey: ["userTransactions", user?._id],
		queryFn: () =>
			user
				? convex.query(api.users.getTransactionHistory, { sessionToken: user.sessionToken })
				: null,
		enabled: !!user,
		staleTime: 10_000,
	});

	const transactionDisplay = useMemo(() => {
		if (!transactions || transactions.length === 0) return null;

		return transactions.map((t, i) => {
			const date = dayjs(t.createdAt).format("MMM D, YYYY");
			const isSpend =
				t.type === "claim_spend" || t.type === "claim_reversed";
			const prefix = isSpend ? "-" : "+";
			const label = formatType(t.type);
			return (
				<div
					key={`${t._id}-${i}`}
					className="flex items-center justify-between py-2 px-1 border-b border-border last:border-0"
				>
					<div>
						<div className="text-sm font-medium">{label}</div>
						<div className="text-xs text-muted-foreground">{date}</div>
					</div>
					<div
						className={`text-sm font-mono ${isSpend ? "text-destructive" : "text-green-600 dark:text-green-400"}`}
					>
						{prefix}
						{t.amount} coins
					</div>
				</div>
			);
		});
	}, [transactions]);

	if (!user) {
		return (
			<div className="px-4 py-8 text-center text-muted-foreground">
				Loading...
			</div>
		);
	}

	return (
		<div className="px-4 py-4 space-y-6">
			{/* Voucher Availability */}
			<section>
				<h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
					Voucher Availability
				</h2>
				<div className="grid grid-cols-3 gap-3">
					{(["5", "10", "20"] as const).map((denom) => {
						const count = availability?.[denom];
						const loaded = count !== undefined;
						const status = loaded
							? count === 0
								? "red"
								: count < 10
									? "yellow"
									: "green"
							: "gray";

						const colors: Record<string, string> = {
							red: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400",
							yellow:
								"bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800 text-yellow-600 dark:text-yellow-400",
							green:
								"bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-600 dark:text-green-400",
							gray: "bg-muted border-border text-muted-foreground",
						};

						return (
							<div
								key={denom}
								className={`rounded-lg border p-3 text-center ${colors[status]}`}
							>
								<div className="text-lg font-bold">€{denom}</div>
								<div className="text-xs mt-1">
									{loaded
										? count === 0
											? "None"
											: `${count} avail`
										: "..."}
								</div>
							</div>
						);
					})}
				</div>
			</section>

			{/* Transaction History */}
			<section>
				<h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
					Transaction History
				</h2>
				{transactionDisplay ? (
					<div className="rounded-lg border bg-card">{transactionDisplay}</div>
				) : (
					<p className="text-sm text-muted-foreground">
						No transactions yet.
					</p>
				)}
			</section>
		</div>
	);
}

function formatType(type: string): string {
	switch (type) {
		case "signup_bonus":
			return "Signup Bonus";
		case "upload_reward":
			return "Upload Reward";
		case "claim_spend":
			return "Claim Spent";
		case "refund":
		case "report_refund":
			return "Refund";
		case "uploader_denied":
			return "Upload Denied";
		default:
			return type.replace(/_/g, " ");
	}
}
```

- [ ] **Step 3: Check types**

Run: `cd apps/web && bun check-types`
Expected: No errors.

- [ ] **Step 4: Review changes — do not commit yet**

---

### Task 7: Deploy bot commands to Telegram

**Files:**
- No file changes. Run the registered commands script.

- [ ] **Step 1: Run register-commands to push new bot commands to Telegram**

```bash
cd packages/backend && bun run register-commands
```

This runs `convex run telegram:registerBotCommands --prod`, which calls the updated `setBotCommands()` with `/help`, `/balance`, `/app`, `/donate`.

- [ ] **Step 2: Confirm success**

Expected output: "Bot commands registered successfully" in console logs.

---

### Task 8: Run full type check and tests

**Files:**
- None (verification only)

- [ ] **Step 1: Run type checking across all packages**

```bash
cd /home/tom/toms_code/open-voucher && bun run check-types
```
Expected: No errors.

- [ ] **Step 2: Run backend tests**

```bash
cd packages/backend && bun run test
```
Expected: All tests pass.

- [ ] **Step 3: Review any fixups before committing**

---

### Task 9: Update spec document (remove stale requirements)

**Files:**
- Modify: `spec/user-web-app.md`

- [ ] **Step 1: Update session token duration to match reality**

Find the section mentioning 30-day sessions and update to match `constants.ts` (1 year):

```diff
- sessions expire after 30 days
+ sessions expire after 1 year
```

- [ ] **Step 2: Remove landing page dual CTA requirement**

Find the section about returning users seeing two CTAs and remove it or mark as removed.

- [ ] **Step 3: Review changes — do not commit yet**
