// The year in review: stats over the last 365 days, for the wrapped cards
// (views/wrapped.js). No UI code. Transfers count for nothing, as
// everywhere else.
import { NOT_SPENDING } from "./categories.js";
import { isoDate, sum } from "./money.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
// A payment counts as regular when it's in this many different months...
const REGULAR_MONTHS = 3;
// ...for about the same amount each time.
const REGULAR_SPREAD = 0.15;

const dayOf = (iso) => new Date(`${iso}T12:00:00`);
const weekday = (iso) => (dayOf(iso).getDay() + 6) % 7;
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

// The longest run of whole days without a transaction in `category`,
// between `first` and `last` (ISO dates). {days, from, to} or null.
export function longestWithout(transactions, category, first, last) {
  const hits = [...new Set(transactions.filter((t) => t.category === category).map((t) => t.booked_on))].sort();
  if (!hits.length) return null;
  const edges = [isoDate(new Date(dayOf(first) - DAY_MS)), ...hits, isoDate(new Date(+dayOf(last) + DAY_MS))];
  let best = null;
  for (let i = 1; i < edges.length; i++) {
    const days = Math.round((dayOf(edges[i]) - dayOf(edges[i - 1])) / DAY_MS) - 1;
    if (days > 0 && (!best || days > best.days)) {
      best = { days, from: isoDate(new Date(+dayOf(edges[i - 1]) + DAY_MS)), to: isoDate(new Date(dayOf(edges[i]) - DAY_MS)) };
    }
  }
  return best;
}

// Merchants paid in at least 3 different months for about the same
// amount each time: [{merchant, typical, months, paid, total}] (`paid` is
// the months, "2026-11"), biggest yearly total first.
export function regularPayments(spending) {
  const byMerchant = new Map();
  for (const t of spending) {
    if (!byMerchant.has(t.merchant)) byMerchant.set(t.merchant, []);
    byMerchant.get(t.merchant).push(t);
  }
  const regular = [];
  for (const [merchant, list] of byMerchant) {
    const months = new Set(list.map((t) => t.booked_on.slice(0, 7)));
    if (months.size < REGULAR_MONTHS) continue;
    // About one a month, not a shop you go to a lot.
    if (list.length > months.size * 1.5) continue;
    const amounts = list.map((t) => -t.amount);
    const typical = median(amounts);
    if (amounts.some((amount) => Math.abs(amount - typical) > typical * REGULAR_SPREAD)) continue;
    regular.push({ merchant, typical, months: months.size, paid: [...months].sort(), total: sum(amounts) });
  }
  return regular.sort((a, b) => b.total - a.total);
}

// Everything the cards need, or null when there's under a month of data.
export function yearStats(transactions, today = new Date()) {
  const last = isoDate(today);
  const since = isoDate(new Date(+dayOf(last) - 364 * DAY_MS));
  const year = transactions.filter((t) => t.booked_on >= since && t.booked_on <= last && t.category !== "transfers");
  if (!year.length) return null;
  const first = year.reduce((min, t) => (t.booked_on < min ? t.booked_on : min), last);
  const spanDays = Math.round((dayOf(last) - dayOf(first)) / DAY_MS) + 1;
  if (spanDays < 28) return null;

  const spending = year.filter((t) => !NOT_SPENDING.has(t.category) && t.amount < 0);
  const out = -sum(year.filter((t) => !NOT_SPENDING.has(t.category)).map((t) => t.amount));
  const income = sum(year.filter((t) => t.category === "income").map((t) => t.amount));

  // Where you went most, by number of visits.
  const merchants = new Map();
  for (const t of spending) {
    const entry = merchants.get(t.merchant) ?? { merchant: t.merchant, visits: 0, total: 0 };
    entry.visits++;
    entry.total = sum([entry.total, -t.amount]);
    merchants.set(t.merchant, entry);
  }
  const visited = [...merchants.values()].sort((a, b) => b.visits - a.visits || b.total - a.total);

  const categories = new Map();
  for (const t of year.filter((t) => !NOT_SPENDING.has(t.category))) {
    categories.set(t.category, sum([categories.get(t.category) ?? 0, -t.amount]));
  }
  const byCategory = [...categories].map(([category, total]) => ({ category, total }))
    .filter((row) => row.total > 0).sort((a, b) => b.total - a.total);

  const biggest = spending.reduce((max, t) => (!max || t.amount < max.amount ? t : max), null);

  // Each month's spending, oldest first. The current month is partial, so
  // it can be the priciest but never the cheapest.
  const monthly = new Map();
  for (const t of spending) monthly.set(t.booked_on.slice(0, 7), sum([monthly.get(t.booked_on.slice(0, 7)) ?? 0, -t.amount]));
  const months = [...monthly].map(([month, total]) => ({ month, total })).sort((a, b) => a.month.localeCompare(b.month));
  const peak = months.reduce((max, row) => (!max || row.total > max.total ? row : max), null);
  const whole = months.filter((row) => row.month !== last.slice(0, 7) && row.month !== first.slice(0, 7));
  const quietest = whole.reduce((min, row) => (!min || row.total < min.total ? row : min), null);

  // Average spending on each day of the week: the total on, say,
  // Saturdays over the number of Saturdays in the span.
  const weekdayTotals = Array(7).fill(0);
  for (const t of spending) weekdayTotals[weekday(t.booked_on)] -= t.amount;
  const weekdayCounts = Array(7).fill(0);
  for (let day = 0; day < spanDays; day++) weekdayCounts[weekday(isoDate(new Date(+dayOf(first) + day * DAY_MS)))]++;
  const weekdays = weekdayTotals.map((total, index) => Math.round((total / Math.max(1, weekdayCounts[index])) * 100) / 100);
  const priciestDay = weekdays.indexOf(Math.max(...weekdays));

  const eatingOut = categories.get("eating out") ?? 0;
  const groceryShops = spending.filter((t) => t.category === "groceries");
  const averageShop = groceryShops.length ? -sum(groceryShops.map((t) => t.amount)) / groceryShops.length : 0;

  return {
    from: first, to: last, income, out, left: sum([income, -out]),
    payments: spending.length,
    topMerchant: visited[0] ?? null,
    byCategory,
    biggest,
    months, peak, quietest,
    weekdays, priciestDay,
    streak: longestWithout(year, "eating out", first, last),
    eatingOut,
    // Eating out, counted in your average food shop.
    eatingOutInShops: averageShop > 0 && eatingOut > 0 ? Math.round(eatingOut / averageShop) : 0,
    regular: regularPayments(spending),
  };
}
