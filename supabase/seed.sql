-- seed.sql — minimal data so the function can be exercised locally.

insert into app_users (id, email, city) values
  ('11111111-1111-1111-1111-111111111111', 'rider.one@example.com', 'Lisbon'),
  ('22222222-2222-2222-2222-222222222222', 'rider.two@example.com', 'Porto')
on conflict do nothing;

-- Rider two bought a 110-credit pack, then spent 30 on rides => balance 80.
insert into credit_balances (user_id, balance) values
  ('11111111-1111-1111-1111-111111111111', 0),
  ('22222222-2222-2222-2222-222222222222', 80)
on conflict do nothing;

insert into purchases (id, user_id, platform, product_id, provider_transaction_id, credits_granted, raw_receipt) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'android', 'credits_100', 'GPA.0000-0000-0000-00001', 110, 'seed')
on conflict do nothing;

insert into credit_ledger (user_id, delta, reason, purchase_id) values
  ('22222222-2222-2222-2222-222222222222', 110, 'purchase', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('22222222-2222-2222-2222-222222222222', -30, 'ride_unlock', null)
on conflict do nothing;

insert into ride_unlocks (user_id, vehicle_code, credits_spent) values
  ('22222222-2222-2222-2222-222222222222', 'SCOOT-4471', 30)
on conflict do nothing;

insert into app_versions (platform, latest_version, min_supported_version, store_url) values
  ('ios',     '3.4.1', '3.2.0', 'https://apps.apple.com/app/id000000000'),
  ('android', '3.4.1', '3.2.0', 'https://play.google.com/store/apps/details?id=com.commutepass.app')
on conflict do nothing;
