# AGENTS.md

## Development Commands

### Build & Test
```bash
bun run dev              # Start all apps in development mode
bun run build            # Build all applications for production
bun run check            # Run Biome formatting and linting (auto-fixes)
bun run check-types      # TypeScript type checking across all packages
```

### Backend Testing
```bash
cd packages/backend
bun run test             # Run all tests once
bun run test:watch       # Run tests in watch mode
bun run test:e2e         # Run e2e tests with bun test
```

### Individual Apps
```bash
bun run dev:web          # Start only web frontend (port 3001)
bun run dev:server       # Start only Convex backend
```

## Code Style Guidelines

### Formatting & Linting
- Uses Biome for formatting and linting (auto-runs `bun run check`)
- Tab indentation (configured in biome.json)
- Double quotes for strings
- Import organization: auto-sorted on save

### TypeScript Conventions
- Strict mode enabled with noUnusedLocals/Parameters
- Use `v.union()` for Convex schema enums
- Prefer `v.optional(v.string())` over nullable types
- Path aliases: `@/*` maps to `./src/*` in web app

### React/Component Patterns
- Use shadcn/ui components with `cn()` utility for class merging
- Follow class-variance-authority (cva) patterns for component variants
- Use Radix UI primitives with asChild pattern
- Component exports: `{ Component, componentVariants }`

### Convex Backend
- Schema-first development with explicit indexes
- Use union literals for status/type fields
- Include createdAt timestamps as numbers (Unix time)
- Reference IDs with `v.id("tableName")`

### Error Handling
- Use Zod validation for API inputs
- Convex functions should handle errors gracefully
- Test with edge-runtime environment

## Application Overview

### Business Value
Telegram-based voucher sharing platform for Dunnes Stores Ireland that enables users to upload, share, and claim discount vouchers through a coin-based economy system.

### Core Functionality
- **Invite-only signup** system with trackable codes for controlled user acquisition
- **Voucher upload flow**: Users send voucher photos → Gemini OCR extracts type/expiry → earn coins based on voucher value
- **Voucher claiming**: Users spend coins to claim vouchers from other users and receive voucher images via Telegram
- **Report system**: Users can report "already used" vouchers to receive replacements or refunds

### Business Rules & Coin Economy
- **Signup bonus**: 20 coins for new users (one-time)
- **Upload rewards**: €5 voucher = 15 coins, €10 voucher = 10 coins, €20 voucher = 5 coins
- **Claim costs**: Match upload rewards (€5 = 15 coins, €10 = 10 coins, €20 = 5 coins)
- **Voucher types**: €5 (€25 spend), €10 (€50 spend), €20 (€100 spend) with expiry tracking
- **Report handling**: Users get coin refunds when reporting already-used vouchers

### Key Tables
- `users`: Telegram user data with coin balances and ban status
- `vouchers`: Uploaded voucher images with OCR metadata and status tracking
- `inviteCodes`: Controlled signup system with usage limits and expiry
- `transactions`: Complete audit log of all coin movements
- `reports`: Tracks "already used" voucher reports for fraud monitoring
