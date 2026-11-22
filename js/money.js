// Pounds, months and the 13-month window. No UI code.

const POUNDS = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const MONTHS = ["january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december"];

// £1,234.56, or -£12.50 with sign: true.
export function pounds(amount, { sign = false } = {}) {
  const text = POUNDS.format(Math.abs(amount));
  if (!sign || amount === 0) return text;
  return amount < 0 ? `-${text}` : `+${text}`;
}

// Adds amounts in pence, so 0.1 + 0.2 stays 0.30.
export function sum(amounts) {
  return amounts.reduce((total, amount) => total + Math.round(amount * 100), 0) / 100;
}

const pad = (value) => String(value).padStart(2, "0");

export function isoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// "2026-11" for a date or an ISO date string.
export function monthOf(date) {
  return typeof date === "string" ? date.slice(0, 7) : isoDate(date).slice(0, 7);
}

export function addMonths(month, count) {
  const [year, number] = month.split("-").map(Number);
  const index = year * 12 + (number - 1) + count;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

// "november 2026"
export function monthLabel(month) {
  const [year, number] = month.split("-").map(Number);
  return `${MONTHS[number - 1]} ${year}`;
}

// The first day kept: the 1st of the month 12 months before this one. On
// any day of November 2026 that's 2025-11-01. Matches the server's daily
// clean-up (supabase/schema.sql).
export function windowStart(today = new Date()) {
  return `${addMonths(monthOf(today), -12)}-01`;
}

// The months kept, newest first: 13 of them.
export function windowMonths(today = new Date()) {
  const current = monthOf(today);
  return Array.from({ length: 13 }, (_, index) => addMonths(current, -index));
}

// "fri 21 nov"
export function dayLabel(iso) {
  const date = new Date(`${iso}T12:00:00`);
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .replace(",", "").toLowerCase();
}
