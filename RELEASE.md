# Release plan (Part D)

How I would roll these changes out safely to production. See `BUGREPORT.md` for
the defects being shipped against; `NOTES.md` for the reading notes.

## Scope of this release

1. `verify-purchase` hardening (B1–B3, B5, B7): server-side credits, verified
   identity, atomic dedup+credit, Google acknowledgement, no plaintext receipts.
2. `verify-purchase` + `app-version` + `products` support for the new
   `credits_600` pack (Part C1).
3. `app-version` semver fix (B6 / Part C2) + real tests.
4. Migration `0003` — unique partial index on
   `purchases.provider_transaction_id`.

## Order of operations

1. **DB migration first.** Apply `supabase/migrations/0003_unique_provider_txn.sql`
   to production. It is additive (`create unique index if not exists`), safe to
   run on a live DB. *Precondition:* the schema must currently have no
   duplicate `provider_transaction_id` rows, or the index creation will fail —
   run a quick check:
   ```sql
   select provider_transaction_id, count(*) from purchases
   where provider_transaction_id is not null
   group by 1 having count(*) > 1;
   ```
   If duplicates exist, stop and dedup them first (see "Handling affected data").
2. **Deploy `app-version` + `verify-purchase` functions** (function deploys are
   independent of the migration; both can go after the index is up).
3. **Add the `credits_600` catalog entry** — it ships in the `verify-purchase`
   deploy via `products.ts`, so this is automatic. Coordinate with the client
   team to publish `credits_600` in App Store Connect / Play Console **and** add
   it to the client's pack list (`app/purchase.ts` CREDIT_PACKS) — the client
   must not show the pack before the backend catalog has it.
4. **Tests already gating CI:** `deno task test` (9 cases).

## Pre-deploy verification

- `deno task test` green; `deno check` on both functions green.
- Staging: with `IAP_MOCK=1` and a local Postgres, run `verify-purchase` for
  `credits_100`, then **repeat the exact same request** and assert the second
  response is `alreadyProcessed: true` with `balanceDelta: 0`.
- Fire **two concurrent identical requests** (e.g. `Promise.all`/parallel curl)
  and assert the balance moved by exactly 110, not 220 — exercises the
  atomic dedup + unique index.
- Send a request with a bogus `credits` value and a request for a bogus
  `productId`; assert rejection (unknown product / invalid receipt).
- Assert `credits_600` → balanceDelta 700.
- `app-version`: hit it with `version=3.9.9` and `version=3.10.0` against
  `min_supported_version=3.2.0`; the first forces an update, the second does
  not.

## Post-deploy verification (production)

- Canary first: deploy to a single instance / one function version and watch
  error rates and `alreadyProcessed` rates for 30 min.
- Watch for `23505`-based `alreadyProcessed` responses rising to ~0 quickly
  (they should only happen under genuine concurrent retries).
- Sample a few `purchases` rows and confirm `provider_transaction_id` populated
  for both platforms.
- Alert check: p95 latency of `verify-purchase` (the added transaction and ack
  call add modest latency; keep an eye on the Google ack duration).
- Real-money smoke test with one internal test account on each store (sandbox/
  test card), verifying balance and ledger.

## Rollback

- **Migration:** it's additive; to roll back, `drop index if exists
  purchases_provider_txn_id_key;` — but the new function code already relies on
  the transaction/atomic path, so prefer keeping the index.
- **Functions:** roll back to the previous deployed version of `verify-purchase`
  / `app-version` via Supabase CLI (`supabase functions deploy ... --no-verify-jwt`/
  version pinning or the dashboard). Note the old `verify-purchase` **reintroduces
  B1–B3**, so a rollback decision should weigh: if we roll back, pause the IAP
  flow or keep dedup at the DB (the unique index still blocks duplicate inserts
  even for the old code — the old code would return a 500 on 23505 rather than
  credit twice; acceptable short-term).
- **Catalog:** remove `credits_600` from the store consoles + client list; the
  backend rejects unknown products anyway.

## Handling data already affected by the bugs

Two categories:

1. **Already-credited balances / duplicate ledger rows** from B3. Do **not**
   blanket-delete or blanket-credit. Reconcile first, read-only:
   ```sql
   -- expected = purchases summed + spend + adjustments
   select u.id, u.balance as current_balance,
          (select coalesce(sum(credits_granted),0) from purchases p where p.user_id=u.id)
            + (select coalesce(sum(-credits_spent),0) from ride_unlocks r where r.user_id=u.id)
            + (select coalesce(sum(delta),0) from credit_ledger l
                where l.user_id=u.id and l.reason='adjustment')
            as expected_balance
   from credit_balances u
   where u.balance <> expected_balance;
   ```
   Then apply **one** corrective transaction per affected user (or a small
   batched one), documented in the ledger as `reason='adjustment'`, with a
   before/after snapshot. Keep the ledger; never truncate it.

2. **Customers who never got credited** because their duplicate request got
   `alreadyProcessed: true` while the first call actually failed. Find purchases
   with no ledger row and reconcile those against store transaction ids.

## Decision on `scripts/recompute_balances.ts`

**Do not run it as-is.** Reasons:

- It `truncate credit_ledger` — destroying the audit trail we need for support
  and for the reconciliation above.
- It rebuilds `credit_balances` **only from `purchases`**, which means every
  rider's spend (`ride_unlocks`) and any `adjustment` ledger entries are wiped
  out. On the seed data alone, rider two would jump from 80 back to 110 —
  i.e. free credits = direct revenue loss.
- It is **not transactional**: a crash after `truncate` leaves the ledger empty
  and balances stale with no way back.
- It has no backup / pre-flight checks and no idempotency marker.

The previous developer's note ("I've tested it on my machine") does not offset
those risks. What I'd do instead: fix the root cause (done, B3), run the
read-only reconciliation above, and if real drift exists, apply a vetted,
transactional, backup-first corrective migration. If the team still wants a
recompute utility, I'd write a new one that is transactional, honors
`ride_unlocks` and `adjustments`, and leaves the ledger intact.

## Follow-ups (would do with more time)

- Webhook/notification handling for Apple refunds and Google voided purchases
  (post-credit reversal).
- `verify_jwt` enabled at the function level in `config.toml` as defense in
  depth on top of the in-code signature check.
- Keep-alive/retry semantics for the Google acknowledge call (queued retry
  rather than a single log line).
