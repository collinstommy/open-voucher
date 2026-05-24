# Open Voucher

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Start** - SSR framework with TanStack Router
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Reusable UI components
- **Convex** - Reactive backend-as-a-service platform
- **Turborepo** - Optimized monorepo build system

## Getting Started

Then, run the development server:

```bash
bun run dev
```

This will start:

- Admin dashboard at [http://localhost:3001](http://localhost:3001)
- Convex backend for the bot (`convex dev` syncs the **development** deployment)

## Project Structure

```
open-voucher/
├── apps/
│   └── web/         # Frontend (React + TanStack Start) on Cloudflare Workers
├── packages/
│   └── backend/     # Convex backend functions and schema
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start web + Convex dev server |
| `bun run dev:web` | Web only (localhost:3001) |
| `bun run dev:server` | Convex dev only (`convex dev`) |
| `bun run build` | Production build (all packages) |
| `bun run check-types` | TypeScript across the monorepo |
| `bun run deploy:web` | Deploy **production** web worker |
| `bun run deploy:web:dev` | Deploy **dev** web worker (mini app testing) |
| `bun run deploy:backend` | Deploy Convex **production** + register prod bot commands |
| `bun run deploy:backend:dev` | Register bot commands on **dev** Convex |
| `bun run deploy:dev` | Deploy dev worker + register dev bot commands |
| `bun run deploy:all` | Production web + backend deploy |

## Deployments

| Environment | Web | Convex | Telegram |
|-------------|-----|--------|----------|
| **Local** | `localhost:3001` | Dev deployment via `convex dev` | Optional dev bot |
| **Dev** | `dev.openvouchers.org` (CF Worker `open-voucher-web-dev`) | Dev deployment | Separate **dev bot** (Doppler `dev`) |
| **Production** | `openvouchers.org` (CF Worker `open-voucher-web`) | Production deployment | Production bot (Doppler `prd`) |

The dev web worker is built with `VITE_DEPLOYMENT=dev` and always talks to the dev Convex deployment. The admin environment switcher is hidden on that host.

**Convex note:** `convex deploy` updates the **production** deployment. The **development** deployment is updated by running `convex dev` (included in `bun run dev` / `bun run dev:server`). Keep `convex dev` running while testing the mini app against dev Convex.

### Dev mini app (first-time setup)

1. **Cloudflare** — Deploy the dev worker once, then attach the custom domain:
   ```bash
   bun run deploy:web:dev
   ```
   In the Cloudflare dashboard: **Workers & Pages** → `open-voucher-web-dev` → **Settings** → **Domains & Routes** → add `dev.openvouchers.org`.

2. **Doppler + Convex + webhook** — Use a separate dev bot token:
   ```bash
   ./manageWebhooks.sh dev
   ```
   This sets dev Convex env vars (including `MINI_APP_URL=https://dev.openvouchers.org/app`).

3. **BotFather** — On the **dev** bot, register the mini app URL `https://dev.openvouchers.org/app`.

4. **Bot commands** — After backend or command changes:
   ```bash
   bun run deploy:backend:dev
   ```
   Or as part of a full dev frontend deploy:
   ```bash
   bun run deploy:dev
   ```

### Day-to-day mini app development

```bash
# Terminal 1 — sync functions/schema to dev Convex
bun run dev:server

# Terminal 2 — local web (optional)
bun run dev:web

# When testing in Telegram on dev.openvouchers.org
bun run deploy:web:dev
```

### Production deploy

```bash
./manageWebhooks.sh prd   # when webhook or Convex secrets change
bun run deploy:all        # production web + convex deploy + prod commands
```

## Environment Setup

Secrets are managed in [Doppler](https://www.doppler.com/) and deployed to Convex using the webhook management script.

### Prerequisites

1. **Install Doppler CLI** — See [Doppler CLI documentation](https://docs.doppler.com/docs/install-cli)
2. **Login to Doppler:**
   ```bash
   doppler login
   doppler setup
   ```
3. A Google AI API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
4. Telegram bot token(s) from [@BotFather](https://t.me/botfather) — use a **separate bot** for dev and production
5. A Convex account and project

### Required Secrets (in Doppler)

| Secret | Description | Get From |
|--------|-------------|----------|
| `TELEGRAM_TOKEN` | Telegram bot authentication | [@BotFather](https://t.me/botfather) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API access | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook verification | Generate a random string |
| `ADMIN_PASSWORD` | Admin panel access | Set your own secure password |
| `CONVEX_WEBHOOK_URL` | Your Convex webhook URL | From Convex dashboard |

`MINI_APP_URL` is set automatically by `manageWebhooks.sh` (`https://dev.openvouchers.org/app` for dev, `https://openvouchers.org/app` for production).

### Setup Script

Run the webhook management script to configure everything at once:

```bash
# For development (dev bot + dev Convex)
./manageWebhooks.sh dev

# For production
./manageWebhooks.sh prd
```

This script will:

- Fetch secrets from Doppler
- Delete and set the Telegram webhook
- Configure environment variables in Convex (tokens, `ENVIRONMENT`, `MINI_APP_URL`, etc.)

### Register Telegram Bot Commands

| Environment | Command |
|-------------|---------|
| Dev | `bun run deploy:backend:dev` or `cd packages/backend && bunx convex run telegram:registerBotCommands` |
| Production | `bun run deploy:backend` (runs after `convex deploy`) |

This enables the command menu in Telegram with:

- `/help` — Show help menu
- `/balance` — Check your coin balance
- `/donate` — Support the project

### Sample/Test Voucher Setup

To set up the sample voucher image shown to users:

1. Go to your [Convex Dashboard](https://dashboard.convex.dev)
2. Upload `config/sample-voucher.png` and `config/test-voucher.png` to Storage. Note the storage IDs.
3. Navigate to: **Functions**
4. Run the function: `settings.setSetting`
5. Arguments: `{"key": "sample-voucher-image", "value": "<storage-id>"}`
6. Run the function: `settings.setSetting`
7. Arguments: `{"key": "test-voucher-image", "value": "<storage-id>"}`

## Admin CLI Tools

## Backups

Daily backups of Convex table data and file storage (voucher images) can be run locally via the included backup script.

### Running a Backup

```bash
# Backup dev deployment
./scripts/backup.sh dev

# Backup production deployment
./scripts/backup.sh prd
```

Backups are saved to `~/backups/open-voucher/` with human-readable names like:

- `open-voucher-backup-dev-2026-05-04.zip`
- `open-voucher-backup-prd-2026-05-04.zip`

Logs are written to `~/backups/open-voucher/logs/backup-YYYY-MM-DD-{dev|prd}.log`.

### Automated Daily Backups

Add to your crontab (`crontab -e`). Make sure `PATH` includes your Node.js binaries:

```cron
0 3 * * * /path-to-script prod
```

- Runs daily at **03:00 UTC**
- Keeps **7 days** of backups and logs (older ones auto-deleted)
- Includes all table data and file storage images

## Ban Rules

### Reporter Ban

If a user reports **3 or more of their last 5 claims**, they get banned for abuse.

### Uploader Ban

If **3 or more of an uploader's last 5 uploads** are reported as not working, they get banned. Reports from banned users are ignored to prevent retaliatory bans.

## Rate Limits

| Action | Limit |
|--------|-------|
| Reports | 1 per day |
| Uploads | 10 per 24 hours |
| Claims | 5 per 24 hours |

## Todo

- [ ] seed dev data - https://docs.convex.dev/database/import-export/import
- [ ] update landing page with faq
- [ ] cron job to clean up old vouchers and failed uploads

## Community

This project is open source under the AGPL-3.0 license. Contributions are welcome!

- [Contributing Guide](./CONTRIBUTING.md)
- [License](./LICENSE)

Please open an issue for bug reports or feature requests.
