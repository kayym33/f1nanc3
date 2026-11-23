// The command line (#/ask): questions typed in a small fixed language,
// answered from the transactions in memory. No UI code, and nothing leaves
// the device: there's no AI here, only these words.
//
//   coffee since june       a word (or a category), from a month
//   tesco this month        this month, last month, this week, this year,
//                           today, in june, since june, last 30 days
//   biggest 5 [shopping]    the largest payments out
//   tesco vs aldi           two searches side by side
//   help
//
// Transfers between your own accounts are left out unless you ask for
// "transfers".
import { CATEGORIES } from "./categories.js";
import { addMonths, isoDate, monthOf, sum } from "./money.js";

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december"];

// Everyday words that mean a few places: matched like the category
// keywords, at the start of a word in the merchant.
export const ALIASES = {
  coffee: ["costa", "starbucks", "pret", "caffe nero", "nero", "coffee", "cafe", "tim hortons", "black sheep", "joe & the juice"],
  takeaway: ["deliveroo", "just eat", "uber eats", "ubereats", "dominos", "domino", "pizza hut"],
  takeaways: ["deliveroo", "just eat", "uber eats", "ubereats", "dominos", "domino", "pizza hut"],
  fuel: ["shell", "bp ", "esso", "texaco", "gulf", "petrol"],
  petrol: ["shell", "bp ", "esso", "texaco", "gulf", "petrol"],
  taxi: ["uber ", "bolt ", "taxi", "cab "],
  taxis: ["uber ", "bolt ", "taxi", "cab "],
  trains: ["trainline", "scotrail", "lner", "avanti", "national rail", "gwr", "northern"],
  train: ["trainline", "scotrail", "lner", "avanti", "national rail", "gwr", "northern"],
  flights: ["easyjet", "ryanair", "jet2", "british airways", "loganair", "wizz"],
  supermarket: ["tesco", "sainsbury", "asda", "aldi", "lidl", "morrisons", "co-op", "waitrose", "iceland", "ocado"],
  supermarkets: ["tesco", "sainsbury", "asda", "aldi", "lidl", "morrisons", "co-op", "waitrose", "iceland", "ocado"],
  streaming: ["netflix", "spotify", "disney", "prime video", "now tv", "crunchyroll", "youtube"],
};

export const HELP = [
  ["coffee since june", "a word, from a month"],
  ["groceries this month", "a category"],
  ["biggest 5", "the largest payments out"],
  ["tesco vs aldi", "two side by side"],
  ["uber last month", "also: this week, this year, today"],
  ["deliveroo in october", "one month"],
  ["shopping last 30 days", "or weeks, or months"],
];

const round = (value) => Math.round(value * 100) / 100;

function monthIndex(word) {
  if (!word || word.length < 3) return -1;
  return MONTH_NAMES.findIndex((name) => name.startsWith(word));
}

// The most recent month with this name that isn't in the future
// ("june" in November 2026 is 2026-06; in March 2026 it's 2025-06),
// unless a year is given.
function namedMonth(index, year, today) {
  if (year) return `${year}-${String(index + 1).padStart(2, "0")}`;
  const current = monthOf(today);
  let month = `${today.getFullYear()}-${String(index + 1).padStart(2, "0")}`;
  if (month > current) month = addMonths(month, -12);
  return month;
}

const lastDay = (month) => {
  const [year, number] = month.split("-").map(Number);
  return `${month}-${String(new Date(year, number, 0).getDate()).padStart(2, "0")}`;
};

// Finds a time phrase in the words: {from, to, label, rest} (dates are
// ISO, inclusive; null means open), or the words unchanged with no limits.
export function parseTime(words, today = new Date()) {
  const take = (start, length, range) => ({ ...range, rest: [...words.slice(0, start), ...words.slice(start + length)] });
  const yearAt = (i) => (/^20\d\d$/.test(words[i] ?? "") ? words[i] : null);
  for (let i = 0; i < words.length; i++) {
    const [a, b, c] = [words[i], words[i + 1], words[i + 2]];
    if ((a === "this" || a === "last") && b === "month") {
      const month = a === "this" ? monthOf(today) : addMonths(monthOf(today), -1);
      return take(i, 2, { from: `${month}-01`, to: a === "this" ? null : lastDay(month), label: `${a} month` });
    }
    if (a === "this" && b === "week") {
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      return take(i, 2, { from: isoDate(monday), to: null, label: "this week" });
    }
    if (a === "this" && b === "year") return take(i, 2, { from: `${today.getFullYear()}-01-01`, to: null, label: "this year" });
    if (a === "today") return take(i, 1, { from: isoDate(today), to: null, label: "today" });
    if (a === "last" && /^\d+$/.test(b ?? "") && /^(days?|weeks?|months?)$/.test(c ?? "")) {
      const count = Number(b);
      const from = new Date(today);
      if (c.startsWith("day")) from.setDate(today.getDate() - count + 1);
      else if (c.startsWith("week")) from.setDate(today.getDate() - count * 7 + 1);
      else from.setMonth(today.getMonth() - count);
      return take(i, 3, { from: isoDate(from), to: null, label: `last ${count} ${c}` });
    }
    if ((a === "since" || a === "in" || a === "from") && monthIndex(b) >= 0) {
      const year = yearAt(i + 2);
      const month = namedMonth(monthIndex(b), year, today);
      const name = MONTH_NAMES[monthIndex(b)];
      const length = year ? 3 : 2;
      if (a === "in") return take(i, length, { from: `${month}-01`, to: lastDay(month), label: `in ${name}${year ? ` ${year}` : ""}` });
      return take(i, length, { from: `${month}-01`, to: null, label: `since ${name}${year ? ` ${year}` : ""}` });
    }
  }
  return { from: null, to: null, label: null, rest: words };
}

function hasWord(merchant, keyword) {
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const end = keyword.endsWith(" ") ? "($|[^a-z])" : "";
  return new RegExp(`(^|[^a-z])${escaped}${end}`).test(merchant);
}

// What a search term matches: a category's name, an everyday word from
// ALIASES, or else every word somewhere in the merchant, the bank's
// description or the category. Nothing typed matches everything.
export function matcher(term) {
  const text = term.trim();
  if (!text) return () => true;
  if (CATEGORIES.includes(text)) return (t) => t.category === text;
  if (ALIASES[text]) return (t) => ALIASES[text].some((keyword) => hasWord(t.merchant, keyword));
  const words = text.split(/\s+/);
  return (t) => {
    const haystack = `${t.merchant} ${t.description ?? ""} ${t.category}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  };
}

function within(range) {
  return (t) => (!range.from || t.booked_on >= range.from) && (!range.to || t.booked_on <= range.to);
}

// The transactions a term and a range pick out; transfers only when asked.
function pick(transactions, term, range) {
  const matches = matcher(term);
  const inRange = within(range);
  const wantsTransfers = term.trim() === "transfers";
  return transactions.filter((t) => inRange(t) && (wantsTransfers || t.category !== "transfers") && matches(t));
}

const spent = (list) => round(-sum(list.filter((t) => t.amount < 0).map((t) => t.amount)));
const received = (list) => round(sum(list.filter((t) => t.amount > 0).map((t) => t.amount)));

// Month by month, oldest first, from the range's start (or the first
// match) to its end (or this month): at most 13.
function perMonth(list, range, today) {
  if (!list.length) return [];
  const first = range.from ? range.from.slice(0, 7) : list.map((t) => t.booked_on).sort()[0].slice(0, 7);
  const last = range.to ? range.to.slice(0, 7) : monthOf(today);
  const months = [];
  for (let month = first; month <= last && months.length < 13; month = addMonths(month, 1)) months.push(month);
  return months.map((month) => ({ month, out: spent(list.filter((t) => t.booked_on.startsWith(month))) }));
}

function topMerchants(list, count = 3) {
  const totals = new Map();
  for (const t of list) {
    if (t.amount >= 0) continue;
    const entry = totals.get(t.merchant) ?? { merchant: t.merchant, total: 0, count: 0 };
    entry.total = round(entry.total - t.amount);
    entry.count++;
    totals.set(t.merchant, entry);
  }
  return [...totals.values()].sort((a, b) => b.total - a.total).slice(0, count);
}

const newestFirst = (a, b) => (a.booked_on < b.booked_on ? 1 : a.booked_on > b.booked_on ? -1 : 0);

// The answer to one line: {kind: "help" | "search" | "vs" | "biggest" |
// "empty", ...}. Never throws on odd input.
export function ask(text, transactions, today = new Date()) {
  const words = String(text).toLowerCase().replace(/[^a-z0-9&'.\s-]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return { kind: "empty" };
  if (words[0] === "help" || words[0] === "?") return { kind: "help" };
  const { rest, ...range } = parseTime(words, today);
  const when = range.label;

  if (rest[0] === "biggest" || rest[0] === "top") {
    const count = /^\d+$/.test(rest[1] ?? "") ? Math.min(20, Math.max(1, Number(rest[1]))) : 5;
    const term = rest.slice(/^\d+$/.test(rest[1] ?? "") ? 2 : 1).join(" ");
    const rows = pick(transactions, term, range)
      .filter((t) => t.amount < 0 && t.category !== "transfers")
      .sort((a, b) => a.amount - b.amount || newestFirst(a, b))
      .slice(0, count);
    return { kind: "biggest", count, term, when, rows };
  }

  const vs = rest.findIndex((word) => word === "vs" || word === "versus");
  if (vs > 0 && vs < rest.length - 1) {
    const sides = [rest.slice(0, vs).join(" "), rest.slice(vs + 1).join(" ")].map((term) => {
      const list = pick(transactions, term, range);
      return { term, out: spent(list), count: list.filter((t) => t.amount < 0).length };
    });
    return { kind: "vs", when, sides };
  }

  const term = rest.join(" ");
  const list = pick(transactions, term, range);
  const outgoing = list.filter((t) => t.amount < 0);
  return {
    kind: "search",
    term,
    when,
    count: list.length,
    out: spent(list),
    in: received(list),
    average: outgoing.length ? round(spent(list) / outgoing.length) : 0,
    months: perMonth(list, range, today),
    top: topMerchants(list),
    recent: [...list].sort(newestFirst).slice(0, 5),
  };
}
