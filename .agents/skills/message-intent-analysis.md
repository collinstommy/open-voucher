# Message Intent Analysis

## Purpose
Pull unknown inbound Telegram messages from production, clean out junk/noise, and analyze the remaining messages to identify feature requests, bugs, and UX issues.

## Prerequisites
- Convex CLI configured (`npx convex`)
- Access to prod deployment
- Python 3

## Steps

### 1. Fetch Production Data

```bash
cd packages/backend && npx convex run messages:getUnknownInboundMessages --prod 2>/dev/null > .note/unknown_messages_raw.json
```

The output is a JSON object with a `messages` array. Each message has `_id`, `createdAt`, `telegramChatId`, `text`, and `user`.

### 2. Clean the Data

Run the cleaning script with filter rules:

```bash
python3 .agents/skills/scripts/clean_messages.py .note/unknown_messages_raw.json .note/unknown_messages_cleaned.json
```

The cleaning script removes:
- **Invite code spam**: messages containing "code", "reddit", "alpha", "YOUR_INVITE_CODE_HERE"
- **Digit-starting messages**: e.g. voucher codes, phone numbers, "15 coins"
- **Button/command taps**: single-word messages like "availability", "upload", "menu", "refer"
- **Balance commands**: "send balance", "check balance", "send help"
- **Slash commands**: "/start", "/help", "/menu", etc.
- **Short greetings/noise**: "hi", "hello", "test", "ok", "thanks", emoji-only
- **WhatsApp auto-text**: "Sent from WhatsApp" prefixed messages

### 3. Print Summary Stats

```bash
python3 .agents/skills/scripts/summarize_messages.py .note/unknown_messages_cleaned.json
```

To print all message texts for LLM analysis:
```bash
python3 .agents/skills/scripts/summarize_messages.py .note/unknown_messages_cleaned.json --all
```

### 4. Analyze with LLM

**Read the cleaned messages and categorize them using your own judgment.** The LLM should:

1. Read `.note/unknown_messages_cleaned.json` (or run `--all` to see all texts)
2. Categorize each message into themes: feature requests, bugs, UX issues, praise, noise
3. Count frequency per theme
4. Identify patterns — recurring complaints, common pain points
5. Prioritize: which themes have the most mentions? Which appear to be increasing?

The LLM can also create its own analysis scripts if it finds patterns it wants to quantify (e.g., count messages per month for a specific theme).

**Do NOT rely on hardcoded keywords** — these messages are "unknown" precisely because keyword matching already failed. Read and understand each message.


## Adding New Clean Patterns

Edit `scripts/clean_messages.py` and add to the appropriate set:
- `INVITE_CODE_PATTERNS` — regex patterns (case-insensitive)
- `SHORT_NOISE` — exact lowercase matches for short junk messages
- `EXTRA_JUNK` — exact lowercase matches for longer junk messages
- `BALANCE_COMMANDS` / `SINGLE_WORD_COMMANDS` — button tap noise

## Output Files

- `.note/unknown_messages_raw.json` — raw production data from Convex
- `.note/unknown_messages_cleaned.json` — cleaned messages (junk removed)
- Any additional analysis files the LLM creates go in `.note/`
