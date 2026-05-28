# Plan: JWT-Based Convex Auth Integration

## Problem

The current auth system passes `sessionToken` as a regular query/mutation argument, bypassing Convex's built-in auth pipeline entirely. Convex has a first-class auth mechanism where:

1. A JWT is passed via the WebSocket connection automatically
2. The backend validates it via `auth.config.ts`
3. Functions access user identity via `ctx.auth.getUserIdentity()`

By not using this, every function must declare `sessionToken` in its args, every call site must pass it, and the `userQuery`/`userMutation` wrappers manually validate it — reinventing what Convex already does natively.

## Goals

1. **No `sessionToken` in function args** — auth flows through Convex's auth pipeline
2. **Reactive user data** — `useQuery` pushes updates live (solves stale `coins`)
3. **Backend functions use `ctx.auth.getUserIdentity()`** — standard Convex pattern
4. **Telegram auth flow still works** — initData verification in HTTP action, JWT issuance, client stores JWT

## Architecture overview

```
┌─────────────────────────────────────────────────────────┐
│  AUTHENTICATION (once, at login)                        │
│                                                         │
│  Client ──POST initData──▶ /api/telegram-auth           │
│                              │                          │
│                              ├─ verify HMAC             │
│                              ├─ find/create user         │
│                              └─ issue signed JWT         │
│  Client ◀──{ jwt }─────────                             │
│  Client: localStorage.set("jwt", jwt)                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  ONGOING REQUESTS (automatic)                           │
│                                                         │
│  ConvexProviderWithAuth                                 │
│    └─ fetchAccessToken() → jwt from localStorage        │
│       └─ sent as Authorization: Bearer <jwt>            │
│                                                         │
│  Backend:                                               │
│    auth.config.ts validates JWT (signature, expiry)     │
│    ctx.auth.getUserIdentity() → { sub: userId, ... }    │
│                                                         │
│  Functions: no sessionToken arg needed                  │
└─────────────────────────────────────────────────────────┘
```

## Prerequisite: understand the two sub-choices

The key difference is **how the JWT gets signed and validated:**

| | Choice 1: Self-signed JWTs | Choice 2: @convex-dev/auth |
|---|---|---|
| JWT signing | Your HTTP action signs with a private key | Library handles signing internally |
| JWT validation | `customJwt` provider in `auth.config.ts` with embedded public key | Library handles validation internally |
| Session management | You keep `userSessions` table for revocation | Library has its own `authSessions` table |
| Dependencies | `jose` (lightweight JWT library) | `@convex-dev/auth` |
| Control | Full control over JWT claims, expiry, refresh | Library conventions (good defaults, less flexibility) |
| Telegram provider | Custom (you wire it up) | Custom provider (less documented) |

Both achieve the same end result: `sessionToken` disappears from function args, `ctx.auth.getUserIdentity()` works.

---

## Choice 1: Self-Signed JWTs

### Step 1: Generate a keypair

```bash
# Generate RSA private key
openssl genpkey -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:2048

# Extract public key in JWK format
# (use a script or jose library to convert PEM → JWK)
```

Store the private key as a Convex environment variable (`JWT_PRIVATE_KEY`). The public key gets embedded directly in `auth.config.ts` as a `data:` URI (no JWKS server needed).

### Step 2: Create `convex/auth.config.ts`

```ts
import { AuthConfig } from "convex/server";

// Pre-compute: JSON.stringify(yourJWKS) → base64 encode → paste below
// Generate with: echo -n '{"keys":[...]}' | base64 -w0
const JWKS_BASE64 =
  "eyJrZXlzIjpbeyJrdHkiOiJSU0EiLCJuIjoiPHlvdXItbW9kdWx1cz4iLCJlIjoiQVFBQiIsImFsZyI6IlJTMjU2Iiwia2lkIjoib3Blbi12b3VjaGVyLWtleS0xIn1dfQ==";

const jwks = `data:application/json;base64,${JWKS_BASE64}`;

export default {
  providers: [
    {
      type: "customJwt",
      applicationID: "open-voucher",
      issuer: "https://openvouchers.org",
      jwks,
      algorithm: "RS256",
    },
  ],
} satisfies AuthConfig;
```

> Run `npx convex deploy` after adding this — `auth.config.ts` syncs to the Convex backend.

### Step 3: Issue JWTs in the HTTP action

Replace the random UUID session token with a signed JWT in `convex/http.ts`:

```ts
// convex/http.ts — inside the /api/telegram-auth handler
import * as jose from "jose";

// After verifying initData and finding/creating user:
const privateKey = await jose.importPKCS8(
  process.env.JWT_PRIVATE_KEY!,
  "RS256",
);

const jwt = await new jose.SignJWT({
  // Custom claims — accessible via ctx.auth.getUserIdentity()
  telegramChatId: String(telegramUser.id),
})
  .setProtectedHeader({ alg: "RS256", kid: "open-voucher-key-1" })
  .setSubject(String(user._id))           // → identity.subject
  .setIssuer("https://openvouchers.org")  // must match auth.config.ts
  .setAudience("open-voucher")            // must match applicationID
  .setIssuedAt()
  .setExpirationTime("30d")
  .sign(privateKey);

// Return JWT to client instead of sessionToken
return new Response(
  JSON.stringify({ jwt, user: { ... } }),
  { status: 200, headers: corsHeaders },
);
```

> **Note:** The `userSessions` table can still exist for session tracking/revocation. Store the JWT's `jti` claim in it if you want to be able to invalidate specific tokens.

### Step 4: Client-side — store JWT + `ConvexProviderWithAuth`

**Update `router.tsx`:**

```tsx
import { ConvexProviderWithAuth } from "convex/react";

function useAuthFromStorage() {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(`jwt-${getDeployment()}`);
  });

  // Listen for storage changes (e.g., login in another tab)
  useEffect(() => {
    const handler = () => {
      setToken(localStorage.getItem(`jwt-${getDeployment()}`));
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return useMemo(
    () => ({
      isLoading: false,
      isAuthenticated: token !== null,
      fetchAccessToken: async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
        if (forceRefreshToken) {
          // If token expired, trigger re-auth (or refresh if implemented)
          const newToken = await refreshAuth();
          return newToken;
        }
        return token;
      },
    }),
    [token],
  );
}

// Replace ConvexProvider with:
<ConvexProviderWithAuth client={convex} useAuth={useAuthFromStorage}>
  {children}
</ConvexProviderWithAuth>
```

**Update `useUserAuth.ts`:**

The hook simplifies dramatically:

```ts
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@open-voucher/backend/convex/_generated/api";

export function useUserAuth() {
  const { isLoading, isAuthenticated } = useConvexAuth();

  // Reactive user data — no sessionToken arg needed!
  const userData = useQuery(
    api.users.getCurrentUser,
    isAuthenticated ? {} : "skip",
  );

  return {
    user: userData ?? null,
    isLoading,
    isAuthenticated,
  };
}
```

> `useConvexAuth()` replaces the manual TanStack Query auth call. Convex manages the auth lifecycle: loading → authenticated/unauthenticated.

### Step 5: Backend — use `ctx.auth.getUserIdentity()`

Replace `userQuery`/`userMutation` wrappers with a helper that reads from `ctx.auth`:

```ts
// New helper: convex/auth.ts
import type { QueryCtx, MutationCtx } from "./_generated/server";

export async function getCurrentUserId(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: not authenticated");
  }
  // identity.subject is the userId (set via setSubject() in JWT)
  return identity.subject as Id<"users">;
}
```

Then refactor functions:

```ts
// Before:
export const getMyClaimedVouchers = userQuery({
  args: {},
  handler: async (ctx, { userId }) => { ... },
});

// After:
export const getMyClaimedVouchers = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    // ... rest of logic
  },
});
```

No `userQuery` wrapper needed anymore — the auth is handled by Convex before the function even runs.

### Step 6: Dev auth

The dev override in `useUserAuth.ts` currently calls `convex.mutation(api.auth.devAuth, {})`. This needs to become a flow that also returns a JWT:

- Option A: Create an HTTP endpoint `/api/dev-auth` that returns a JWT (mirrors the Telegram auth endpoint)
- Option B: Have the `devAuth` mutation return a JWT (requires JWT signing to be available in mutations — it's not, actions only)
- Option C: Use an action or HTTP endpoint

### Files changed (Choice 1)

| File | Action |
|------|--------|
| `convex/auth.config.ts` | **Create** — customJwt provider config |
| `convex/http.ts` | **Modify** — issue JWT instead of sessionToken |
| `convex/auth.ts` | **Modify** — add `getCurrentUserId()` helper, remove `userQuery`/`userMutation` (or keep as thin wrappers) |
| `convex/users.ts` | **Modify** — all `userQuery`/`userMutation` → plain `query`/`mutation` with `getCurrentUserId()` |
| `convex/vouchers.ts` | **Modify** — same refactor |
| `convex/_generated/api.d.ts` | **Regenerated** — arg types change (no more `sessionToken`) |
| `apps/web/src/router.tsx` | **Modify** — `ConvexProvider` → `ConvexProviderWithAuth` |
| `apps/web/src/hooks/useUserAuth.ts` | **Rewrite** — use `useConvexAuth()` + reactive `useQuery` |
| `apps/web/src/routes/app/*.tsx` | **Modify** — remove all `sessionToken` args |
| Environment variables | Add `JWT_PRIVATE_KEY` |
| `package.json` | Add `jose` dependency |

---

## Choice 2: `@convex-dev/auth` Library

### Step 1: Install

```bash
bun add @convex-dev/auth
```

### Step 2: Create `convex/auth.ts` with custom Telegram provider

```ts
// convex/auth.ts
import { convexAuth } from "@convex-dev/auth/server";
import { customProvider } from "@convex-dev/auth/server/providers";

const TelegramProvider = customProvider({
  id: "telegram",
  // The library needs to know how to verify and upsert users
  // This is less documented for fully custom flows
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [TelegramProvider],
  // Optional: session config, JWT custom claims
});
```

> **⚠️ Caveat:** `@convex-dev/auth`'s custom provider API is less mature than its built-in OAuth/password providers. The library primarily targets email magic links, OAuth (GitHub/Google), and passwords. For a fully custom Telegram flow, you may need to work around the library's assumptions.

### Step 3: Telegram auth via the library

Instead of an HTTP action, create a mutation that the library can use:

```ts
// convex/auth.ts
export const telegramSignIn = mutation({
  args: { initData: v.string() },
  handler: async (ctx, { initData }) => {
    // Verify initData (existing logic)
    const telegramUser = await verifyTelegramInitDataRaw(initData);
    // Find or create user (existing logic)
    const user = await findOrCreateUser(ctx, telegramUser);
    // Library creates session, JWT, returns to client
    return await signIn(ctx, {
      provider: "telegram",
      // Custom claims
    });
  },
});
```

### Step 4: Client-side

The library provides React bindings:

```tsx
import { ConvexAuthProvider } from "@convex-dev/auth/react";

// Replace ConvexProvider with:
<ConvexAuthProvider client={convex}>
  {children}
</ConvexAuthProvider>
```

```ts
import { useConvexAuth } from "@convex-dev/auth/react";
import { useAuthActions } from "@convex-dev/auth/react";

const { isLoading, isAuthenticated } = useConvexAuth();
const { signIn, signOut } = useAuthActions();
```

### Files changed (Choice 2)

Similar scope to Choice 1, but:
- `convex/auth.config.ts` — handled by the library (no manual config)
- `convex/auth.ts` — rewritten with `convexAuth()` setup
- Additional dependency, less transparent key management
- Session cleanup handled by the library's cron

---

## Comparison summary

| | Choice 1: Self-signed | Choice 2: @convex-dev/auth |
|---|---|---|
| **Effort** | ~1 day | ~1-2 days (custom provider gaps) |
| **Dependencies** | `jose` only | `@convex-dev/auth` |
| **Transparency** | Full control over JWT | Library manages keys/sessions |
| **Telegram fit** | Good — HTTP action naturally issues JWT | Awkward — library expects OAuth/OIDC/password flows |
| **Session revocation** | Keep `userSessions` table | Library's built-in session management |
| **Token refresh** | Manual (e.g., on 401, re-auth via Telegram) | Library handles refresh internally |
| **Dev auth** | Mirrors Telegram flow (HTTP endpoint) | Library mutation |
| **Future-proofing** | Standard Convex pattern | Library may add better custom provider support |

## Recommendation

**Choice 1 (self-signed JWTs)** is the better fit for this project because:

1. Telegram auth is a fully custom flow — it doesn't map to any standard auth provider
2. You already have an HTTP action handling the Telegram handshake — adding JWT signing is a natural extension
3. The `@convex-dev/auth` library would fight you on the custom Telegram provider
4. Self-signed JWTs with embedded `data:` URI for JWKS is a documented Convex pattern for custom auth
5. Full control over claims, expiry, and sessions

## Risks (both choices)

| Risk | Mitigation |
|------|------------|
| JWT private key leaked | Use Convex environment variables, rotate keys periodically |
| Token expiry during use | Implement refresh (re-auth via Telegram) or set long expiry (30d) |
| `auth.config.ts` misconfig | Test with `npx convex dev` first; auth errors are descriptive |
| Breaking change for all call sites | Can be done incrementally: add new functions, migrate old ones, delete old ones |
| Telegram WebApp refreshes lose auth | JWT in `localStorage` survives page refreshes (same as current `sessionToken`) |
| TypeScript: `_args` change in generated API | Run `npx convex dev` to regenerate after removing `sessionToken` from args |

## Migration path

1. Set up keypair + `auth.config.ts`
2. Add JWT issuance to HTTP action (alongside existing `sessionToken` — dual return)
3. Add `ConvexProviderWithAuth` (while old `ConvexProvider` still works)
4. Add `getCurrentUserId()` helper + refactor one function at a time
5. Once all functions are migrated, remove `userQuery`/`userMutation` wrappers
6. Remove `sessionToken` from client code
7. Clean up `userSessions` table (optional — keep for audit/revocation)

## Estimated effort

| Task | Choice 1 | Choice 2 |
|------|----------|----------|
| Keypair + auth.config.ts | 30 min | N/A (library handles) |
| JWT signing in HTTP action | 1 hour | N/A |
| ConvexProviderWithAuth + client | 1 hour | 1 hour |
| Backend function refactor | 2 hours | 2 hours |
| Client call site cleanup | 1 hour | 1 hour |
| Dev auth flow | 30 min | 30 min |
| Testing | 1 hour | 1 hour |
| **Total** | **~7 hours** | **~5.5 hours** |

> Choice 1's extra time is the JWT signing setup; the payoff is full control and better Telegram fit.
