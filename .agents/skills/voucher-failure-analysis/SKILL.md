---
name: voucher-failure-analysis
description: Analyze failedUploads production data from Convex to measure the impact of OCR/pipeline changes on upload failure rates.
---

## Purpose
Analyze `failedUploads` production data from Convex to measure the impact of OCR/pipeline changes on upload failure rates.

## Prerequisites
- Convex CLI configured (`npx convex` or `bunx convex`)
- Access to prod deployment
- Git history for the change being evaluated

## Steps

### 1. Pull Production Data
```bash
cd packages/backend
CONVEX_DEPLOYMENT=prod:<deployment-name> bunx convex data failedUploads --prod --order desc --limit 2000 --format jsonLines > /tmp/failed_uploads.jsonl
wc -l /tmp/failed_uploads.jsonl
```

Also pull `vouchers` table to compute total uploads per week:
```bash
CONVEX_DEPLOYMENT=prod:<deployment-name> bunx convex data vouchers --prod --order desc --limit 5000 --format jsonLines > /tmp/vouchers.jsonl
```

### 2. Determine Change Cutoff Date
Find the commit date of the change being evaluated:
```bash
git log --format="%H %ai %s" --all --grep="<change-description>" -n 1
```
Convert to epoch timestamp for the analysis script.

### 3. Run Weekly Analysis Script

```js
const fs = require("fs");

// Config
const CUTOFF = new Date("YYYY-MM-DDTHH:mm:ssZ").getTime();
const EXCLUDE_REASONS = ["DUPLICATE_BARCODE"]; // adjust as needed

// Helpers
function getWeekStart(ts) {
  const d = new Date(ts);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff)).toISOString().slice(0, 10);
}

// Load data
const failed = fs.readFileSync("/tmp/failed_uploads.jsonl", "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const vouchers = fs.readFileSync("/tmp/vouchers.jsonl", "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);

// Filter excluded reasons
const filtered = failed.filter(d => !EXCLUDE_REASONS.includes(d.failureReason));

const pre = filtered.filter(d => d._creationTime < CUTOFF);
const post = filtered.filter(d => d._creationTime >= CUTOFF);

// Weekly aggregation
const weeks = new Map();
for (const v of vouchers) {
  const w = getWeekStart(v._creationTime);
  if (!weeks.has(w)) weeks.set(w, { week: w, total: 0, failed: 0 });
  weeks.get(w).total++;
}
for (const f of filtered) {
  const w = getWeekStart(f._creationTime);
  if (!weeks.has(w)) weeks.set(w, { week: w, total: 0, failed: 0 });
  weeks.get(w).total++;
  weeks.get(w).failed++;
}

// Include current week even if empty
const now = Date.now();
const currentWeek = getWeekStart(now);
if (!weeks.has(currentWeek)) {
  weeks.set(currentWeek, { week: currentWeek, total: 0, failed: 0 });
}

// Print table
const sorted = [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week));
console.log("Week        | Total | Failed | Rate  | Period");
console.log("------------|-------|--------|-------|-------");
for (const w of sorted) {
  const rate = w.total > 0 ? Math.round((w.failed / w.total) * 100) : 0;
  const period = w.week < getWeekStart(CUTOFF) ? "pre" : "post";
  console.log(`${w.week} | ${String(w.total).padStart(5)} | ${String(w.failed).padStart(6)} | ${String(rate).padStart(3)}% | ${period}`);
}

// Per-reason breakdown
function analyze(label, arr) {
  const reasons = {};
  for (const d of arr) {
    const r = d.failureReason || "(none)";
    reasons[r] = (reasons[r] || 0) + 1;
  }
  const days = (Math.max(...arr.map(d=>d._creationTime)) - Math.min(...arr.map(d=>d._creationTime))) / (1000*60*60*24) + 0.001;
  console.log(`\n=== ${label}: ${arr.length} failures over ${days.toFixed(1)} days = ${(arr.length/days).toFixed(2)}/day ===`);
  for (const [r, c] of Object.entries(reasons).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${r}: ${c} (${((c/arr.length)*100).toFixed(1)}%)`);
  }
}

analyze("Pre-schema", pre);
analyze("Post-schema", post);
```

### 4. Evaluate Results

Key metrics to check:
- **Overall daily failure rate** pre vs post
- **Per-reason daily rates** — which categories got better/worse
- **Real wins** — reasons that genuinely indicate a fix (e.g., `INVALID_TYPE` eliminated)
- **False positives** — reasons that indicate over-rejection (e.g., `TOO_LATE_TODAY`, `EXPIRED` for still-valid vouchers)

### 5. Decision Framework

| Signal | Interpretation |
|--------|---------------|
| `INVALID_TYPE` drops to zero | Schema/prompt change correctly constrained AI output |
| `SYSTEM_ERROR` drops | Fewer parse crashes / API issues |
| `TOO_LATE_TODAY` / `EXPIRED` spikes | AI is over-confidently rejecting valid vouchers — likely false positives |
| `COULD_NOT_READ_EXPIRY_DATE` spikes | Date extraction got worse |
| Total rate increases, but composition shifts to "accurate" failures | Net user experience may still be worse (more rejections) |

### 6. Recommendations

If false positives (`TOO_LATE_TODAY`, `EXPIRED`) spike while real errors (`INVALID_TYPE`, `SYSTEM_ERROR`) drop:
- The change improved AI output structure but hurt accuracy
- Consider: softer date validation, confidence thresholds, or human review queue
- Revert if the net effect is more user-facing rejections

## Output Format
Present findings as:
1. Weekly table (Total / Failed / Rate / Period)
2. Per-reason breakdown pre/post
3. Daily rate comparison per reason
4. Clear verdict: "Keep / Revert / Iterate"