# f1nanc3

Where your money goes, from your bank statements. A web app for the phone
and the desktop browser, at <https://finance.kaylamc.uk>, in t1ld3's look
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
- **Categories** are guessed from the merchant's name. Money moving
  between your own accounts (the same amount out of one and into another
  within a day) is marked as a transfer and left out of every total.
- **13 months** are kept: the current month and the 12 before it. A daily
  job on the server deletes anything older.

- **Bank connection** (Enable Banking): connect RBS once from **me**, and
  new transactions arrive every morning at 6am UK time, or on **sync now**.
  Connecting fetches as much history as the bank gives, up to 13 months.
  Bank and CSV transactions don't double up (same account, date and
  amount). A banner shows from 7 days before the bank's approval runs out.

Coming next: budgets with an 80% alert, subscriptions, month-by-month
trends.

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
node tests/stub_server.mjs    # a pretend Supabase, then open:
# http://localhost:8765/?api=http://localhost:8766  (any email/password)
python tools/make_icons.py    # redraws icons/ (needs Pillow)
```

New files the app loads must be added to `SHELL` in `sw.js`, or it breaks
offline.
