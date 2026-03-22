# PR #79 Copilot Feedback — Correction Plan

Source PR: https://github.com/simonmcc/glv-dashboard/pull/79
feat: joining journey progress view and Growing Roots module expansion

---

## Issues to fix

### 1. Duplicate Safety record in mock data — ✅ RESOLVED (no action needed)
**File:** `dashboard/src/mock-data.ts`
**Feedback:** `mockLearningRecords` has two Safety entries for David Brown — one earlier in the list and another added in the new "Growing Roots modules" block. This produces duplicate rows/counts in the UI.
**Fix:** Inspected the merged code — David Brown's "Growing Roots modules" block contains only Who We Are, Creating Inclusion, Data Protection in Scouts, and Delivering a Great Programme. The Safety record appears only once (in the general Safety training block). The duplicate was resolved before/during the merge.

---

### 2. "Most outstanding" sort counts Growing Roots as 1 item — ✅ DONE
**File:** `dashboard/src/components/JoiningJourneyProgress.tsx` line ~137
**Feedback:** The sort key uses `outstandingItems.size`, which counts "Growing Roots" as a single item even though the UI expands it into multiple module chips. Members with many outstanding GR modules are sorted incorrectly.
**Fix:** Compute an `outstandingCount` that replaces the single "Growing Roots" entry with the count of outstanding Growing Roots modules (from `learningRecords`) before sorting. This makes the sort order consistent with what the user sees.

---

### 3. Growing Roots row disappears when all modules are "done" — ✅ DONE
**File:** `dashboard/src/components/JoiningJourneyProgress.tsx` line ~232
**Feedback:** When `growingRootsOutstanding` is true but every module maps to a done/valid status, zero chips are rendered and the outstanding item becomes invisible.
**Fix:** After filtering modules to outstanding-only, if the resulting list is empty, render a single fallback "Growing Roots" chip so the item is never silently hidden.

---

### 4. No tests for JoiningJourneyProgress component
**File:** `dashboard/src/components/JoiningJourneyProgress.tsx` lines ~79 and ~105
**Feedback:** The component has non-trivial grouping, filtering, sorting, and Growing Roots expansion logic with no test coverage.
**Fix:** Create `dashboard/src/components/JoiningJourneyProgress.test.tsx` with focused tests covering:
- Members are grouped correctly (one row per member with multiple outstanding items collapsed)
- Search filter hides non-matching members
- "Most outstanding" sort orders members by expanded chip count (not raw item count)
- Growing Roots expansion renders per-module chips when learning records exist
- Fallback "Growing Roots" chip appears when all modules map to done (covers fix #3)

---

### 5. No tests for Growing Roots expansion in MemberDashboard
**File:** `dashboard/src/components/MemberDashboard.tsx` line ~261
**Feedback:** The new per-module sub-row expansion in the member profile has no test coverage.
**Fix:** Add tests to the existing `MemberDashboard.test.tsx` covering:
- Per-module sub-rows render when a "Growing Roots" joining-journey item is present
- Module status comes from `learningRecords` when available
- Missing modules fall back to "Not Started"
- 30d deadline badge appears for Safeguarding and Safety modules

---

### 6. Synthesising "Not Started" Growing Roots records inflates learning data — ✅ DONE
**File:** `dashboard/src/utils.ts` line ~158
**Feedback:** `transformLearningResults` now synthesises 6 extra "Not Started" records per member. This inflates `learningRecords` size (IndexedDB cache, ComplianceTable, compliance summary) even though the UI already handles missing modules via a fallback.
**Fix:** Remove the synthesis of missing Growing Roots modules from `transformLearningResults`. The `JoiningJourneyProgress` and `MemberDashboard` components already have UI-level fallbacks that treat absent records as "Not Started". Removing synthesis keeps compliance stats accurate and avoids cache bloat. Update `utils.test.ts` expectations to match the removed synthesised records.

---

### 7. Outdated doc comment on `transformLearningResults` — ✅ DONE
**File:** `dashboard/src/utils.ts` line ~109
**Feedback:** The JSDoc comment still describes the old behaviour (only includes modules with expiry dates + First Response). The comment is now misleading to callers.
**Fix:** Update the function-level JSDoc to accurately describe the current inclusion rules:
- Always includes First Response (any status)
- Always includes all Growing Roots modules (present records included regardless of expiry; if synthesis is removed per fix #6, note that absent modules are _not_ synthesised)
- Excludes all other records without an expiry date

---

## Sequencing

Fixes should be applied roughly in dependency order:

1. **Fix #6** (remove synthesis from utils.ts) + **Fix #7** (update doc comment) — foundational, affects test expectations
2. **Fix #1** (remove duplicate in mock-data.ts) — independent data cleanup
3. **Fix #2** (sort count) + **Fix #3** (fallback chip) — logic corrections in JoiningJourneyProgress
4. **Fix #4** (JoiningJourneyProgress tests) — write after logic fixes are in place
5. **Fix #5** (MemberDashboard tests) — independent, can run in parallel with Fix #4

After each logical group: `cd dashboard && npm test` to confirm green.
