-- 0003_unique_provider_txn.sql
-- Make the provider transaction id unique so a racing/duplicate verify request
-- can never create two purchase rows for the same store transaction. Postgres
-- allows multiple NULLs, so rows without a provider id (rare) are unaffected.
-- This is the database-level backstop for the TOCTOU double-credit bug; the
-- Edge Function also does an atomic dedup+credit inside a transaction.

create unique index if not exists purchases_provider_txn_id_key
  on purchases (provider_transaction_id)
  where provider_transaction_id is not null;
