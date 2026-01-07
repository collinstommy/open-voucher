# open-router

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Start, Convex, and more.

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

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
Your app will connect to the Convex cloud backend automatically.


## Project Structure

```
open-router/
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

### Required API Keys

1. **Telegram Bot Token**
   - Chat with [@BotFather](https://t.me/botfather) on Telegram
   - Create a new bot and copy the token

2. **Gemini API Key**
   - Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Create a new API key

### Environment Configuration

1. **Copy the sample environment file:**
   ```bash
   cp .env.sample .env
   ```

2. **Edit `.env` with your actual values:**
   ```bash
   # Required for local development
   TELEGRAM_BOT_TOKEN=your-telegram-bot-token
   GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-api-key

   # Production deployment
   PROD_TOKEN=your-prod-telegram-bot-token
   PROD_URL_WEBHOOK=https://your-prod-deployment-url.com/telegram/webhook
   PROD_GOOGLE_GENERATIVE_AI_API_KEY=your-prod-gemini-api-key

   # Development deployment
   DEV_TOKEN=your-dev-telegram-bot-token
   DEV_URL_WEBHOOK=https://your-dev-convex-deployment.convex.site/telegram/webhook
   DEV_GOOGLE_GENERATIVE_AI_API_KEY=your-dev-gemini-api-key
   ```

### Webhook Setup

The project includes a script to configure Telegram webhooks and set environment variables in Convex:

1. **Install Convex CLI:**
   ```bash
   npm install -g convex
   ```

2. **Run the webhook setup script:**
   ```bash
   ./manageWebhooks.sh
   ```

This script will:
- Delete existing webhooks for both dev and prod environments
- Set new webhooks to point to your Convex deployments
- Configure environment variables (`TELEGRAM_BOT_TOKEN` and `GOOGLE_GENERATIVE_AI_API_KEY`) in both environments

### Manual Webhook Commands

If you prefer to set up webhooks manually:

**Development:**
```bash
curl -X POST "https://api.telegram.org/bot{DEV_TOKEN}/setWebhook" \
     -H "Content-Type: application/json" \
     -d "{\"url\": \"{DEV_URL_WEBHOOK}\"}"
```

**Production:**
```bash
curl -X POST "https://api.telegram.org/bot{PROD_TOKEN}/setWebhook" \
     -H "Content-Type: application/json" \
     -d "{\"url\": \"{PROD_URL_WEBHOOK}\"}"
```

## Admin CLI Tools

### Create Invite Codes

The project includes a CLI tool for creating invite codes for user onboarding:

**Setup:**
```bash
# Make the script executable (if not already)
chmod +x pacakges/backend/createInviteCode.sh
```

**Usage Examples:**

1. **Create an auto-generated invite code:**
   ```bash
   ./pacakges/backend/createInviteCode.sh
   ```

2. **Create a custom code with a label:**
   ```bash
   ./pacakges/backend/createInviteCode.sh -c "REDDIT" -l "Reddit launch campaign"
   ```

3. **Create code with limits and expiry:**
   ```bash
   ./pacakges/backend/createInviteCode.sh -c "TWITTER100" -l "Twitter giveaway" -m 100 -e 30
   ```

4. **Create code for production environment:**
   ```bash
   ./pacakges/backend/createInviteCode.sh -c "PARTY25" -l "Birthday party" -p
   ```

**Parameters:**
- `-c, --code CODE` - Custom invite code (optional, auto-generated if not provided)
- `-l, --label LABEL` - Description for tracking purposes (optional)
- `-m, --max-uses NUM` - Maximum number of uses (default: 50)
- `-e, --expires NUM` - Expiry in days (default: no expiry)
- `-p, --prod` - Use production environment (default: development)
- `-h, --help` - Show help message

**Example Output:**
```
✅ Invite code created successfully!

📋 Details:
   Code: REDDIT50
   Label: Reddit launch campaign
   Max Uses: 50
   Environment: development

🔗 Share: https://t.me/your_bot?start=REDDIT50
```

## Admin Authentication

Session-based authentication for admin endpoints.

**Setup:**
Dev
```bash
bunx convex env set ADMIN_PASSWORD "your-secure-password-here"
```

Prod`
```bash
bunx convex env set ADMIN_PASSWORD "your-secure-password-here" --prod
```

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

## ToDo
- [x] ban messages should be clearer - review this flow
- [x] double check ban logic from both sides
- [x] define rules of the system in docs
- [ ] onboarding flow for devs

## Later
- [ ] remove invite code flow
- [x] fix users query
- [ ] seed dev data - https://docs.convex.dev/database/import-export/import
- [ ] failed uploads dashboard
- [ ] vocuhers admin page should be paginated and show all vouchers
- [ ] refactor help to be a series of buttons. use buttons for everything
   - [ ] support/feedback/faq links/balance/availability
- [x] start date for vouchers
- [x] unify the validation, we do this in two places right now
- [x] return vouchers that are expires soonest
- [x] restrict uploads for expiring today to before 9pm
- [ ] if voucher are not Available right now, send message once Available
- [ ] update landing page with faq
- [x] allow banners users to message the bot
- [x] send message to single telegram user from bot
- [ ] cron job to clean up old vouchers and failed uploads

### Tests
-[ ] message from admin to user
