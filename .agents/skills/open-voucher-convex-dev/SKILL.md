---
name: open-voucher-convex-dev
description: Verify Convex backend changes against the dev deployment before deploying — deploy mechanics, stale-deployment diagnosis, and how to run locally.
---

## Purpose
Verify that a Convex backend change works against the **dev** deployment before it ever reaches prod, and diagnose when the deployment is running stale code. Avoids accidentally targeting prod and saves time on "UI is broken but the code is right" confusion.

## Prerequisites
- `bun` installed (root `bun install` first)
- Convex CLI available (`npx convex` or `bunx convex`)
- Doppler configured with the `open-voucher` project (dev/prd configs)
- Repo at `/home/tom/toms_code/open-voucher`

## Local dev

Run **everything** from the repo root with one command:

```bash
bun run dev
```

This runs `turbo dev`, which starts all workspaces in parallel:
- `apps/web` → Vite dev server at `http://localhost:3001`
- `packages/backend` → `convex dev`, which **deploys and pushes your code to the dev deployment automatically** and watches for changes.

`bun run dev` is the correct local dev invocation. You do NOT need to start the web server and `convex dev` as separate manual steps — Turbo handles both.

## Deployment targets

| Deployment | Convex URL | Config source |
|---|---|---|
| dev | `fastidious-okapi-116` | `CONVEX_DEPLOYMENT` in `packages/backend/.env.local` |
| prod | `whimsical-kudu-895` | the deploy command's default |

## Deploying backend code to dev

To push a backend change to the DEV deployment (e.g. to test in the admin UI or via `npx convex run`):

```bash
cd packages/backend && npx convex dev
```

Run this in the background and watch for the readiness line:
```
✔ <time> Convex functions ready!
```

### Critical pitfall: codegen does NOT deploy
`npx convex codegen` **only regenerates local TypeScript bindings** — it does not upload your functions. Codegen succeeding does not mean the deployment has your new code. To actually deploy to dev, use `npx convex dev`.

### Critical pitfall: plain `convex deploy` targets PROD
When `CONVEX_DEPLOYMENT` is set in `.env.local`, running `npx convex deploy` (no flags) prompts to push to the **production** deployment (`whimsical-kudu-895`). In a non-interactive terminal it fails rather than hanging, but do not attempt it. The dev path is `npx convex dev`.

## Admin tokens are per-deployment
A token minted against dev is rejected by prod with `Unauthorized: Invalid session token`, and vice versa. When running functions with a token, match the deployment flag to where the token came from:
- Dev token → **omit** `--prod` (dev is the default).
- Prod token → include `--prod`.

## Diagnosing a stale deployment

Signs the deployment is running OLD code (not a frontend bug):
- A UI renders wrong — e.g. every eval card shows `Mismatch` even when Expected == Predicted.
- A `npx convex run` result is missing fields you just added — e.g. `adminEvals:runIntentEvals` has no `escalate` / `escalateCorrect` keys.

Fix:
1. Inspect raw action output first — `npx convex run <fn> '{"token":"..."}'` — before debugging any frontend.
2. Deploy to dev (`npx convex dev`), wait for `Convex functions ready!`.
3. Re-run the action / re-test the UI.

## Output Format
When done, report: which deployment the code was verified against, the `convex run` / UI result, and confirm prod was untouched.