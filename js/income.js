// Regular money in (your pay) and when it's next due, so a month before
// payday doesn't look like you're broke. No UI code.
import { displayName } from "./categories.js";
import { isoDate } from "./money.js";
import { nextMonth } from "./subscriptions.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MONTHS = 3;
const GAP_RANGE = [24, 38];
// Pay can vary with hours and overtime, so more than bills do.
const STEP_SPREAD = 0.6;

const days = (from, to) => Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / DAY_MS);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

// Money that comes in about once a month from the same place, for a
// roughly similar amount: [{merchant, name, amount, last, next}], biggest
// first. `amount` is the typical recent one: the middle of the last three.
// Only income counts (not transfers between your own accounts).
export function regularIncome(transactions) {
  const bySource = new Map();
  for (const t of transactions) {
    if (t.amount <= 0 || t.category !== "income") continue;
    if (!bySource.has(t.merchant)) bySource.set(t.merchant, []);
    bySource.get(t.merchant).push(t);
  }
  const found = [];
  for (const [merchant, list] of bySource) {
    const payments = [...list].sort((a, b) => a.booked_on.localeCompare(b.booked_on));
    const months = new Set(payments.map((t) => t.booked_on.slice(0, 7)));
    if (months.size < MIN_MONTHS || payments.length > months.size * 1.5) continue;
    const gap = median(payments.slice(1).map((t, i) => days(payments[i].booked_on, t.booked_on)));
    if (gap < GAP_RANGE[0] || gap > GAP_RANGE[1]) continue;
    const steady = payments.slice(1).every((t, i) => Math.abs(t.amount - payments[i].amount) <= payments[i].amount * STEP_SPREAD);
    if (!steady) continue;
    const last = payments.at(-1);
    const typical = median(payments.slice(-3).map((t) => t.amount));
    found.push({ merchant, name: displayName(merchant), amount: typical, last: last.booked_on, next: nextMonth(last.booked_on) });
  }
  return found.sort((a, b) => b.amount - a.amount);
}

// Regular income still to come this month: not yet paid this month, and
// due by the month's end (a late one counts as due today):
// [{name, amount, day}].
export function expectedIncome(transactions, today = new Date()) {
  const todayIso = isoDate(today);
  const month = todayIso.slice(0, 7);
  return regularIncome(transactions)
    .filter((source) => !source.last.startsWith(month) && source.next.slice(0, 7) <= month && days(source.last, todayIso) < 62)
    .map((source) => ({ name: source.name, amount: source.amount, day: Math.max(Number(todayIso.slice(8, 10)), source.next.startsWith(month) ? Number(source.next.slice(8, 10)) : 0) }));
}
