# Submission notes

## What I finished

- **Part A** — `NOTES.md`: end-to-end purchase walkthrough plus a table of
  risks/oddities found while reading (server-side credit safety, unverified
  JWT/authorization, TOCTOU dedup, Apple `in_app[0]`, Google ack, semver
  string compare, plaintext receipt logging).
- **Part B** — `BUGREPORT.md`: seven issues fixed (B1–B7) with root causes,
  severity, fix, and alternatives weighed. Core money-safety changes:
  - credits sourced from the server catalog, not the client;
  - verified caller identity (`SUPABASE_JWT_SECRET`) drives the credited account;
  - atomic dedup + credit in one transaction, backed by a unique index
    (migration `0003`) so credits are granted exactly once;
  - Google acknowledgement; Apple `in_app` selection + sandbox fallback.
- **Part C** — `credits_600` (700 credits, $44.99) added to the server catalog
  so it credits the right amount and inherits all of Part B; `app-version` now
  compares semvers numerically and the test scaffold in `test/` is real and
  green (plus extra cases and a catalog test).
- **Part D** — `RELEASE.md`: migration-first order, pre/post verification,
  rollback, affected-data reconciliation, and a clear **do-not-run** decision on
  `scripts/recompute_balances.ts` with the reasoning.

## Verification done

- `deno check` passes on `verify-purchase`, `app-version`, `_shared/version.ts`,
  `_shared/auth.ts`, `_shared/db.ts`.
- `deno task test` → 9/9 passing (semver comparison + catalog).
- I did not run against a live Postgres (none local here); the atomic/dedup path
  is exercised conceptually and the DB ingredient is the unique index, which I
  verified by reading the schema. Ideally I'd add an integration test with a
  throwaway Postgres, listed below.

## What I'd do with more time

1. Real `verify-purchase` integration tests against a throwaway Postgres
   (concurrent duplicate requests → exactly-once credit).
2. Enable `verify_jwt: true` at the function level as defense in depth.
3. Queued/retried handling of the Google acknowledge call and a consumer for
   Apple/Google refund/void notifications (post-credit reversal).
4. A vetted, transactional corrective migration if the read-only reconciliation
   in `RELEASE.md` shows real drift; I deliberately did **not** ship a
   destructive recompute script.
5. `credits_600` in the client's `CREDIT_PACKS` list (coordinated with the app
   team / store consoles) — the server side is already correct.

## Time spent

Approx. 4–5 hours (reading + fixes + tests + docs).