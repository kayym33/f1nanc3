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
