# f1nanc3

Where your money goes, from your bank statements. A web app for the phone
and the desktop browser, at <https://f1nanc3.kaylamc.uk>, in t1ld3's look
(bone and ink, monospace, one orange accent), signed in with your t1ld3
account.

Plain HTML, CSS and JavaScript modules, with no build step. GitHub Pages
serves it as it is.

## What it does

- **Import** a statement CSV from RBS (other banks' layouts mostly work
  too). It's read on your device and you see what's in it before anything
  is uploaded. Uploading the same dates twice adds nothing.
- **Overview**: a month's money in and out, spending by category, and the
  latest transactions. Step back through the months kept.
- **List**: every transaction, searchable, filtered by month and category.
  Tap one to change its category; by default that also applies to every
  payment to the same merchant, now and in future.
- **River**: the month drawn as an ASCII river. Money comes in on the
  left, meets in the middle, and forks into a channel per category, each as
  wide as what went there; the glyphs flow, and the biggest channel is
  orange. Hover or tap a channel for its numbers, click through to its
  transactions, and step between months to watch the channels change.
- **Your year, wrapped**: a deck of full-screen cards from the last 365
  days (from the overview): where you went most, where it went, your
  biggest single spend, month by month, the priciest day of the week, your
  longest run without eating out, regular payments and what was left. Tap
  or use the arrow keys; they also move on by themselves.
- **Subs**: everything that comes out about once a month (three months or
  more), split into subscriptions and bills, with the total a month and a
  year, the next payment, and price rises. A built-in list of UK services
  (js/services.js) names them and links to where you manage or cancel
  them; add your own link for anything else, move anything between
  subscriptions and bills, or hide what isn't one.
- **Charts**: in vs out each month, this month's spending pace against
  last month, each category over time (small multiples), and a
  spreadsheet of categories by month (shaded by size, each cell opens its
  transactions) with a CSV download. Hover or tap any chart for its
  numbers.
- **Budget**: built from your pay, your bills and how you actually spend
  (a typical month over the last 6). Pick a plan (steady, push, hard) to
  trim non-essentials harder than essentials, see the monthly saving and
  how long to your savings goal (1.5 months' pay), and change any budget.
  This month shows what's left in each, a daily allowance, and warns at
  80%. "Where the non-essential money goes" lists the biggest places.
- **Settings** (⚙ at the top): your account, importing statements, theme.
- **Categories** are guessed from the merchant's name. Money moving
  between your own accounts (the same amount out of one and into another
  within a day) is marked as a transfer and left out of every total.
- **13 months** are kept: the current month and the 12 before it. A daily
  job on the server deletes anything older.

- **Bank connection** (Enable Banking, *parked*: its own-accounts mode
  doesn't offer UK banks, so it's switched off with `BANK_CONNECTION` in
  js/config.js): connect RBS once from **me**, and
  new transactions arrive every morning at 6am UK time, or on **sync now**.
  Connecting fetches as much history as the bank gives, up to 13 months.
  Bank and CSV transactions don't double up (same account, date and
  amount). A banner shows from 7 days before the bank's approval runs out.

- **Notifications** (settings → notifications, per device; on an iPhone,
  the home-screen app): a budget category at 80% and over, and a nudge
  before payday to move what's spare to savings. Checked at 9am every day
  and straight after an import; each alert goes once a month.

## Setting it up (once)

1. **Database.** Run `supabase/schema.sql` against the t1ld3 Supabase
   project (SQL editor, or `npx supabase db query --remote -f
   supabase/schema.sql` from a linked folder). It's safe to run again.
2. **Hosting.** Settings → Pages: Source **GitHub Actions**, custom
   domain `finance.kaylamc.uk`, Enforce HTTPS. At LCN, add a CNAME record
   `finance` → `kayym33.github.io`. Every push to `main` deploys.
3. **Bank connection** (Enable Banking, free for your own accounts).
   Register a **Production** application at enablebanking.com with the
   redirect URL `https://f1nanc3.kaylamc.uk/`, keep the downloaded `.pem`
   private key somewhere safe (never in this repo), and activate the app by
   linking your accounts in their Control Panel. Then, from this folder
   (after `npx supabase link --project-ref zuzpyrwoovdavbuqrqpx`):

   ```bash
   npx supabase secrets set ENABLE_BANKING_APP_ID=<application id> \
     ENABLE_BANKING_KEY="$(cat ~/keys/<your key>.pem)"
   npx supabase functions deploy bank --no-verify-jwt
   npx supabase functions deploy bank-sync --no-verify-jwt
   ```

   and run `supabase/cron.sql` (the 6am fetch; it uses t1ld3's vault
   secret `t1ld3_cron_secret`). Optional secrets: `ENABLE_BANKING_BANK`
   and `ENABLE_BANKING_COUNTRY` pick another bank (default Royal Bank of
   Scotland, GB).
4. **On the iPhone.** Open the address in Safari, sign in, then share →
   add to home screen.

## Privacy

- Bank data lives only in Supabase, behind your sign-in (row-level
  security: each account sees only its own rows). The app doesn't keep a
  copy on the device; the service worker caches only the app's own files.
- Only the last 4 digits of an account number are stored.
- `*.csv` is in `.gitignore`, so a statement can't be committed by mistake.
- The publishable key in `js/config.js` is public by design. Never put
  the service_role key in the app.

## Developing

```bash
node tests/logic.mjs          # statement reading, categories, the window
node tests/stub_server.mjs    # a pretend Supabase with a made-up year, then open:
# http://localhost:8765/?api=http://localhost:8766  (any email/password)
python tools/make_icons.py    # redraws icons/ (needs Pillow)
```

New files the app loads must be added to `SHELL` in `sw.js`, or it breaks
offline.
