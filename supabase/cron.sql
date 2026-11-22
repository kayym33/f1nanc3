-- Runs the bank-sync function every morning: 05:00 and 06:00 UTC, and the
-- function only fetches when it's 6am in the UK, so it's 6am in summer
-- and winter alike. Run this once the function is deployed (README).
-- Uses the cron secret t1ld3 already keeps in the vault
-- (t1ld3_cron_secret), which the functions know as CRON_SECRET.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'f1nanc3-bank-sync',
  '0 5,6 * * *',
  $$
  select net.http_post(
    url := 'https://zuzpyrwoovdavbuqrqpx.supabase.co/functions/v1/bank-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        select decrypted_secret from vault.decrypted_secrets where name = 't1ld3_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
