# Bug: Reporter/Uploader Ban Logic Timing Issue

## Overview

When a user reports a voucher as not working, the system needs to check two potential ban conditions:
1. **Reporter Ban**: If the reporter has reported 3+ of their last 5 claims, they should be banned
2. **Uploader Ban**: If the uploader has 3+ of their last 5 uploads reported, they should be banned

The complexity arises when **both bans should trigger during the same `reportVoucher()` function call**.

## Current Status

### Test Results (as of 2025-12-28)
- ✅ **19 tests passing** (up from 18)
- ❌ **3 tests failing**:
  1. `Ban Flow > uploader gets banned when 3 of last 5 uploads reported`
  2. `Ban Flow Tests > reporter banned when 3+ of last 5 claims are reported`
  3. `Ban Flow Tests > uploader banned when 3+ of last 5 uploads are reported`

### Fixes Successfully Applied
1. ✅ **Off-by-one error for reporter ban**: Added logic to count the current report being made in the ban calculation (since the report hasn't been inserted yet when we check reporter bans)
2. ✅ **Dynamic ban message**: Message now correctly says "3 of your first 3 claims" when user has only 3 claims, vs "3 or more of your last 5 claims" when they have 5+
3. ✅ **Filter logic for pre-banned users**: Fixed test "uploader NOT banned when reports come from banned users" - now correctly excludes reports from users who were banned BEFORE the current function call

## Core Issue: Timing of Bans Within Single Function Call

### The Problem

The `reportVoucher()` function has this execution order:

```typescript
// 1. Check if reporter should be banned (BEFORE inserting current report)
//    - Query existing reports
//    - If 3+ of last 5 claims are reported, BAN REPORTER
//    - Return early with "banned" status
//
// 2. Insert the current report into database
//
// 3. Check if uploader should be banned (AFTER inserting current report)
//    - Query all reports for this uploader
//    - Filter out reports from "banned" users
//    - If 3+ of last 5 uploads are reported, BAN UPLOADER
```

### The Dilemma

When filtering reports to check if the uploader should be banned, we need to decide:

**Should we count reports from a user who just got banned moments ago IN THIS SAME FUNCTION CALL?**

#### Current Behavior
The code filters reports from users who were "banned before this function call":
```typescript
const shouldExclude =
    reporter.isBanned &&
    reporter.bannedAt &&
    reporter.bannedAt < now; // 'now' is captured at start of function
```

#### What Tests Expect
The tests expect that if:
- Reporter makes their 3rd bad report → gets banned
- That same report should count toward banning the uploader
- Result: **Both reporter AND uploader should be banned**

But currently, after the reporter is banned, their reports (including the current one) may be filtered out when checking the uploader ban.

### Attempted Solutions

1. **Track "already included current reporter"**: Added special logic to always include the current reporter's reports, even if they got banned during this call
   ```typescript
   if (report.reporterId === user._id) {
       validReports.push(report);
       continue;
   }
   ```

2. **Store ban status at function start**: Captured `uploaderWasBannedBeforeThisCall` to distinguish pre-existing bans from bans that happen during execution
   ```typescript
   const uploaderAtStart = await ctx.db.get(voucher.uploaderId);
   const uploaderWasBannedBeforeThisCall = uploaderAtStart?.isBanned || false;
   ```

3. **Different counting logic for reporter vs uploader**:
   - Reporter ban: Count +1 for current report (hasn't been inserted yet)
   - Uploader ban: Don't add +1 (report already inserted)

## Why It's Complex

The fundamental challenge is distinguishing between:

1. **Pre-existing ban**: User was banned days/weeks ago for unrelated reasons
   - Their reports SHOULD be filtered out
   - Example: Known scammer's old reports shouldn't count

2. **Same-call ban**: User just got banned in THIS function call (literally milliseconds ago)
   - Their reports SHOULD count toward uploader ban
   - Example: User makes 3rd bad report, gets banned, but those 3 reports are legitimate and should ban the uploader

The current code tries to use timestamps (`bannedAt < now`) but this doesn't work because `now` is captured at the start of the function, and the reporter ban happens DURING the function, so `reporter.bannedAt` will be ≈ equal to `now`.

## Potential Solutions

### Option 1: Two-Phase Commit
```typescript
// Phase 1: Collect what actions to take
const shouldBanReporter = /* check logic */;
const shouldBanUploader = /* check logic using ALL current reports */;

// Phase 2: Execute bans
if (shouldBanReporter) { ban reporter }
if (shouldBanUploader) { ban uploader }
```

### Option 2: Track "Banned In This Call" Flag
```typescript
let reporterBannedInThisCall = false;

// Check reporter ban
if (shouldBan) {
    reporterBannedInThisCall = true;
    // ban reporter
}

// Check uploader ban
// Include reports from reporter if reporterBannedInThisCall === true
```

### Option 3: Simpler Filter Logic
Only filter out users who were banned before the START of this specific report being made:
```typescript
const shouldExclude =
    reporter.isBanned &&
    reporter.bannedAt < voucher.claimedAt; // Before THIS voucher was claimed
```

## Files Involved

- **`packages/backend/convex/vouchers.ts`**: Lines 362-600 (reportVoucher mutation)
- **`packages/backend/tests/convex-test/flows.test.ts`**: Lines 883-986, 1461-1632 (failing tests)

## Next Steps

1. Choose one of the solution approaches above
2. Implement the fix
3. Verify all 3 failing tests pass
4. Ensure the "uploader NOT banned when reports come from banned users" test still passes (regression check)
5. Consider adding more explicit test cases for same-call ban scenarios

## Related Context

- Ban logic was recently updated to trigger at 3 reports instead of 5 (for early detection)
- Tests use `vi.advanceTimersByTime()` to simulate reports on different days
- Both reporter and uploader can have their own independent ban thresholds
- The system needs to prevent abuse from both sides (fake reports AND fake vouchers)
