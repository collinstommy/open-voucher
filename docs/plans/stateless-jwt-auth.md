# Plan: Stateless JWT Auth (Telegram)

## Summary

Replace opaque `sessionToken` + `userSessions` DB lookups with **stateless app JWTs** validated by Convex’s built-in auth pipeline.

- **Login:** verify Telegram `initData` → load user (unchanged) → sign JWT (`sub` = `userId`)
- **Requests:** `ConvexProviderWithAuth` sends `Authorization: Bearer <jwt>` automatically
- **Backend:** `ctx.auth.getUserIdentity()` — no `sessionToken` in function args
- **No `userSessions` table** — ban/coins enforced on the user row in handlers (as today)
- **Client:** split login (TanStack `useQuery` bootstrap) from profile (Convex `useQuery` `getCurrentUser`) — thin `useUserAuth`

Designed so **Google auth later** is another HTTP sign-in route that calls the same `issueJwt(userId)`.

---

## Current vs target

```
CURRENT                                    TARGET
───────                                    ──────

Client                                     Client
  localStorage: user-session-*               localStorage: jwt-* + JwtAuthContext
  TanStack → auth + user (stale)             TanStack → login bootstrap only
  useQuery({ sessionToken })                 Convex useQuery → getCurrentUser (live)
                                             useQuery({}) on other APIs

HTTP /api/telegram-auth                    HTTP /api/telegram-auth
  → createSessionForTelegramUser (DB)        → load user → issueJwt()

Backend                                    Backend
  userQuery({ sessionToken })                userQuery({}) — userId from JWT in wrapper
  verifyUserSession → userSessions           ctx.auth.getUserIdentity()
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  LOGIN (once per visit / expired token)                     │
│                                                             │
│  Telegram WebApp.initData                                   │
│       │                                                     │
│       ▼                                                     │
│  POST /api/telegram-auth                                    │
│       ├─ verifyTelegramInitData (unchanged)                 │
│       ├─ find user by telegramChatId (unchanged)            │
│       └─ issueJwt(user._id)  →  { jwt, user }             │
│                                                             │
│  Client: localStorage.setItem(`jwt-${deployment}`, jwt)     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  ONGOING (automatic)                                        │
│                                                             │
│  ConvexProviderWithAuth (JwtAuthProvider)                   │
│    fetchAccessToken() → jwt from React state                │
│       │                                                     │
│       ▼                                                     │
│  Convex validates JWT (auth.config.ts, signature, exp)      │
│       │                                                     │
│       ▼                                                     │
│  handler: const userId = await getCurrentUserId(ctx)        │
└─────────────────────────────────────────────────────────────┘
```

---

## JWT shape

| Claim | Value | Notes |
|-------|--------|--------|
| `sub` | `user._id` | Used by `getCurrentUserId()` |
| `iss` | `https://www.openvouchers.org` | Must match `auth.config.ts` |
| `aud` | `open-voucher` | Must match `applicationID` |
| `exp` | 30d (configurable) | No DB session; re-login via Telegram refreshes |
| `iat` | now | Standard |

Optional later: `authMethod: "telegram"` (for debugging only — not for authorization).

---

## Phase 1: Keys + Convex auth config

### 1.1 Generate RSA keypair

```bash
openssl genpkey -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -pubout -out public.pem -in private.pem
# Convert public key to JWK (one-time script with jose) → embed in auth.config.ts
```

### 1.2 Convex env

```bash
npx convex env set JWT_PRIVATE_KEY "$(cat private.pem)"
```

Store `private.pem` only in Convex env (and your password manager for rotation). Never commit.

### 1.3 New: `packages/backend/convex/auth.config.ts`

```ts
import type { AuthConfig } from "convex/server";

// Base64-encoded JWKS JSON (generate once, commit this file)
const JWKS_BASE64 = "eyJrZXlzIjpbLi4uXX0=";
const jwks = `data:application/json;base64,${JWKS_BASE64}`;

export default {
  providers: [
    {
      type: "customJwt",
      applicationID: "open-voucher",
      issuer: "https://www.openvouchers.org",
      jwks,
      algorithm: "RS256",
    },
  ],
} satisfies AuthConfig;
```

Deploy/dev sync after adding: `npx convex dev` or deploy.

### 1.4 Dependency

```bash
cd packages/backend && bun add jose
```

### 1.5 New: `packages/backend/convex/lib/jwt.ts`

Shared signing helper (used from HTTP actions now; Google route later).

```ts
import * as jose from "jose";
import type { Id } from "../_generated/dataModel";

const ISSUER = "https://www.openvouchers.org";
const AUDIENCE = "open-voucher";
const KID = "open-voucher-key-1";
export const JWT_EXPIRY = "30d";

export async function issueJwt(userId: Id<"users">): Promise<string> {
  const privateKeyPem = process.env.JWT_PRIVATE_KEY;
  if (!privateKeyPem) throw new Error("JWT_PRIVATE_KEY not configured");

  const privateKey = await jose.importPKCS8(privateKeyPem, "RS256");

  return await new jose.SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(privateKey);
}
```

---

## Phase 2: Backend — issue JWT instead of session

### 2.1 Replace `createSessionForTelegramUser`

**Before** (`auth.ts`): revoke sessions, insert `userSessions`, return `sessionToken`.

**After:** internal mutation only loads user — no DB session.

```ts
// packages/backend/convex/auth.ts
export const getUserForTelegramAuth = internalMutation({
  args: { telegramChatId: v.string() },
  handler: async (ctx, { telegramChatId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_chat_id", (q) => q.eq("telegramChatId", telegramChatId))
      .first();

    if (!user) return null;

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

### 2.2 Update `http.ts` telegram-auth handler

**Before:**

```ts
const result = await ctx.runMutation(
  internal.auth.createSessionForTelegramUser,
  { telegramChatId },
);
// returns { user, sessionToken, expiresAt }
```

**After:**

```ts
import { issueJwt } from "./lib/jwt";

const user = await ctx.runMutation(
  internal.auth.getUserForTelegramAuth,
  { telegramChatId },
);

if (!user) {
  return new Response(
    JSON.stringify({ error: "User not found. Please start the bot first." }),
    { status: 404, headers: corsHeaders },
  );
}

const jwt = await issueJwt(user._id);

return new Response(
  JSON.stringify({ user, jwt }),
  { status: 200, headers: corsHeaders },
);
```

### 2.3 Dev auth

`devAuth` mutation cannot access `JWT_PRIVATE_KEY` signing cleanly in all setups — mirror Telegram with HTTP:

**New route:** `POST /api/dev-auth` (development only)

- Check `ENVIRONMENT === "development"`
- Resolve `DEV_TELEGRAM_CHAT_ID` user (same as today’s `devAuth`)
- `issueJwt(user._id)` → `{ jwt, user }`

**Client localhost branch:** `fetch('/api/dev-auth')` instead of `convex.mutation(api.auth.devAuth)`.

---

## Phase 3: Backend — `getCurrentUserId` + refactor functions

### 3.1 New helper in `auth.ts`

```ts
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export async function getCurrentUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: not authenticated");
  }
  return identity.subject as Id<"users">;
}
```

### 3.2 Keep `userQuery` / `userMutation` — change how they resolve the user

You do **not** need to convert every function to plain `query`/`mutation`. Keep the existing wrappers and handlers (`handler: async (ctx, { userId }) => { ... }`); only change the **wrapper implementation** in `auth.ts` to read the JWT instead of `sessionToken`.

**Before** (`auth.ts`):

```ts
export const userQuery = customQuery(query, {
  args: { sessionToken: v.string() },
  input: async (ctx, { sessionToken }) => {
    const userId = await verifyUserSession(ctx, sessionToken);
    return { ctx: {}, args: { userId } };
  },
});

export const userMutation = customMutation(mutation, {
  args: { sessionToken: v.string() },
  input: async (ctx, { sessionToken }) => {
    const userId = await verifyUserSession(ctx, sessionToken);
    return { ctx: {}, args: { userId } };
  },
});
```

**After** (`auth.ts`):

```ts
export const userQuery = customQuery(query, {
  args: {},
  input: async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    return { ctx: {}, args: { userId } };
  },
});

export const userMutation = customMutation(mutation, {
  args: {},
  input: async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    return { ctx: {}, args: { userId } };
  },
});
```

**`users.ts` / `vouchers.ts` stay the same** — no handler rewrites:

```ts
import { userQuery } from "./auth";

export const getTransactionHistory = userQuery({
  args: {},
  handler: async (ctx, { userId }) => {
    // unchanged
  },
});
```

The **9** `userQuery` / `userMutation` exports in `users.ts` (3) and `vouchers.ts` (6) only lose `sessionToken` from the **client** call sites, not from handler signatures.

### 3.3 Add reactive `getCurrentUser`

Fixes stale `coins` on home screen (currently `staleTime: Infinity` in TanStack auth).

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

Public `userQuery` is fine — callers without a JWT get unauthorized; `userId` always comes from `identity.subject`, never from client args.

### 3.4 Remove session-only exports

Delete from `auth.ts`:

- `validateSession`
- `logoutUser` (unused in web today; client logout = clear `localStorage`)
- `createSessionForTelegramUser`
- `cleanupExpiredUserSessions`
- `verifyUserSession`
- `revokeAllUserSessions`

Keep **`userQuery` / `userMutation`** (rewired to JWT — see §3.2).

Remove cron in `crons.ts`:

```ts
// DELETE this block
crons.daily("cleanup user sessions", ..., internal.auth.cleanupExpiredUserSessions);
```

### 3.5 Schema: remove `userSessions`

```ts
// DELETE from schema.ts
userSessions: defineTable({ ... }),
```

After deploy, optionally run a one-off migration to delete orphaned `userSessions` rows (or leave table until Convex schema push drops it).

Remove from `constants.ts`:

- `USER_SESSION_DURATION_MS`
- `USER_SESSION_CLEANUP_BATCH_SIZE`

---

## Phase 4: Client

Split auth into three layers — no `window.location.reload()`, no monolithic `authenticate()` in one TanStack query.

| Layer | Tool | Responsibility |
|-------|------|----------------|
| JWT on the wire | `JwtAuthProvider` + `ConvexProviderWithAuth` | `fetchAccessToken` reads React state (synced with `localStorage`) |
| Login bootstrap | TanStack `useQuery` (`useAuthBootstrap`) | HTTP → JWT once when `jwt` state is null |
| User profile | Convex `useQuery` (`getCurrentUser`) | Reactive `coins`, name, ban flag |
| App hook | `useUserAuth` | Composes the above; same API for `app.tsx` |

### 4.1 New: `apps/web/src/auth/jwtStorage.ts`

```ts
import { getDeployment } from "@/components/EnvironmentDropdown";
import { CONVEX_SITE_URLS } from "@/lib/convexConfig";

export function getJwtKey() {
  return `jwt-${getDeployment()}`;
}

export function readStoredJwt(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(getJwtKey());
}

export function writeStoredJwt(jwt: string) {
  localStorage.setItem(getJwtKey(), jwt);
}

export function clearStoredJwt() {
  localStorage.removeItem(getJwtKey());
}

function getSiteUrl() {
  return CONVEX_SITE_URLS[getDeployment()] ?? CONVEX_SITE_URLS.prod;
}

/** Fetch JWT from HTTP (Telegram or dev). Persists to localStorage. */
export async function fetchJwt(): Promise<string> {
  const existing = readStoredJwt();
  if (existing) return existing;

  if (window.location.hostname === "localhost") {
    const res = await fetch(`${getSiteUrl()}/api/dev-auth`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Dev auth failed");
    writeStoredJwt(data.jwt);
    return data.jwt;
  }

  const tg = (window as any).Telegram?.WebApp;
  if (!tg?.initData) {
    throw new Error("Open this page in Telegram");
  }

  const res = await fetch(`${getSiteUrl()}/api/telegram-auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: tg.initData }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Authentication failed");

  writeStoredJwt(data.jwt);
  return data.jwt;
}
```

### 4.2 New: `apps/web/src/auth/JwtAuthProvider.tsx`

React state drives `ConvexProviderWithAuth` so login can call `setJwt` without a page reload.

```tsx
import { ConvexProviderWithAuth, type ConvexReactClient } from "convex/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getJwtKey, readStoredJwt } from "./jwtStorage";

type JwtAuthContextValue = {
  jwt: string | null;
  setJwt: (jwt: string | null) => void;
};

const JwtAuthContext = createContext<JwtAuthContextValue | null>(null);

export function useJwtAuth() {
  const ctx = useContext(JwtAuthContext);
  if (!ctx) throw new Error("useJwtAuth must be used within JwtAuthProvider");
  return ctx;
}

function useConvexAuthFromJwt() {
  const { jwt } = useJwtAuth();
  return useMemo(
    () => ({
      isLoading: false,
      isAuthenticated: !!jwt,
      fetchAccessToken: async () => jwt,
    }),
    [jwt],
  );
}

export function JwtAuthProvider({
  client,
  children,
}: {
  client: ConvexReactClient;
  children: ReactNode;
}) {
  const [jwt, setJwtState] = useState<string | null>(() => readStoredJwt());

  const setJwt = useCallback((value: string | null) => {
    setJwtState(value);
    if (value) localStorage.setItem(getJwtKey(), value);
    else localStorage.removeItem(getJwtKey());
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === getJwtKey()) setJwtState(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <JwtAuthContext.Provider value={{ jwt, setJwt }}>
      <ConvexProviderWithAuth client={client} useAuth={useConvexAuthFromJwt}>
        {children}
      </ConvexProviderWithAuth>
    </JwtAuthContext.Provider>
  );
}
```

### 4.3 `router.tsx` — use `JwtAuthProvider`

**Before:**

```tsx
<ConvexProvider client={convexQueryClient.convexClient}>
  {children}
</ConvexProvider>
```

**After:**

```tsx
import { JwtAuthProvider } from "@/auth/JwtAuthProvider";

<JwtAuthProvider client={convex}>
  {children}
</JwtAuthProvider>
```

Keep `ConvexQueryClient` / TanStack `QueryClient` as today — still used for the login bootstrap query.

### 4.4 New: `apps/web/src/hooks/useAuthBootstrap.ts`

TanStack `useQuery` for one-shot login (not Convex — no JWT on the socket yet).

```ts
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchJwt } from "@/auth/jwtStorage";
import { useJwtAuth } from "@/auth/JwtAuthProvider";
import { getDeployment } from "@/components/EnvironmentDropdown";

export function useAuthBootstrap() {
  const { jwt, setJwt } = useJwtAuth();

  const bootstrap = useQuery({
    queryKey: ["auth", "bootstrap", getDeployment()] as const,
    queryFn: fetchJwt,
    enabled: !jwt,
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (bootstrap.data) setJwt(bootstrap.data);
  }, [bootstrap.data, setJwt]);

  return bootstrap;
}
```

### 4.5 Rewrite `useUserAuth.ts` — thin composer

**Before:** one TanStack `useQuery` → `authenticate()` → user + `sessionToken`, `staleTime: Infinity`.

**After:**

```ts
import { api } from "@open-voucher/backend/convex/_generated/api";
import type { Id } from "@open-voucher/backend/convex/_generated/dataModel";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthBootstrap } from "./useAuthBootstrap";

export type AppUser = {
  _id: Id<"users">;
  telegramChatId: string;
  firstName: string | undefined;
  username: string | undefined;
  coins: number;
  isBanned: boolean;
};

export function useUserAuth() {
  const { isAuthenticated, isLoading: convexAuthLoading } = useConvexAuth();
  const bootstrap = useAuthBootstrap();

  // Only "skip" in the app: this hook runs in app.tsx during bootstrap, before JWT exists
  const user = useQuery(
    api.users.getCurrentUser,
    isAuthenticated ? {} : "skip",
  );

  const isLoading =
    convexAuthLoading ||
    bootstrap.isLoading ||
    (isAuthenticated && user === undefined);

  return {
    user: (user ?? null) as AppUser | null,
    isLoading,
    error: bootstrap.error ?? null,
  };
}
```

`app.tsx` keeps `{ user, isLoading, error }`. No `sessionToken` on the user type. Drop `isAuthenticated` from the return value — routes under `/app` only mount after `user` is set.

### 4.6 Route files — drop `sessionToken` (no `"skip"`)

`app.tsx` already gates `<Outlet />` on `user`, so child routes assume auth. Use plain Convex `useQuery` — **`userQuery` is server-only**; the client always calls `useQuery(api.…)`.

**Before** (`my-claims.tsx`):

```tsx
const claims = useQuery(
  api.vouchers.getMyClaimedVouchers,
  user ? { sessionToken: user.sessionToken } : "skip",
);

returnVoucher({ sessionToken: user!.sessionToken, voucherId: item._id });
```

**After:**

```tsx
const claims = useQuery(api.vouchers.getMyClaimedVouchers);

returnVoucher({ voucherId: item._id });
```

Empty `args` on the backend → omit the second argument (no `{}`, no `"skip"`).

Files to update:

| File | Changes |
|------|---------|
| `apps/web/src/auth/jwtStorage.ts` | **Create** — `fetchJwt`, storage helpers |
| `apps/web/src/auth/JwtAuthProvider.tsx` | **Create** — JWT context + `ConvexProviderWithAuth` |
| `apps/web/src/hooks/useAuthBootstrap.ts` | **Create** — TanStack login `useQuery` |
| `apps/web/src/hooks/useUserAuth.ts` | **Rewrite** — compose bootstrap + Convex `getCurrentUser` |
| `apps/web/src/router.tsx` | `JwtAuthProvider` instead of `ConvexProvider` |
| `apps/web/src/routes/app/my-claims.tsx` | `useQuery(api.…)` only — no `sessionToken`, no `"skip"` |
| `apps/web/src/routes/app/my-uploads.tsx` | Same |
| `apps/web/src/routes/app/transactions.tsx` | Same (+ optional: replace TanStack `convex.query` with Convex `useQuery`) |
| `apps/web/src/routes/app/availability.tsx` | Same |
| `apps/web/src/routes/app/feedback.tsx` | Same |
| `apps/web/src/routes/app/index.tsx` | `user.coins` from reactive `getCurrentUser` |

Remove `UserSession` / `sessionToken` from client types.

---

## Phase 5: Logout (client-only)

No server session to delete.

```ts
import { clearStoredJwt } from "@/auth/jwtStorage";
import { useJwtAuth } from "@/auth/JwtAuthProvider";

export function useLogout() {
  const { setJwt } = useJwtAuth();
  return () => setJwt(null);
}
```

Wire up if/when you add a logout button. `setJwt(null)` clears storage and disconnects authenticated Convex calls without a full reload.

---

## Future: Google (not in this migration)

Add `POST /api/google-auth`:

1. Verify Google ID token (or OAuth code exchange).
2. `findOrCreateUser` / link accounts (new logic).
3. `issueJwt(user._id)` — **same function, same client storage key, same `getCurrentUserId`**.

No changes to `userQuery`/`userMutation` handler shapes or `ConvexProviderWithAuth`.

---

## Migration checklist

| Step | Task |
|------|------|
| 1 | Generate keys, set `JWT_PRIVATE_KEY`, add `auth.config.ts` |
| 2 | Add `lib/jwt.ts`, `bun add jose` |
| 3 | HTTP: telegram-auth returns `jwt`; add dev-auth HTTP route |
| 4 | Add `getCurrentUserId`, `getCurrentUser` |
| 5 | Rewire `userQuery`/`userMutation` in `auth.ts`; client drops `sessionToken` only |
| 6 | Remove session exports, cron, schema table |
| 7 | Client: `JwtAuthProvider`, `jwtStorage`, `useAuthBootstrap`, `useUserAuth` |
| 8 | Client: update 6 route files (`useQuery(api.…)` only, no `"skip"`) |
| 9 | `npx convex dev` — regenerate types, fix TS errors |
| 10 | Test Telegram + localhost dev flows |

---

## Testing

- [ ] Fresh user: open mini app → bot creates user → auth returns JWT → home shows coins
- [ ] Return visit: JWT in localStorage → no telegram-auth call → queries work
- [ ] Expired / invalid JWT: clear or corrupt token → re-auth via Telegram
- [ ] Localhost: `/api/dev-auth` issues JWT
- [ ] Claim / return voucher: mutations work without `sessionToken`
- [ ] Banned user: can still authenticate; restricted actions fail with ban check (unchanged)
- [ ] Deploy preview + prod: correct `JWT_PRIVATE_KEY` per deployment (or shared key with same issuer)

---

## Risks

| Risk | Mitigation |
|------|------------|
| `auth.config.ts` mismatch | `iss` / `aud` / `kid` must match `issueJwt` exactly |
| JWT not picked up after login | `setJwt` via `JwtAuthProvider` after bootstrap (no reload) |
| Old `user-session-*` keys orphaned | Harmless; optionally clear on first load |
| Private key leak | Convex env only; rotate keys + JWKS if compromised |
| Stolen JWT valid until `exp` | Accept for now; shorten `exp` if needed |

---

## Estimated effort

| Area | Time |
|------|------|
| Keys + auth.config + jwt helper | 45 min |
| HTTP + backend refactor | 2–3 h |
| Client auth modules + useUserAuth | 1–2 h |
| Route cleanup + types | 1 h |
| Testing | 1 h |
| **Total** | **~6 hours** |

---

## Files touched (summary)

| File | Action |
|------|--------|
| `packages/backend/convex/auth.config.ts` | **Create** |
| `packages/backend/convex/lib/jwt.ts` | **Create** |
| `packages/backend/convex/auth.ts` | **Rewrite** — remove sessions, add `getCurrentUserId`, `getUserForTelegramAuth` |
| `packages/backend/convex/http.ts` | **Modify** — JWT response, dev-auth route |
| `packages/backend/convex/users.ts` | **Modify** — add `getCurrentUser` (handlers unchanged) |
| `packages/backend/convex/vouchers.ts` | **Modify** — handlers unchanged |
| `packages/backend/convex/schema.ts` | **Modify** — remove `userSessions` |
| `packages/backend/convex/crons.ts` | **Modify** — remove user session cron |
| `packages/backend/convex/constants.ts` | **Modify** — remove session constants |
| `apps/web/src/auth/jwtStorage.ts` | **Create** |
| `apps/web/src/auth/JwtAuthProvider.tsx` | **Create** |
| `apps/web/src/hooks/useAuthBootstrap.ts` | **Create** |
| `apps/web/src/router.tsx` | **Modify** — `JwtAuthProvider` |
| `apps/web/src/hooks/useUserAuth.ts` | **Rewrite** |
| `apps/web/src/routes/app/*.tsx` | **Modify** — 6 files |
| `package.json` / backend | **Add** `jose` |
