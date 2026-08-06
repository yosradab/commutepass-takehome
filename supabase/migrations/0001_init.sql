-- 0001_init.sql
-- Core schema for CommutePass (a neutral sample app used only for this
-- evaluation — it is not anyone's real product).
--
-- CommutePass is an e-scooter / bike-share app. Riders buy "ride credit" packs
-- via in-app purchase; credits are debited each time they unlock a vehicle.

create extension if not exists "pgcrypto";

create table if not exists app_users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  city          text not null default 'Lisbon',
  created_at    timestamptz not null default now()
);

-- One row per user. `balance` is the source of truth the app reads.
create table if not exists credit_balances (
  user_id       uuid primary key references app_users(id) on delete cascade,
  balance       bigint not null default 0,
  updated_at    timestamptz not null default now()
);

-- Every time a rider unlocks a scooter/bike we debit credits. This is the only
-- place credits are *spent*.
create table if not exists ride_unlocks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app_users(id),
  vehicle_code  text not null,
  credits_spent bigint not null,
  created_at    timestamptz not null default now()
);
