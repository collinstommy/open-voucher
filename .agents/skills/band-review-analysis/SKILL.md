---
name: band-review-analysis
description: Analyze flagged and banned Convex users, warning outcomes, abuse indicators, deduction estimates, and post-ban support or feedback in a self-contained HTML report.
---

## Purpose

Produce a read-only moderation report for users currently flagged for review and users who are banned. The report compares activity before and after warnings or bans, shows admin warning messages, estimates recoverable upload rewards, and suggests the next moderation action.

The report is decision support, not an automatic enforcement tool. Never ban users, deduct coins, dismiss flags, or send messages from this skill.

## Prerequisites

- Convex CLI configured for the repository
- Production access
- Python 3
- Run commands from `packages/backend` or pass its path with `--backend-dir`

## Run

From the repository root:

```bash
python3 .agents/skills/band-review-analysis/scripts/analyze_band_review.py \
  --backend-dir packages/backend \
  --prod \
  --output /tmp/opencode/band-review.html
```

Open the generated HTML file in a browser. The script uses `convex run --inline-query`, which is read-only and avoids the whole-table `convex data` response limit. It queries each target user's records and only returns matching users' records.

Use `--deployment <name>` instead of `--prod` for a named deployment. Do not use `--push` for this analysis.

## Interpretation

The report includes:

- Flagged non-banned users and banned users
- Admin messages, treated as warning candidates because messages are not currently typed as warnings
- Uploads, reports against uploads, and reports filed by the user
- Upload report rate and claim report rate
- Activity before and after the latest warning for flagged users
- Activity before and after the ban for banned users
- Banned-user support and feedback before and after the ban
- Estimated coin clawback for currently traceable reported uploads
- A percentage abuse score and confidence indicator
- Suggested action: monitor, warn, deduct after confirmation, or ban review

### Score model

The abuse score is a transparent heuristic, not a probability of abuse:

```text
score = 65% * upload-report-rate + 35% * claim-report-rate
```

The report displays activity volume alongside the score. Small denominators must be manually reviewed before enforcement. A report is counted once per current report record; multiple reporters do not create multiple deductions for the same voucher.

### Deduction model

The estimated deduction is the sum of the configured upload reward for each distinct currently reported voucher. It excludes reports that have been deleted or resolved and therefore cannot be linked to a voucher. It is an estimate for review, not an instruction to apply the deduction.

### Gaps and caveats

- `uploadReportCount` is a lifetime counter and can exceed current report rows because resolved report rows may be deleted.
- Admin messages are identified using `isAdminMessage`; the database does not currently distinguish warnings from other admin messages.
- A post-warning report can concern an upload made before the warning, so the report shows both report-time and upload-time comparisons.
- Missing historical records reduce confidence. The report calls these out instead of treating missing data as no activity.

## Files

- `scripts/analyze_band_review.py`: Fetches production data, calculates metrics, and renders HTML.
