-- 0002_purchases.sql
-- Purchase records + credit ledger.
--
-- Every verified IAP should create exactly one `purchases` row and one
-- `credit_ledger` credit. The app calls the verify-purchase Edge Function,
-- which is responsible for keeping these in sync with credit_balances.

create table if not exists purchases (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references app_users(id),
  platform                 text not null,          -- 'ios' | 'android'
  product_id               text not null,          -- e.g. 'credits_100'
  provider_transaction_id  text,                   -- Apple original_transaction_id / Google orderId
  credits_granted          bigint not null,
  raw_receipt              text,                    -- stored for audits/support
  created_at               timestamptz not null default now()
);

-- NOTE: dedup of repeated receipts is handled in the Edge Function today.
create unique index if not exists purchases_pkey_idx on purchases(id);

create table if not exists credit_ledger (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references app_users(id),
  delta          bigint not null,        -- +credit on purchase, -debit on ride unlock
  reason         text not null,          -- 'purchase' | 'ride_unlock' | 'adjustment'
  purchase_id    uuid references purchases(id),
  created_at     timestamptz not null default now()
);

-- Force-update / kill-switch config read by the app on launch.
create table if not exists app_versions (
  platform              text primary key,          -- 'ios' | 'android'
  latest_version        text not null,             -- semver, e.g. '3.4.1'
  min_supported_version text not null,             -- below this => force update
  store_url             text not null,
  updated_at            timestamptz not null default now()
);
