-- Runs the fin-alerts function every morning: 08:00 and 09:00 UTC, and it
-- only sends in the UK's 9 o'clock hour, so 9am all year. Run once the
-- function is deployed. Uses t1ld3's vault secret (t1ld3_cron_secret),
-- which the functions know as CRON_SECRET.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'f1nanc3-alerts',
  '0 8,9 * * *',
  $$
  select net.http_post(
    url := 'https://zuzpyrwoovdavbuqrqpx.supabase.co/functions/v1/fin-alerts',
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
