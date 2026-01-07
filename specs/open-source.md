# Open Source Prep Plan

## Critical Security Issues (MUST FIX BEFORE PUBLISHING)

**Good news:** `.env` and `.env.local` are already in `.gitignore` and were never committed. Your API keys are NOT in git history.

### Still Recommended: Rotate Keys (Optional)

Since the files exist locally but weren't committed, the keys aren't public yet. However, as a precaution you may want to:
- Generate fresh Telegram bot tokens
- Get a new Gemini API key

This is optional since nothing is in git history, but recommended security practice.

### Create `.env.sample` Template

Create `.env.sample` with placeholder values so contributors know what env vars they need:
```
PROD_URL_WEBHOOK=https://your-prod-deployment.convex.site/telegram/webhook
PROD_TOKEN=your-prod-telegram-bot-token
PROD_TELEGRAM_WEBHOOK_SECRET=generate-a-random-string
DEV_URL_WEBHOOK=https://your-dev-deployment.convex.site/telegram/webhook
DEV_TOKEN=your-dev-telegram-bot-token
DEV_TELEGRAM_WEBHOOK_SECRET=generate-a-random-string
PROD_GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-key
DEV_GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-key
```

### Update `.gitignore`

Ensure `.env` and `.env.local` are in `.gitignore` (already correct).

## Documentation to Add

### 1. LICENSE File (GPL-3.0)

GNU General Public License v3.0 - as requested.

### 2. CONTRIBUTING.md (Lightweight)

Keep it simple:
- How to set up dev environment
- How to run tests
- PR guidelines (small PRs, tested, descriptive commit messages)
- No strict coding standards for small project

### 3. README.md Updates

- Rename title from "open-router" to "open-voucher"
- Update any remaining references to secrets
- Add "Community" section with contributor guidelines link

## Files to Create/Modify

| File | Action |
|------|--------|
| `.env.sample` | Create with placeholder values |
| `LICENSE` | Create (GPL-3.0) |
| `CONTRIBUTING.md` | Create (lightweight) |
| `README.md` | Update title to "open-voucher" |

## Recommended Order

1. Create `.env.sample` template (optional - keys already safe)
2. Add LICENSE, CONTRIBUTING.md
3. Update README title to "open-voucher"
4. Push to public repo
