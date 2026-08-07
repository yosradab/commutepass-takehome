# Code-reading notes (Part A)

> Written *before* editing, while tracing the purchase path. Anything flagged here
> as wrong/risky is recorded for the record; fixes live in `BUGREPORT.md`.

## Purchase path, end to end

```
app / Capacitor client                          Supabase (Deno)                        Postgres
─────────────────────────                        ─────────────────────────────────────────────────
buyCredits(userId, productId)
  pick pack from CLIENT cache
  (credits_20=20, _100=110, _250=280)
  InAppPurchase.purchase() -> native store
  │
  POST /functions/v1/verify-purchase
  │  {userId, platform, productId, credits, receipt|purchaseToken}
  │
  └────► verify-purchase/index.ts
          1. getCaller(req)            JWT decode (sub claim)
          2. if ios   : verifyAppleReceipt   -> original_transaction_id
             if android: verifyGooglePurchase -> orderId
          3. findPurchaseByTxn(providerTxnId)  dedup
          4. insertPurchase(...)                 purchases row
          5. creditAccount(...)                  update credit_balances
                                                + insert credit_ledger
          6. return {ok, purchaseId, balanceDelta}
```

Numbered walkthrough:

1. **app/purchase.ts:17** `buyCredits` looks the pack up in a *client-side*
   constant array (`credits`) and launches the native store sheet.
2. **app/purchase.ts:25** — after the user pays, the client POSTs
   `{userId, platform, productId, credits, receipt, purchaseToken}` to
   `/functions/v1/verify-purchase`. The `credits` value it sends is derived
   from the same client array.
3. **verify-purchase/index.ts:40** — `getCaller` decodes the bearer JWT to learn
   the authenticated user's `sub`.
4. **index.ts:58-72** — store verification:
   - `ios`: `verifyAppleReceipt` (apple.ts) returns `originalTransactionId`.
   - `android`: `verifyGooglePurchase` (google.ts) returns `orderId` only when
     `purchaseState === 0`.
5. **index.ts:76** — `findPurchaseByTxn(providerTxnId)` checks whether this
   store transaction was handled before (dedup).
6. **index.ts:81-90** — new purchase: `insertPurchase` then `creditAccount`
   (db.ts) which bumps `credit_balances.balance` and appends a `credit_ledger`
   row (`reason='purchase'`).
7. Response `{ ok, purchaseId, balanceDelta }` goes back to the app, which
   already optimistically showed the credits in the wallet.

## What caught my eye while reading

| # | Location | Thing looked wrong / risky | Why it caught my eye |
|---|----------|---------------------------|-----------------------|
| A1 | index.ts:81-90 + purchase.ts:35 | The amount of credits granted (`credits`) comes from the **client**, not from `products.ts` (the declared source of truth). | A tampered client can claim any `credits` value. `products.ts` is imported nowhere in the handler. |
| A2 | index.ts:49 + 90 | The credited `userId` is the client-supplied `payload.userId`, never cross-checked against `getCaller().userId` (the JWT `sub`). | Attacker substitutes another `userId` to credit a victim. Also `auth.ts:13` explicitly notes `decode()` does **not** verify the signature. |
| A3 | index.ts:76-90 | Dedup check (`findPurchaseByTxn`) and the insert+credit are **not atomic** (TOCTOU). | Two concurrent calls with the same receipt can both pass the check and credit twice — matches the "double-credit" mentioned in `recompute_balances.ts` and the migration comment. |
| A4 | apple.ts:48 | Only `receipt.in_app[0]` is examined. | Multi-line receipts or refund/restore cases read the wrong entry; insufficient to pick the right `original_transaction_id`. |
| A5 | google.ts:44-48 | `orderId`/`productId` returned even when `purchaseState !== 0` (invalid) | Caller must remember `ok` and ignore other fields; easy foot-gun, `acknowledgementState` never checked. |
| A6 | google.ts + index.ts | `acknowledgementState` is never enforced; `acknowledgeGooglePurchase` exists but is unused. | Google requires acknowledging within 3 days or the purchase is refunded and can be re-purchased → potential double-credit / lost credit. |
| A7 | app-version/index.ts:41 | Semver compared as a **string** (`current < cfg.min_supported_version`). | Lexicographic compare: `"3.10.0" < "3.2.0"` is `true`, `"3.9.0" < "3.2.0"` is `true` → old builds not force-updated (and weird cases flip). Exactly the reported bug. |
| A8 | verify-purchase/index.ts:50 | Logs `receipt` / `purchaseToken` raw. | Sensitive PII/store tokens in structured logs. |
| A9 | scripts/recompute_balances.ts | `truncate credit_ledger` + rebuild from `purchases` only (ignores `ride_unlocks` and `adjustment` rows), non-transactional, no backups. | Cannot be "just run on prod" as-is; would zero everyone's spend and any manual adjustments. Decide in RELEASE.md. |
| A10 | index.ts:57 | `providerTxnId` typed `string \| null` but Google path can return `null` on an invalid purchase that is then used in `findPurchaseByTxn(null)` only when `ok` — boxed by the earlier return, but fragile ordering. | Minor; codified in fixes. |

### Things left **intentionally untouched** (scope / out of brief)
- The Capacitor client (`app/purchase.ts`) is context only; not built or edited.
- No greenfield rewrites — each fix is the smallest change that makes the system
  correct, per the brief.