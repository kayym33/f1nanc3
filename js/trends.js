// The numbers behind the charts page. No UI code. Transfers count for
// nothing, as everywhere else.
import { CATEGORIES, NOT_SPENDING } from "./categories.js";
import { addMonths, isoDate, monthLabel, monthOf, sum, windowMonths } from "./money.js";
import { monthSummary } from "./summary.js";

// The months kept, oldest first.
export function months(today = new Date()) {
  return windowMonths(today).reverse();
}

// [{month, in, out, left}] for each month.
export function inOut(transactions, list) {
  return list.map((month) => {
    const { income, spending, net } = monthSummary(transactions, month);
    return { month, in: income, out: spending, left: net };
  });
}

// Spending per category per month: {rows: [{category, values, total,
// average}], totals: [per month], total}. Only categories with spending,
// in the usual order. A category's value is what went out less refunds.
export function categoryGrid(transactions, list) {
  const index = new Map(list.map((month, i) => [month, i]));
  const cells = new Map();
  for (const t of transactions) {
    if (NOT_SPENDING.has(t.category)) continue;
    const i = index.get(t.booked_on.slice(0, 7));
    if (i === undefined) continue;
    if (!cells.has(t.category)) cells.set(t.category, list.map(() => []));
    cells.get(t.category)[i].push(-t.amount);
  }
  const rows = CATEGORIES.filter((category) => cells.has(category)).map((category) => {
    const values = cells.get(category).map((amounts) => Math.max(0, sum(amounts)));
    const total = sum(values);
    return { category, values, total, average: Math.round((total / list.length) * 100) / 100 };
  }).filter((row) => row.total > 0);
  const totals = list.map((_, i) => sum(rows.map((row) => row.values[i])));
  return { rows, totals, total: sum(totals) };
}

// Spending so far each day of this month and last month, running totals:
// {thisMonth: [day 1 .. today], lastMonth: [day 1 .. its last day], day}.
export function pace(transactions, today = new Date()) {
  const current = monthOf(today);
  const previous = addMonths(current, -1);
  const daysIn = (month) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const running = (month, length) => {
    const daily = Array(length).fill(0);
    for (const t of transactions) {
      if (!t.booked_on.startsWith(month) || NOT_SPENDING.has(t.category)) continue;
      const day = Number(t.booked_on.slice(8, 10));
      if (day <= length) daily[day - 1] -= t.amount;
    }
    let total = 0;
    return daily.map((amount) => (total = Math.round((total + amount) * 100) / 100));
  };
  const day = Number(isoDate(today).slice(8, 10));
  return { thisMonth: running(current, day), lastMonth: running(previous, daysIn(previous)), day, current, previous };
}

const cell = (value) => (/[",\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value));

// The grid as CSV, for a spreadsheet: categories down, months across,
// totals on both edges.
export function gridCsv(grid, list) {
  const lines = [["category", ...list.map(monthLabel), "total"]];
  for (const row of grid.rows) lines.push([row.category, ...row.values.map((v) => v.toFixed(2)), row.total.toFixed(2)]);
  lines.push(["total", ...grid.totals.map((v) => v.toFixed(2)), grid.total.toFixed(2)]);
  return lines.map((line) => line.map(cell).join(",")).join("\r\n") + "\r\n";
}

// A round number at or above `value` for an axis top: 1, 2 or 5 times a
// power of ten (£180 -> £200, £1,234 -> £2,000).
export function niceCeiling(value) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 5, 10].map((step) => step * power).find((step) => step >= value);
}
