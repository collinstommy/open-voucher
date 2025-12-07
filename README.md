# open-router

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Start, Convex, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Start** - SSR framework with TanStack Router
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Reusable UI components
- **Convex** - Reactive backend-as-a-service platform
- **Turborepo** - Optimized monorepo build system
- **Biome** - Linting and formatting

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

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:setup`: Setup and configure your Convex project
- `bun run check-types`: Check TypeScript types across all apps
- `bun run check`: Run Biome formatting and linting

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


## ToDo
- [ ] unify the validation, we do this in two places right now
- [ ] return vouchers that are expires soonest
