-- f1nanc3's tables, in the same Supabase project as t1ld3 (the same
-- accounts). They're separate from t1ld3's `items` table: bank data is
-- queried by date and old months are deleted, which a generic synced
-- table doesn't suit. Safe to run again.

-- One row per bank transaction. Amounts are pounds: negative is money
-- out, positive is money in. `id` is a hash of the transaction's details
-- (js/csv.js), so uploading the same statement twice adds nothing.
create table if not exists public.fin_transactions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  account text not null,
  booked_on date not null,
  amount numeric(12, 2) not null,
  description text not null,
  merchant text not null,
  type text not null default '',
  category text not null,
  -- auto: guessed; rule: from a merchant you categorised; manual: set on
  -- this transaction by hand. Only `auto` and `rule` are ever re-guessed.
  category_source text not null default 'auto' check (category_source in ('auto', 'rule', 'manual')),
  source text not null default 'csv' check (source in ('csv', 'bank')),
  balance numeric(12, 2),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists fin_transactions_user_booked_on
  on public.fin_transactions (user_id, booked_on);

-- "Always put this merchant in this category", made when you correct one.
create table if not exists public.fin_rules (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  merchant text not null,
  category text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, merchant)
);

alter table public.fin_transactions enable row level security;
alter table public.fin_rules enable row level security;

drop policy if exists "Users manage their own transactions" on public.fin_transactions;
create policy "Users manage their own transactions"
  on public.fin_transactions
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users manage their own rules" on public.fin_rules;
create policy "Users manage their own rules"
  on public.fin_rules
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.fin_transactions, public.fin_rules from anon;
grant select, insert, update, delete on public.fin_transactions, public.fin_rules to authenticated;

-- Money moving between your own accounts isn't spending or income. Marks
-- pairs as transfers: the same amount out of one of your accounts and
-- into another within a day. Leaves hand-set categories alone. Runs as
-- the caller, so row-level security keeps it to their own rows.
create or replace function public.fin_mark_transfers()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  marked integer;
begin
  update public.fin_transactions t
  set category = 'transfers', category_source = 'auto'
  where t.user_id = (select auth.uid())
    and t.category_source = 'auto'
    and t.category <> 'transfers'
    and exists (
      select 1 from public.fin_transactions other
      where other.user_id = t.user_id
        and other.account <> t.account
        and other.amount = -t.amount
        and other.booked_on between t.booked_on - 1 and t.booked_on + 1
    );
  get diagnostics marked = row_count;
  return marked;
end;
$$;

revoke all on function public.fin_mark_transfers() from public, anon;
grant execute on function public.fin_mark_transfers() to authenticated;

-- Keeps the current month and the 12 full months before it (UK time).
-- On 1 December 2026 everything from November 2025 goes.
create extension if not exists pg_cron;

select cron.schedule(
  'f1nanc3-retention',
  '15 3 * * *',
  $$
  delete from public.fin_transactions
  where booked_on < (date_trunc('month', now() at time zone 'Europe/London') - interval '12 months')::date;
  $$
);

-- The bank connection (Enable Banking), one row per time you connect.
-- Only the server functions (supabase/functions) write it, using the
-- service role; you can read your own rows to see the connection's state.
-- The session id is useless without the app's private key, which only
-- the functions hold.
create table if not exists public.fin_bank_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bank text not null,
  -- pending: sent to the bank to approve; active: fetching daily;
  -- disconnected: stopped by you; expired: the bank's approval ran out.
  status text not null default 'pending' check (status in ('pending', 'active', 'disconnected', 'expired')),
  state text,
  session_id text,
  valid_until timestamptz,
  -- [{uid, account: "…1234", name}]
  accounts jsonb not null default '[]',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists fin_bank_links_user on public.fin_bank_links (user_id, created_at desc);

alter table public.fin_bank_links enable row level security;

drop policy if exists "Users see their own bank links" on public.fin_bank_links;
create policy "Users see their own bank links"
  on public.fin_bank_links
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.fin_bank_links from anon, authenticated;
grant select (id, bank, status, valid_until, accounts, last_synced_at, last_error, created_at)
  on public.fin_bank_links to authenticated;

-- fin_mark_transfers for one user, for the server's daily fetch (which
-- runs as the service role, so auth.uid() is empty there).
create or replace function public.fin_mark_transfers_for(target uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  marked integer;
begin
  update public.fin_transactions t
  set category = 'transfers', category_source = 'auto'
  where t.user_id = target
    and t.category_source = 'auto'
    and t.category <> 'transfers'
    and exists (
      select 1 from public.fin_transactions other
      where other.user_id = t.user_id
        and other.account <> t.account
        and other.amount = -t.amount
        and other.booked_on between t.booked_on - 1 and t.booked_on + 1
    );
  get diagnostics marked = row_count;
  return marked;
end;
$$;

revoke all on function public.fin_mark_transfers_for(uuid) from public, anon, authenticated;
grant execute on function public.fin_mark_transfers_for(uuid) to service_role;

-- Your choices about a monthly payment, by merchant: subscription or
-- bill, a link to manage it, or "not a subscription" (hidden). Anything
-- not set here comes from the built-in list (js/services.js).
create table if not exists public.fin_subscriptions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  merchant text not null,
  kind text check (kind in ('subscription', 'bill')),
  url text check (url is null or url ~ '^https?://'),
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, merchant)
);

alter table public.fin_subscriptions enable row level security;

drop policy if exists "Users manage their own subscription settings" on public.fin_subscriptions;
create policy "Users manage their own subscription settings"
  on public.fin_subscriptions
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.fin_subscriptions from anon;
grant select, insert, update, delete on public.fin_subscriptions to authenticated;

-- Names for your accounts ("…5231" -> "current"), and whether each is
-- money to spend or savings, for the overview's balance.
create table if not exists public.fin_accounts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account text not null,
  name text check (name is null or char_length(name) <= 40),
  kind text not null default 'spending' check (kind in ('spending', 'savings')),
  updated_at timestamptz not null default now(),
  primary key (user_id, account)
);

alter table public.fin_accounts enable row level security;

drop policy if exists "Users manage their own account names" on public.fin_accounts;
create policy "Users manage their own account names"
  on public.fin_accounts
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.fin_accounts from anon;
grant select, insert, update, delete on public.fin_accounts to authenticated;

-- Your budget: the plan you picked (steady, push or hard) and any
-- categories you've set yourself ({category: pounds}). The budgets
-- themselves are worked out from your spending (js/budget.js).
create table if not exists public.fin_budget (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  plan text check (plan in ('steady', 'push', 'hard')),
  amounts jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.fin_budget enable row level security;

drop policy if exists "Users manage their own budget" on public.fin_budget;
create policy "Users manage their own budget"
  on public.fin_budget
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.fin_budget from anon;
grant select, insert, update, delete on public.fin_budget to authenticated;

-- When you cancelled a subscription or bill (subs page): it counts as
-- ended from then, unless it charges you again afterwards.
alter table public.fin_subscriptions add column if not exists cancelled_on date;

-- Money you've moved yourself and added by hand (settings: move money)
-- before the statement shows it: source "manual". Importing the statement
-- replaces them with the bank's own (js/manual.js).
alter table public.fin_transactions drop constraint if exists fin_transactions_source_check;
alter table public.fin_transactions add constraint fin_transactions_source_check
  check (source in ('csv', 'bank', 'manual'));

-- Notifications. f1nanc3 keeps its own list of devices, apart from
-- t1ld3's push_subscriptions, so neither app's alerts turn up in the other.
create table if not exists public.fin_push_subscriptions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);

alter table public.fin_push_subscriptions enable row level security;

drop policy if exists "Users manage their own f1nanc3 devices" on public.fin_push_subscriptions;
create policy "Users manage their own f1nanc3 devices"
  on public.fin_push_subscriptions
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.fin_push_subscriptions from anon;
grant select, insert, update, delete on public.fin_push_subscriptions to authenticated;

-- Alerts already sent ("budget:2026-11:eating out:80", "payday:2026-11"),
-- so each goes once. Only the server functions read and write it.
create table if not exists public.fin_alerts_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.fin_alerts_sent enable row level security;
revoke all on public.fin_alerts_sent from anon, authenticated;
