# CLAUDE.md

Guidance for Claude Code in this repository.

## Overview

f1nanc3 is a personal finance web app (PWA) at https://finance.kaylamc.uk: bank statements in, spending by category out. It's a sibling of t1ld3 (`~/Projects/resonance`, whose `phone/` app this one is modelled on) and shares its Supabase project (`zuzpyrwoovdavbuqrqpx`) and accounts, but nothing else. Plain JS modules, no build step, no dependencies; GitHub Pages deploys `main` (`.github/workflows/pages.yml`).

The owner wants nothing they won't use: **ask before adding any feature** that isn't in the plan below.

## Commands

```bash
node tests/logic.mjs          # the no-UI logic
node tests/stub_server.mjs    # app on :8765, pretend Supabase on :8766
# open http://localhost:8765/?api=http://localhost:8766 and sign in with anything
python tools/make_icons.py    # redraws icons/
```

## Architecture

- `js/app.js`: hash routing (`#/`, `#/m/2026-11`, `#/tx?month=&category=`, `#/tx/<id>`, `#/import`, `#/me`), header trail, tab bar, and dispatch: elements carry `data-action`/`data-form`/`data-input` names that each view exports in `actions`/`forms`/`inputs`. Views return `{crumbs, html}`; everything from a statement goes through `esc()`.
- `js/cloud.js`: auth (session in `localStorage` under `f1nanc3.session`) and PostgREST calls. `js/config.js` holds the public URL and publishable key; `?api=` overrides it on localhost only.
- `js/data.js` (`Finance`): loads the window's transactions and the rules into memory. Bank data is never cached on the device (not in localStorage, not in the service worker).
- No-UI logic: `js/csv.js` (finds columns by name; RBS layout is Date, Type, Description, Value, Balance, Account Name, Account Number, with `'`-prefixed fields; ids are a hash of account|date|amount|description|occurrence so re-imports are no-ops), `js/categories.js` (`merchantOf` makes the key rules are stored under, `guessCategory`), `js/money.js` (pounds, months, the window), `js/summary.js`.
- Database (`supabase/schema.sql`, safe to re-run): `fin_transactions` (PK `user_id, id`; `category_source` auto/rule/manual; only auto/rule get re-guessed), `fin_rules` (merchant → category), `fin_mark_transfers()` (security invoker; pairs equal and opposite amounts across accounts within a day), and the `f1nanc3-retention` cron job (keeps the current month plus 12).
- The river (`#/river`, `#/river/<month>`): `js/flow.js` is the no-UI shape (`riverBands`, `allocateRows`, `riverLayout`: a trunk about half the height fanning out to slots; categories in the fixed `CATEGORIES` order so months morph rather than reorder) and `js/views/river.js` draws it on one canvas of monospace cells, flowing at 10fps and easing between months (the last shape is kept in module state). Views can return `mounted()`, which `app.js` calls once the HTML is on the page; the river stops itself when its canvas leaves the page. Reduced motion draws it still.
- Look: copied from t1ld3's `phone/style.css`; day/night follow the device; the accent is fixed orange (no picker, by the owner's choice).
- New files must be added to `SHELL` in `sw.js`.

## Plan (agreed with the owner, 2026-11-22)

RBS current accounts only, GBP only. Categories are a generic fixed set; transfers between own accounts are excluded; budgets are per category per calendar month, no rollover.

1. Done: CSV import, transactions, categories (corrections remembered per merchant), overview, laptop layout (sidebar, columns, table with a detail panel, from 900px), day/night/auto switch (per device), and the river.
2. Next: Enable Banking (free tier for your own accounts) via a Supabase edge function holding the key as a secret; daily fetch at 06:00 Europe/London; CSV stays for backfill, so bank rows must dedupe against CSV rows (ids won't match: match on account, date, amount).
3. Then: budgets with a push at 80% (phone and desktop browser), subscriptions detection, income vs spending trends, a push 5 days before the bank consent expires. Push needs care: t1ld3's `push_subscriptions` table and functions send to every subscription a user has, so f1nanc3's subscriptions must be kept apart (for example an `app` column) or t1ld3's reminders would arrive here too.

Later: notes on transactions. Not wanted for now: savings goals, an accent picker.
