// Finding subscriptions and bills: payments to the same merchant that
// come out about once a month. No UI code.
import { displayName, NOT_SPENDING } from "./categories.js";
import { isoDate } from "./money.js";
import { knownService } from "./services.js";

const DAY_MS = 24 * 60 * 60 * 1000;
// At least this many months, so a couple of coincidences don't count.
const MIN_MONTHS = 3;
// The usual gap between payments, in days: about a month.
const GAP_RANGE = [24, 38];
// Consecutive payments can differ by this much (a price rise, a bill
// that varies) and still be the same thing.
const STEP_SPREAD = 0.35;
// A price change is one of more than this; bills wobble by pennies.
const CHANGE_SHARE = 0.02;
// Not paid for this long: it looks like it's ended.
const ENDED_AFTER_DAYS = 45;

const dayOf = (iso) => new Date(`${iso}T12:00:00`);
const days = (from, to) => Math.round((dayOf(to) - dayOf(from)) / DAY_MS);

// The same day next month (or the month's last day): "2026-01-31" -> "2026-02-28".
export function nextMonth(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  const last = new Date(year, month + 1, 0).getDate();
  return isoDate(new Date(year, month, Math.min(day, last)));
}

// The most recent price change: {from, to, on} (on = the first payment at
// the new price), or null.
export function priceChange(payments) {
  for (let i = payments.length - 1; i > 0; i--) {
    const now = -payments[i].amount;
    const before = -payments[i - 1].amount;
    if (Math.abs(now - before) > before * CHANGE_SHARE) {
      // Only a lasting change: every payment since is at about the new price.
      const since = payments.slice(i).map((t) => -t.amount);
      if (since.every((amount) => Math.abs(amount - now) <= now * CHANGE_SHARE)) return { from: before, to: now, on: payments[i].booked_on };
      return null;
    }
  }
  return null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Every monthly payment, as [{merchant, name, kind, url, linkKnown,
// monthly, yearly, last, next, ended, hidden, change, payments}], most
// expensive first. `settings` is a Map of merchant -> {kind, url, hidden}
// you've set (fin_subscriptions); they win over the built-in list.
export function findSubscriptions(transactions, settings = new Map(), today = new Date()) {
  const todayIso = isoDate(today);
  const byMerchant = new Map();
  for (const t of transactions) {
    if (t.amount >= 0 || NOT_SPENDING.has(t.category) || t.category === "cash") continue;
    if (!byMerchant.has(t.merchant)) byMerchant.set(t.merchant, []);
    byMerchant.get(t.merchant).push(t);
  }
  const found = [];
  for (const [merchant, list] of byMerchant) {
    const payments = [...list].sort((a, b) => a.booked_on.localeCompare(b.booked_on));
    const months = new Set(payments.map((t) => t.booked_on.slice(0, 7)));
    if (months.size < MIN_MONTHS) continue;
    // About once a month: not a shop you go to every week.
    if (payments.length > months.size * 1.5) continue;
    const gaps = payments.slice(1).map((t, i) => days(payments[i].booked_on, t.booked_on));
    const gap = median(gaps);
    if (gap < GAP_RANGE[0] || gap > GAP_RANGE[1]) continue;
    // About the same each time, allowing for price rises and bills that vary.
    const steady = payments.slice(1).every((t, i) => {
      const before = -payments[i].amount;
      return Math.abs(-t.amount - before) <= before * STEP_SPREAD;
    });
    if (!steady) continue;

    const latest = payments.at(-1);
    const own = settings.get(merchant) ?? {};
    const service = knownService(merchant);
    const monthly = -latest.amount;
    found.push({
      merchant,
      name: service?.name ?? displayName(merchant),
      kind: own.kind ?? service?.kind ?? (latest.category === "bills" ? "bill" : "subscription"),
      url: own.url ?? service?.url ?? null,
      linkKnown: Boolean(service?.url),
      monthly,
      yearly: Math.round(monthly * 12 * 100) / 100,
      last: latest.booked_on,
      next: nextMonth(latest.booked_on),
      ended: days(latest.booked_on, todayIso) > ENDED_AFTER_DAYS,
      hidden: Boolean(own.hidden),
      change: priceChange(payments),
      payments,
    });
  }
  return found.sort((a, b) => b.monthly - a.monthly);
}
