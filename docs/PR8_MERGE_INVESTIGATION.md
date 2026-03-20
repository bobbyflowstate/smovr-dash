# PR #8 Merge Investigation

Date: 2026-03-09  
Repo: `bobbyflowstate/smovr-dash`  
PR reviewed: `https://github.com/bobbyflowstate/smovr-dash/pull/8`

## What I checked

1. Fetched PR head locally as branch `pr-8`.
2. Compared divergence from `main`.
3. Ran an actual local merge simulation (`main` + `pr-8`) on a temporary branch and captured conflicts.
4. Reviewed changed-file scope and overlap areas.

## Findings

## 0) What PR #8 actually implements (feature inventory)

Based on commit diff and `docs/SMOVR_PRO_FEATURES.md` on `pr-8`, this PR is a bundled “SMOVR Pro” feature drop. It is not a small bugfix PR.

### A. Team-level settings system

- New backend module: `convex/teamSettings.ts` (+ tests)
- New API + UI:
  - `src/app/api/settings/route.ts`
  - `src/app/settings/*`
- Adds team configuration beyond current baseline (language mode, scheduling URL, entry slug, etc.).

### B. Public booking flow (by team slug)

- New public API/pages:
  - `src/app/api/book/route.ts`
  - `src/app/book/[teamSlug]/page.tsx`
  - `src/app/api/teams/by-slug/route.ts`
- Introduces a scheduling-request style intake path tied to team slug.

### C. Website entry flow (“contact us” to SMS thread)

- New public API/pages:
  - `src/app/api/entry/route.ts`
  - `src/app/entry/[teamSlug]/page.tsx`
- Intended to start a patient text flow from a website form.

### D. Scheduling request tracking (internal dashboard)

- New Convex module: `convex/schedulingRequests.ts` (+ tests)
- New dashboard API/pages:
  - `src/app/api/requests/route.ts`
  - `src/app/requests/*`

### E. Referral workflow + patient status response

- New Convex module: `convex/referrals.ts`
- New APIs/pages:
  - `src/app/api/referrals/route.ts`
  - `src/app/api/referral-status/route.ts`
  - `src/app/referral-status/[token]/page.tsx`

### F. Additional automated reminder categories (“pro reminders”)

- New/expanded reminders module: `convex/proReminders.ts` (+ tests)
- Cron expansions in `convex/crons.ts` for:
  - birthday reminders
  - return-date reminders
  - referral follow-ups

### G. Reactivation campaign endpoint

- New API: `src/app/api/reactivation/route.ts`
- Expanded patient UI behavior in `src/app/patients/PatientsClient.tsx`.

### H. Middleware and security posture updates for new public routes

- `src/middleware.ts` changed to allow new public flows.
- New tests around public route behavior and settings:
  - `test/public_routes_security.test.ts`
  - `test/settings_route.test.ts`
  - `test/birthday_utils.test.ts`

### I. Shared/core plumbing changes

- Significant edits to:
  - `convex/webhook_utils.ts`
  - `convex/reminders.ts`
  - `src/lib/webhook-utils.ts`
  - `src/lib/api-utils.ts`
  - `convex/schema.ts`
  - generated Convex API typings
- These are high-coupling areas with current `main`.

## 1) Divergence is moderate, but PR scope is large

- Branch divergence (`main...pr-8`): `main ahead 5`, `pr-8 ahead 4`.
- PR-side delta since merge-base: **49 files changed**, about **6,838 insertions / 165 deletions**.
- PR introduces major new feature areas:
  - `convex/proReminders.ts`
  - `convex/referrals.ts`
  - `convex/schedulingRequests.ts`
  - `convex/teamSettings.ts`
  - New API routes/pages for booking/entry/referrals/requests/settings

## 2) Real merge simulation produced only 4 textual conflicts

Conflicted files:

1. `convex/reminders.ts`
2. `convex/webhook_utils.ts`
3. `src/app/audit-logs/AuditLogsClient.tsx`
4. `src/lib/webhook-utils.ts`

Non-conflict overlap areas (auto-merged but still need verification):

- `convex/_generated/api.d.ts`
- `convex/migrations.ts`

## 3) Highest-risk area is webhook/reminder logic

Current `main` has recent SMS/auth hardening and explicit precondition/error-path handling.  
PR #8 adds feature flows touching the same reminder/webhook surface.  
So even with only 4 textual conflicts, this is a **high semantic-risk merge area**.

Secondary semantic-risk areas:

- `convex/schema.ts` changes (new tables/fields) vs current production assumptions.
- `src/middleware.ts` public route rules (security exposure risk if merged incorrectly).
- `src/lib/api-utils.ts` auth behavior changes that may conflict with current auth migration hardening.

## Conclusions

## Can we fix conflicts and merge PR #8?

**Yes, technically feasible.** Conflict count is low and manageable.

## Should we merge PR #8 directly into main right now?

**Not recommended as a blind merge.**  
Reason: PR #8 is feature-heavy and overlaps core messaging/reminder paths where `main` has recent correctness fixes.

## Recommended path

Use a **targeted salvage approach** instead of “merge and pray”:

1. Create integration branch from current `main`.
2. Merge `pr-8`.
3. Resolve the 4 conflicts by preserving current `main` behavior for:
   - auth/SMS config enforcement
   - reminder failure reason mapping
   - team SMS config constraints
4. Keep PR feature additions (pro reminders/referrals/scheduling/team settings).
5. Run full tests + smoke paths:
   - sign-in magic link
   - appointment + confirmation SMS
   - inbound webhook
   - reminder cron flow
   - new PR feature routes
   - public-route auth boundary tests
   - settings + scheduling request flows
6. If integration branch stays unstable after conflict resolution and test pass attempts, then rebuild features selectively from PR commits onto main.

## Decision guidance

- If timeline is tight and risk tolerance is low: **rebuild selected features from PR onto main**.
- If you can spend focused integration time: **merge PR into integration branch and validate hard** (recommended first attempt, because conflict count is low).

## Bottom line

PR #8 should **not** be discarded.  
It should be **salvaged onto main via controlled integration**, with special care in reminder/webhook conflict files.
