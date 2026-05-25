# Plan: Client-Side Auth Wrappers

## Problem

Two issues with the current `useUserAuth` + `sessionToken` pattern:

1. **Stale user data.** `user.coins` is fetched once during authentication and cached with `staleTime: Infinity`. After a mutation changes coins (claim voucher, return, refund, etc.), the UI never updates. The user sees the wrong balance until they refresh or re-authenticate.

2. **sessionToken threading.** Every query/mutation call site must pass `{ sessionToken: user!.sessionToken }`. This is repetitive across 10+ call sites, mixes auth infrastructure with domain logic, and is easy to forget.

## Design

Two changes, both additive (no backend refactor needed):

### 1. Reactive user data via `getCurrentUser` query

Add a backend query that returns the current user's data reactively, then use it with Convex's native `useQuery` — which subscribes via WebSocket and pushes updates automatically when data changes.

### 2. Client-side wrapper hooks

Create `useAuthedQuery` and `useAuthedMutation` hooks that read the session token from `localStorage` and auto-inject it. This removes `sessionToken` from every call site without touching the backend.

## Files to change / create

### New file: `packages/backend/convex/users.ts` — add `getCurrentUser`

```ts
export const getCurrentUser = userQuery({
  args: {},
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    return {
      _id: user._id,
      telegramChatId: user.telegramChatId,
      firstName: user.firstName,
      username: user.username,
      coins: user.coins,
      isBanned: user.isBanned,
    };
  },
});
```

### New file: `apps/web/src/hooks/useSessionToken.ts`

```ts
import { getDeployment } from "@/components/EnvironmentDropdown";

export function getSessionToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem(`user-session-${getDeployment()}`) ?? undefined;
}
```

### New file: `apps/web/src/hooks/useAuthedQuery.ts`

```ts
import { useQuery } from "convex/react";
import type { FunctionReference, FunctionArgs, OptionalRestArgs } from "convex/server";
import { getSessionToken } from "./useSessionToken";

type ArgsWithoutSessionToken<FuncRef extends FunctionReference<"query">> =
  FuncRef["_args"] extends { sessionToken: any; [key: string]: any }
    ? Omit<FuncRef["_args"], "sessionToken">
    : FuncRef["_args"];

export function useAuthedQuery<Query extends FunctionReference<"query", "public">>(
  queryRef: Query,
  ...args: ArgsWithoutSessionToken<Query> extends Record<string, never>
    ? [] | ["skip"]
    : [ArgsWithoutSessionToken<Query>] | ["skip"]
) {
  const sessionToken = getSessionToken();

  if (args[0] === "skip" || !sessionToken) {
    return useQuery(queryRef, "skip" as any);
  }

  const fullArgs = { ...args[0], sessionToken } as any;
  return useQuery(queryRef, fullArgs);
}
```

> **TypeScript limitation:** Due to the dynamic nature of Convex's `FunctionReference` types (the `_args` type is `any` for modular references), the wrapper can type-erase the `sessionToken` omission. In practice this is fine — Convex validates args at runtime via the schema, and the wrapper always injects the correct token. For extra safety, consider a simpler approach: accept `Omit<...>` and cast internally.

### Simplified alternative (recommended for now):

```ts
import { useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { getSessionToken } from "./useSessionToken";

export function useAuthedQuery<Query extends FunctionReference<"query", "public">>(
  queryRef: Query,
  args?: Record<string, any>,
) {
  const sessionToken = getSessionToken();
  return useQuery(
    queryRef,
    sessionToken ? { ...args, sessionToken } : "skip"
  );
}
```

### New file: `apps/web/src/hooks/useAuthedMutation.ts`

```ts
import { useMutation } from "convex/react";
import type { FunctionReference } from "convex/server";
import { getSessionToken } from "./useSessionToken";

export function useAuthedMutation<
  Mutation extends FunctionReference<"mutation", "public">
>(mutationRef: Mutation) {
  const mutate = useMutation(mutationRef);

  return (args?: Record<string, any>) => {
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      throw new Error("Not authenticated");
    }
    return mutate({ ...args, sessionToken });
  };
}
```

### Refactor: `apps/web/src/hooks/useUserAuth.ts`

Replace the TanStack Query `useQuery` with Convex's reactive `useQuery` for user data:

```ts
import { api } from "@open-voucher/backend/convex/_generated/api";
import type { Id } from "@open-voucher/backend/convex/_generated/dataModel";
import { useConvex, useQuery } from "convex/react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { getDeployment } from "@/components/EnvironmentDropdown";

// ... (keep authenticate, getTokenKey, getConvexHttpUrl as-is)

export function useUserAuth() {
  const convex = useConvex();

  // Auth handshake — still TanStack Query (one-shot, non-reactive)
  const {
    data: session,
    isLoading,
    error,
  } = useTanStackQuery({
    queryKey: ["userAuth", getDeployment()] as const,
    queryFn: () => authenticate(convex),
    staleTime: Infinity,
    retry: false,
  });

  const sessionToken = session?.sessionToken ?? null;

  // Reactive user data — Convex useQuery pushes updates live
  const userData = useQuery(
    api.users.getCurrentUser,
    sessionToken ? { sessionToken } : "skip",
  );

  return {
    sessionToken,
    user: userData ?? null,
    isLoading,
    error,
  };
}
```

> The auth handshake stays in TanStack Query because it involves non-Convex logic (localStorage, Telegram WebApp API, fetch). Only the user data moves to Convex's reactive `useQuery`.

### Refactor: All route/component files

Replace manual `sessionToken` passing with the new wrapper hooks:

**Before:**
```ts
const { user } = useUserAuth();

const claims = useQuery(
  api.vouchers.getMyClaimedVouchers,
  user ? { sessionToken: user.sessionToken } : "skip",
);

const returnVoucher = useMutation(api.vouchers.returnClaimedVoucher);
// Call site: returnVoucher({ sessionToken: user!.sessionToken, voucherId: v._id });
```

**After:**
```ts
const { user } = useUserAuth();

const claims = useAuthedQuery(api.vouchers.getMyClaimedVouchers);

const returnVoucher = useAuthedMutation(api.vouchers.returnClaimedVoucher);
// Call site: returnVoucher({ voucherId: v._id });
```

Files to update:
- `apps/web/src/routes/app/index.tsx` — uses `user.coins` (now reactive)
- `apps/web/src/routes/app/my-claims.tsx` — `getMyClaimedVouchers`, `returnClaimedVoucher`
- `apps/web/src/routes/app/my-uploads.tsx` — `getMyAvailableUploads`, `invalidateMyUpload`
- `apps/web/src/routes/app/transactions.tsx` — `getTransactionHistory`
- `apps/web/src/routes/app/availability.tsx` — `getVoucherAvailability`
- `apps/web/src/routes/app/feedback.tsx` — `submitAppFeedback`

### Remove: `apps/web/src/routes/app/transactions.tsx` — TanStack Query usage

Currently uses `useQuery` from `@tanstack/react-query` with manual `convex.query()`. Replace with `useAuthedQuery`:

**Before:**
```ts
const { data: transactions, isPending, error } = useQuery({
  queryKey: ["userTransactions", user?.sessionToken],
  queryFn: () => convex.query(api.users.getTransactionHistory, {
    sessionToken: user!.sessionToken,
  }),
  enabled: !!user,
  staleTime: 10_000,
});
```

**After:**
```ts
const transactions = useAuthedQuery(api.users.getTransactionHistory);
// Returns undefined while loading, null on error
```

Same pattern applies to `availability.tsx` and any other file doing manual `convex.query()` calls.

## Migration path

1. Add `getCurrentUser` backend query — no breaking changes
2. Create `useSessionToken`, `useAuthedQuery`, `useAuthedMutation` hooks
3. Refactor `useUserAuth` to use reactive `useQuery` for user data
4. Migrate each route file one at a time — old pattern still works during migration
5. Once all call sites are migrated, `sessionToken` is no longer exposed at the component level

## What this does NOT change

- Backend `userQuery`/`userMutation` wrappers stay as-is (they work fine)
- `userSessions` table stays as-is (still used for session validation/revocation)
- Telegram auth flow stays as-is (HTTP action + `verifyTelegramInitData`)
- `sessionToken` still flows to the backend — it's just hidden from component code

## Risks

| Risk | Mitigation |
|------|------------|
| `useAuthedQuery` type-erases sessionToken | Convex validates args at runtime; TypeScript errors would only appear if args are wrong |
| `localStorage` may not have sessionToken yet | `useAuthedQuery` returns `undefined` (loading) until token is available |
| Two sources of truth during migration | Both old and new pattern read the same `localStorage` key — no conflict |

## Estimated effort

| Task | Effort |
|------|--------|
| Add `getCurrentUser` query | 10 min |
| Create wrapper hooks | 30 min |
| Refactor `useUserAuth` | 15 min |
| Migrate 6 route files | 30 min |
| Type check + test | 15 min |
| **Total** | **~1.5 hours** |
