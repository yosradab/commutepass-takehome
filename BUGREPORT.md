# Bug report (Part B)

For each issue: what / how found, root cause, severity & impact, fix, and
alternatives weighed. Root-cause first.

---

## B1 — Credits amount is client-controlled

- **What:** `app/purchase.ts` sends `credits` in the body and
  `verify-purchase/index.ts` granted that value verbatim (`index.ts:90`).
- **How found:** reading the flow — the server catalog `products.ts` is declared
  as the source of truth but is imported nowhere in the handler, so the number
  that reaches the database is whatever the client said.
- **Root cause:** the handler trusted client input for a financial amount
  instead of looking the product up server-side.
- **Severity:** **High — revenue/money safety.** A tampered client can claim
  `credits: 100000` for a $1.99 pack and be credited for it.
- **Fix:** handler now resolves `getProduct(productId)` and uses
  `product.credits`; unknown product ids are rejected with `400`. The client
  field is ignored.
- **Alternatives weighed:** validate `credits` against a range (rejected — no
  range is meaningful); trust the stores to return the amount (Apple/Google do
  not return a credit amount for consumables in a convenient, reliable way
  here). Server catalog lookup is the smallest correct fix.

## B2 — The credited account is the client-supplied userId, and the JWT is not verified

- **What:** the handler credited `payload.userId` (any user the caller asks
  for), and `auth.ts` only called `decode()`, which parses the token without
  checking its signature (the code even warns about this).
- **How found:** `auth.ts:13` explicitly documents `decode()` does not verify
  the signature; the handler never compared `payload.userId` with `caller.userId`.
- **Root cause:** identity came from an unauthenticated client field; the bearer
  token was only used as a formatting convenience.
- **Severity:** **High — security / data integrity.** Anyone can forge a bearer
  token with any `sub`, or just pass someone else's `userId`, and credit a
  victim's account. (Actual *spend* is protected elsewhere, but balance
  inflation on others' accounts is a real attack.)
- **Fix:** `getCaller` is now async and verifies the HMAC signature with
  `SUPABASE_JWT_SECRET` via djwt `verify` when the secret is set (fallback to
  `decode` only when no secret is configured, i.e. local `IAP_MOCK` dev). The
  handler requires an authenticated caller (`401`) and derives `userId` from
  the JWT `sub`, ignoring the client field.
- **Alternatives weighed:** keep trusting the client and only cross-check
  (rejected — same forgery problem); rely solely on the platform's
  `verify_jwt` toggle (documented, but the code should not silently accept
  unverified tokens when a secret is present).

## B3 — Double-credit race (TOCTOU) on repeated receipts

- **What:** dedup (`findPurchaseByTxn`) and credit were two separate
  operations with no transaction. Concurrent requests with the same receipt can
  both see "no existing purchase" and both credit.
- **How found:** the code path — check-then-act on a shared resource — and the
  previous dev's own handover note about "the double-credit issue".
- **Root cause:** non-atomic check-then-act; no unique constraint on
  `provider_transaction_id`.
- **Severity:** **High — money safety.** Exactly-once credit is the core
  invariant; a client retrying (or a mobile SDK retrying) is a normal event.
- **Fix:** added `recordPurchaseAndCredit()` in `db.ts`: dedup-check + insert +
  balance update + ledger write run inside one `sql.begin(...)` transaction. As
  a backstop, migration `0003` adds a unique partial index on
  `provider_transaction_id`; a racing insert surfaces as `23505` and is handled
  as `alreadyProcessed`.
- **Alternatives weighed:** Postgres advisory lock keyed on the transaction id
  (works, but the unique index also guarantees integrity at the data layer and
  is simpler to reason about); a client-provided idempotency key (rejected —
  providers already give us a stable id).

## B4 — Apple receipt validation reads only `in_app[0]`

- **What:** `apple.ts` took `json.receipt.in_app[0]`, so multi-line receipts
  (restore, refresh, multiple transactions) could report the wrong
  `original_transaction_id` / `product_id`.
- **How found:** reading the validator — `in_app` is an array; index `[0]` is
  not guaranteed to be the transaction being fulfilled.
- **Severity:** **Medium — correctness.** Risk of crediting the wrong product,
  or the dedup key not matching the transaction that was actually paid.
- **Fix:** the validator now filters line items by the requested `productId`
  (when provided), picks the newest by `purchase_date_ms`, and **fails closed**
  if no matching line item exists. It also retries Apple's sandbox endpoint on
  status `21007` (receipt from sandbox sent to production).
- **Alternatives weighed:** take the last entry in the array (rejected — not
  guaranteed to be ours either); ignore `productId` matching (rejected — could
  credit the wrong pack).

## B5 — Google verification returns usable `orderId` for invalid purchases and never acknowledges

- **What:** `google.ts` returned `orderId`/`productId` regardless of
  `purchaseState`, and the handler never called `acknowledgeGooglePurchase`
  (which Google requires within ~3 days or the purchase is refunded).
- **How found:** reading `google.ts` — `ok` and the returned fields were
  independent; `acknowledgeGooglePurchase` existed but had no callers.
- **Severity:** **Medium — money safety.** Un-acknowledged purchases are
  auto-refunded by Google; the same user can then buy again and be credited
  twice (second time legitimately), inflating balances.
- **Fix:** `verifyGooglePurchase` returns a usable `orderId` only when the
  purchase is genuinely valid (`purchaseState === 0`). The handler acknowledges
  after the credit is durably recorded (idempotent; failures are logged so a
  later verify retries).
- **Alternatives weighed:** acknowledge before crediting (rejected — a crash
  between ack and credit could credit with no ack left); consume the purchase
  (rejected — consumption cancels the ack if mis-ordered, and is not required
  for this flow).

## B6 — Force-update compares versions as strings

- **What:** `app-version/index.ts:41` did `current < min_supported_version` on
  strings. `"3.10.0" < "3.2.0"` is `true` lexicographically, so a real 3.10.0
  build was treated as old, and — the reported bug — a genuinely old build was
  sometimes not force-updated depending on the exact digits.
- **How found:** the product team's report ("sometimes doesn't force-update"),
  plus reading the comparison.
- **Root cause:** semantic version numbers compared with lexicographic string
  ordering.
- **Severity:** **High — operational safety.** The kill-switch exists to
  disable builds with critical bugs or breaking backend changes; a miss means
  those clients keep running against an incompatible backend.
- **Fix:** new `_shared/version.ts` `compareVersions()` does numeric
  per-segment comparison (with `-beta`-style suffixes tolerated); the function
  forces update when `compareVersions(current, min) < 0`. Tests in
  `test/version.test.ts` now cover the original scaffold cases plus
  two-digit-minor, equal-min, and suffix cases.
- **Alternatives weighed:** regex-parsed full semver library (overkill and adds
  a dependency); the numeric segment compare is a few lines and testable.

## B7 — Receipts/tokens logged in plaintext

- **What:** `index.ts:50` logged `receipt ?? purchaseToken` raw.
- **How found:** reading the handler.
- **Severity:** **Medium — privacy/security.** Store receipts and tokens in
  structured logs are recoverable credentials/PII.
- **Fix:** log only the product, user, and provider platform; never the raw
  receipt/token.

---

## Not fixed (deliberately, or need prod data)

- **`app/purchase.ts` client list** is context-only per the brief; it stays as
  the app's UI catalog. Once the server grants from `products.ts`, a client
  mismatch would surface as wrong credits — a follow-up to add `credits_600` to
  the client list is noted in `RELEASE.md`.
- **`recompute_balances.ts`** is addressed in `RELEASE.md` (decision: do **not**
  run as-is).
- **Apple refund handling** (users refunded after credit) and **Android
  consumption ordering** would need store-webhook/notifications integration —
  out of scope for this timebox, noted as next steps.
