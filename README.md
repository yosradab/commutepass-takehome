# CommutePass — backend slice (take-home starter)

> This is a **neutral sample project** built solely for this hiring exercise.
> It is not our product and does not resemble what we actually run. It exists
> to give you a realistic codebase to read, fix, and reason about.

**CommutePass** is an e-scooter / bike-share app. Riders buy **ride-credit**
packs via in-app purchase; credits are debited each time they unlock a vehicle.
This repo contains the purchase-verification backend and a small app-version
endpoint. It mirrors a common production stack: **Supabase Edge Functions
(Deno / TypeScript)** over **Postgres**, with **Apple StoreKit** and **Google
Play Billing** IAP.

This is a *slice*, not the whole app. Some things are stubbed on purpose. Read
`CANDIDATE_BRIEF.md` (one level up) for what we're asking you to do.

## Layout

```
supabase/
  migrations/            0001_init.sql, 0002_purchases.sql   (schema)
  seed.sql               a couple of users + version config
  functions/
    verify-purchase/     main IAP handler  (the heart of this exercise)
    app-version/         force-update endpoint
    _shared/             products catalog, db, apple, google, auth helpers
app/purchase.ts          Capacitor client excerpt (context only — what the app sends)
scripts/                 an operational script left by the previous dev
test/                    test scaffold
fixtures/                canned store responses for local runs
```

## Running locally (no store credentials needed)

You do **not** need real Apple/Google credentials. Set `IAP_MOCK=1` and the
validators read canned responses from `fixtures/`.

Requirements: [Deno](https://deno.com) 1.40+. Postgres is optional — you can
reason about and unit-test most of this without a live DB, but if you want the
full path, any local Postgres works (point `DATABASE_URL` at it and apply the
files in `supabase/migrations/` then `supabase/seed.sql`).

Type-check:

```bash
deno check supabase/functions/verify-purchase/index.ts
```

Run the verify-purchase function:

```bash
IAP_MOCK=1 DATABASE_URL=postgres://postgres:postgres@localhost:54322/postgres \
  deno task serve:verify
```

Example request the app would send (matches `app/purchase.ts`):

```bash
curl -s localhost:8000 \
  -H 'authorization: Bearer <supabase-jwt>' \
  -H 'content-type: application/json' \
  -d '{
    "userId": "11111111-1111-1111-1111-111111111111",
    "platform": "ios",
    "productId": "credits_100",
    "credits": 110,
    "receipt": "<base64 receipt>"
  }'
```

Tests:

```bash
deno task test
```
