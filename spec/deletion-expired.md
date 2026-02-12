# Expired Voucher Image Deletion - Specification & Plan

## Overview

We need to implement a safe system for cleaning up images from expired vouchers to manage storage costs. This is a **destructive operation** that requires extreme caution.

## Current State

- Images are stored in Convex Storage
- Vouchers have an `imageStorageId` field referencing the storage
- Once uploaded, images are NEVER deleted
- Expired vouchers retain their images indefinitely
- Storage costs will grow indefinitely without cleanup

## Requirements

### Functional Requirements

1. Delete images only for vouchers with status "expired"
2. Include claimed vouchers in cleanup (they have barcodes and have likely been used)
3. Wait 60 days after expiration before marking for deletion
4. Wait 30 additional days (grace period) after marking before actual deletion
5. Support dry-run mode to preview what would be deleted
6. Manual execution only (admin action, not automated cron)
7. Batch processing (max 100 vouchers per run)
8. Full audit trail of all actions

### Safety Requirements

1. **Multi-stage verification** - Must pass all checks before deletion
2. **Soft-delete pattern** - Mark first, delete later
3. **Storage ID verification** - Ensure no other records reference the image
4. **Status verification** - Double-check voucher is still expired
5. **Immutability checks** - Ensure image hasn't been modified
6. **Comprehensive logging** - Log every action with batch IDs

## Design Decisions

### Decision 1: 60-Day Wait Before Marking

**Status**: ✅ Decided

**Rationale**:
- Provides buffer for any disputes or issues
- Allows time for voucher status changes (e.g., if a voucher was incorrectly marked expired)
- Matches typical accounting/audit retention periods
- Balances storage cost vs. operational safety

**Rejected alternatives**:
- 30 days: Too short, doesn't allow enough time for issues to surface
- 90 days: Too long, unnecessary storage costs

### Decision 2: 30-Day Grace Period After Marking

**Status**: ✅ Decided

**Rationale**:
- Creates recoverable window if marking was in error
- Allows for admin intervention before permanent deletion
- Provides time to notice and stop erroneous cleanup

**Implementation**:
- `imageMarkedForDeletionAt` timestamp added to voucher schema
- Deletion only occurs if `now - imageMarkedForDeletionAt > 30 days`

### Decision 3: Include Claimed Vouchers

**Status**: ✅ Decided

**Rationale**:
- Claimed vouchers have been transferred to a user
- The barcode number is already shared with the claimer
- Once expired, the voucher is likely already used
- Image serves no operational purpose after expiration
- **Risk mitigation**: Claimer already has the barcode, can still use it

**Rejected alternatives**:
- Exclude claimed vouchers: Would leave many images uncleared, reducing cleanup effectiveness
- Delete immediately on claim: Too risky, needed for dispute resolution

### Decision 4: Manual Execution Only

**Status**: ✅ Decided

**Rationale**:
- Prevents accidental automated deletion
- Forces admin review before any cleanup
- Allows for dry-run verification
- Enables operational control and scheduling

**Execution plan**:
1. Run dry-run first (see what would happen)
2. Review logs and counts
3. Run actual cleanup with `dryRun: false`

### Decision 5: No Automatic Scheduling

**Status**: ✅ Decided

**Rationale**:
- Manual process ensures human oversight
- Prevents midnight disasters
- Allows for timing around business needs
- Can be scheduled manually via admin dashboard when needed

**Future consideration**: May add optional cron after 6+ months of stable operation

### Decision 6: Batch Size Limit (100)

**Status**: ✅ Decided

**Rationale**:
- Prevents long-running operations
- Reduces blast radius of any issues
- Allows for incremental progress review
- Convex function timeout protection

### Decision 7: Storage ID Cross-Reference Check

**Status**: ✅ Decided

**Rationale**:
- Ensures we don't delete images still referenced elsewhere
- Checks both `vouchers` and `failedUploads` tables
- Safety measure against data integrity issues

**Implementation**:
```typescript
// Before deletion, verify:
1. No other voucher has this imageStorageId
2. No failedUpload has this imageStorageId
```

### Decision 8: Audit Trail

**Status**: ✅ Decided

**Rationale**:
- Must be able to track what was deleted and when
- Needed for compliance and debugging
- Batch IDs allow correlating related actions

**Implementation**:
- `imageMarkedForDeletionAt` field
- `imageDeletedAt` field
- Console logging with batch IDs
- Return detailed results from cleanup action

### Decision 9: Dry-Run Mode

**Status**: ✅ Decided

**Rationale**:
- Critical safety feature
- Allows preview of impact before actual deletion
- Default to dry-run (opt-in to real deletion)
- Provides counts and lists of affected vouchers

**Usage**:
```typescript
// Step 1: Preview
await cleanupExpiredVoucherImages({ token, dryRun: true })

// Step 2: Actually run (after review)
await cleanupExpiredVoucherImages({ token, dryRun: false })
```

## Schema Changes

### Vouchers Table Addition

```typescript
vouchers: defineTable({
  // ... existing fields ...
  
  // Image deletion tracking
  imageMarkedForDeletionAt: v.optional(v.number()), // Timestamp when marked
  imageDeletedAt: v.optional(v.number()),           // Timestamp when deleted
})
```

**Migration**: None required (optional fields)

## Implementation Phases

### Phase 1: Schema & Core Functions

**Status**: Ready to implement

**Tasks**:
1. Add `imageMarkedForDeletionAt` and `imageDeletedAt` to voucher schema
2. Create `getExpiredVouchersForCleanup` internal query
3. Create `markVoucherImageForDeletion` internal mutation
4. Create `deleteVoucherImage` internal mutation
5. Create `cleanupExpiredVoucherImages` admin action

**Files to modify**:
- `packages/backend/convex/schema.ts`
- `packages/backend/convex/admin.ts`

### Phase 2: Testing

**Status**: Ready to implement

**Test scenarios**:
1. ✅ Dry-run mode returns correct preview
2. ✅ Only "expired" status vouchers are processed
3. ✅ Vouchers < 60 days old are ignored
4. ✅ Marking phase works (sets timestamp)
5. ✅ Deletion phase works (after 30-day grace)
6. ✅ Claimed vouchers are included
7. ✅ Non-expired vouchers are excluded
8. ✅ Already deleted images are skipped
9. ✅ Storage ID cross-reference check prevents deletion
10. ✅ Batch size limits are respected
11. ✅ Audit trail is created

**Files to create**:
- `packages/backend/tests/convexTest/voucherImageCleanup.test.ts`

### Phase 3: Documentation

**Status**: Ready to implement

**Documentation**:
1. README section on cleanup process
2. Admin dashboard documentation
3. Operational runbook

**Files to modify**:
- `README.md`
- `packages/backend/convex/admin.ts` (function documentation)

### Phase 4: Admin Dashboard UI

**Status**: Future work (not in this plan)

**Features**:
- Button to trigger dry-run
- Display preview results
- Button to trigger actual cleanup (with confirmation)
- Show statistics of cleaned images

## Operational Procedures

### Weekly Cleanup Process

**Recommended schedule**: Weekly (e.g., Sunday 2 AM)

**Steps**:

1. **Pre-check** (5 min)
   - Check recent system stability
   - Verify no ongoing issues

2. **Dry Run** (2 min)
   ```typescript
   // Run in Convex dashboard or via API
   await cleanupExpiredVoucherImages({
     token: adminToken,
     dryRun: true
   })
   ```
   - Review counts
   - Check sample vouchers
   - Verify timing looks correct

3. **Review** (5 min)
   - Check dry-run results
   - Look for anomalies
   - Confirm numbers look reasonable

4. **Execute** (2 min)
   ```typescript
   await cleanupExpiredVoucherImages({
     token: adminToken,
     dryRun: false
   })
   ```

5. **Verify** (2 min)
   - Check logs for errors
   - Verify counts match dry-run
   - Confirm no unexpected issues

### Emergency Stop Procedure

**If something goes wrong**:

1. Immediately stop running more cleanup batches
2. Check which vouchers were affected (via logs)
3. Images marked but not deleted can be recovered (just clear the timestamp)
4. Actually deleted images: **CANNOT BE RECOVERED** (this is why we have grace periods)

### Recovery Procedures

**Accidental marking** (before deletion):
```typescript
// Remove the mark
await ctx.db.patch(voucherId, {
  imageMarkedForDeletionAt: undefined
})
```

**Accidental deletion**:
- **No recovery possible**
- This is why we have 30-day grace period
- This is why we require manual execution with dry-run

## Safety Checklist

Before running cleanup:

- [ ] Dry-run completed and reviewed
- [ ] Voucher counts look reasonable
- [ ] No recent system issues
- [ ] Team aware cleanup is happening
- [ ] Time scheduled during low-traffic period
- [ ] Logs monitoring active
- [ ] Emergency contact available

## Risk Assessment

### High Risk

1. **Accidental deletion of active voucher images**
   - **Mitigation**: Status check, 60-day wait, dry-run mode
   - **Residual risk**: Low

2. **Deletion of image referenced by multiple vouchers**
   - **Mitigation**: Cross-reference check before deletion
   - **Residual risk**: Very low

### Medium Risk

1. **Deletion of image still needed for dispute resolution**
   - **Mitigation**: 90-day total wait (60 + 30)
   - **Residual risk**: Low

2. **Storage ID reuse after deletion**
   - **Mitigation**: Convex storage guarantees unique IDs
   - **Residual risk**: None (handled by Convex)

### Low Risk

1. **Incomplete batch due to timeout**
   - **Mitigation**: Batch size limit (100), can re-run
   - **Residual risk**: Very low

## Success Metrics

1. **Safety**: Zero accidental deletions of non-expired voucher images
2. **Completeness**: 100% of eligible expired voucher images cleaned up
3. **Efficiency**: Storage cost reduction proportional to cleanup
4. **Auditability**: All actions logged and traceable

## Future Considerations

### Potential Enhancements

1. **Automated scheduling** (after 6+ months stable)
   - Weekly cron job
   - Still requires dry-run approval?

2. **Failed upload cleanup**
   - Similar logic for failedUploads table
   - Different retention period?

3. **Storage analytics**
   - Track storage cost savings
   - Monitor cleanup effectiveness

4. **Image archival** (instead of deletion)
   - Move to cold storage instead of delete
   - Higher cost but recoverable

### Not in Scope

- Automatic execution without human review
- Deletion of non-expired vouchers
- Real-time cleanup (immediate on expiration)
- Recovery of deleted images (impossible by design)

## Decision Log

| Date | Decision | Rationale | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2024-02-11 | 60-day wait before marking | Balance safety vs storage cost | 30 days (too short), 90 days (too long) |
| 2024-02-11 | 30-day grace after marking | Recovery window | 7 days (too short), 60 days (too long) |
| 2024-02-11 | Include claimed vouchers | Likely used, barcode already shared | Exclude (less effective) |
| 2024-02-11 | Manual execution only | Safety, human oversight | Automated cron (risky) |
| 2024-02-11 | Batch size 100 | Timeout protection, incremental | 50 (too slow), 500 (timeout risk) |
| 2024-02-11 | Storage ID cross-check | Prevent deleting shared images | None (risky) |
| 2024-02-11 | Dry-run default | Safety, preview capability | No dry-run (dangerous) |

## Open Questions

1. **Should we clean up failed uploads too?**
   - Decision: Not in initial scope, consider later

2. **What about images in messages table?**
   - Decision: Out of scope, different retention needs

3. **Should we add email/telegram notifications?**
   - Decision: Consider after initial implementation stable

4. **What about GDPR/data retention?**
   - Decision: 90-day retention meets typical requirements, but verify with legal

## Appendix: Code Structure

### Files

```
packages/backend/
├── convex/
│   ├── schema.ts                    # Schema additions
│   ├── admin.ts                     # Cleanup functions
│   └── crons.ts                     # No changes (manual only)
└── tests/convexTest/
    └── voucherImageCleanup.test.ts  # New test file
```

### Key Functions

1. **cleanupExpiredVoucherImages** (adminAction)
   - Entry point for cleanup
   - Supports dry-run mode
   - Returns detailed results

2. **getExpiredVouchersForCleanup** (internalQuery)
   - Finds vouchers ready for marking
   - Finds vouchers ready for deletion
   - Respects batch size

3. **markVoucherImageForDeletion** (internalMutation)
   - Sets `imageMarkedForDeletionAt`
   - Validates voucher state

4. **deleteVoucherImage** (internalMutation)
   - Deletes from Convex storage
   - Sets `imageDeletedAt`
   - Validates no cross-references

## Next Steps

1. ✅ Review and approve this spec
2. 🔄 Implement Phase 1 (schema + functions)
3. 🔄 Implement Phase 2 (tests)
4. 🔄 Implement Phase 3 (documentation)
5. 🔄 First dry-run in staging
6. 🔄 First production dry-run
7. 🔄 First production cleanup (dryRun: false)

---

**Document Owner**: Development Team  
**Last Updated**: 2024-02-11  
**Status**: Ready for Implementation  
**Review Schedule**: Revisit after 3 production cleanup runs
