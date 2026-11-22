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
- **Categories** are guessed from the merchant's name. Money moving
  between your own accounts (the same amount out of one and into another
  within a day) is marked as a transfer and left out of every total.
- **13 months** are kept: the current month and the 12 before it. A daily
  job on the server deletes anything older.

Coming next: a daily bank connection (Enable Banking), budgets with an 80%
alert, subscriptions, month-by-month trends.

## Setting it up (once)

1. **Database.** Run `supabase/schema.sql` against the t1ld3 Supabase
   project (SQL editor, or `npx supabase db query --remote -f
   supabase/schema.sql` from a linked folder). It's safe to run again.
2. **Hosting.** Settings → Pages: Source **GitHub Actions**, custom
   domain `f1nanc3.kaylamc.uk`, Enforce HTTPS. At LCN, add a CNAME record
   `f1nanc3` → `kayym33.github.io`. Every push to `main` deploys.
3. **On the iPhone.** Open the address in Safari, sign in, then share →
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
