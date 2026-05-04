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
This will start
- Admin dashboard at [http://localhost:3001](http://localhost:3001)
- Convex backend for the bot.

## Project Structure

```
open-voucher/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Start)
├── packages/
│   ├── backend/     # Convex backend functions and schema
```

## Available pacakges/backend

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:setup`: Setup and configure your Convex project
- `bun run check-types`: Check TypeScript types across all apps

## Environment Setup

Secrets are managed in [Doppler](https://www.doppler.com/) and deployed to Convex using the webhook management script.

### Prerequisites

1. **Install Doppler CLI** - See [Doppler CLI documentation](https://docs.doppler.com/docs/install-cli)
2. **Login to Doppler:**
   ```bash
   doppler login
   doppler setup
   ```
3. A Google AI API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
4. A telegram bot token from [@BotFather](https://t.me/botfather)
5. A convex account and project.

### Required Secrets (in Doppler)

| Secret | Description | Get From |
|--------|-------------|----------|
| `TELEGRAM_TOKEN` | Telegram bot authentication | [@BotFather](https://t.me/botfather) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API access | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook verification | Generate a random string |
| `ADMIN_PASSWORD` | Admin panel access | Set your own secure password |
| `CONVEX_WEBHOOK_URL` | Your Convex webhook URL | From Convex dashboard |

### Setup Script

Run the webhook management script to configure everything at once:

```bash
# For development
./manageWebhooks.sh dev

# For production
./manageWebhooks.sh prd
```

This script will:
- Fetch secrets from Doppler
- Delete and set the Telegram webhook
- Configure all environment variables in Convex

### Register Telegram Bot Commands

After initial setup, register the bot commands so users see suggestions when typing `/`:

```bash
bunx convex run telegram:registerBotCommands
```

This enables the command menu in Telegram with:
- `/help` - Show help menu
- `/balance` - Check your coin balance
- `/faq` - Frequently asked questions
- `/feedback` - Send feedback
- `/donate` - Support the project

### Sample/Test Voucher Setup

To set up the sample voucher image shown to users:

1. Go to your [Convex Dashboard](https://dashboard.convex.dev)
2. Upload `config/sample-voucher.png` and `config/test-voucher.png` to the Storage. Note the storage IDs.
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
