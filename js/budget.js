// The budget: built from your pay, your fixed bills, your savings goal and
// how you actually spend. No UI code.
//
//   pay - fixed bills - saving = spending money
//
// Spending money is shared across the flexible categories in proportion
// to your typical month (the middle of your last 6 full months), cut
// harder on non-essentials than essentials, by the plan you pick.
import { CATEGORIES, NOT_SPENDING } from "./categories.js";
import { addMonths, isoDate, monthOf, sum } from "./money.js";

export const ESSENTIALS = new Set(["groceries", "transport", "health", "cash"]);
// Flexible spending: everything but bills (fixed, counted apart), income
// and transfers.
export const FLEXIBLE = CATEGORIES.filter((category) => !NOT_SPENDING.has(category) && category !== "bills");

// How much each plan trims essentials and non-essentials.
export const PLANS = {
  steady: { label: "steady", essential: 0, other: 0.1, about: "spend as you do now on essentials; 10% less on everything else" },
  push: { label: "push", essential: 0.05, other: 0.25, about: "5% less on essentials; a quarter less on everything else" },
  hard: { label: "hard", essential: 0.1, other: 0.45, about: "10% less on essentials; nearly half on everything else" },
};
// The goal: this many months of pay, saved.
export const GOAL_MONTHS = 1.5;

const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const round = (value) => Math.round(value * 100) / 100;
// Budgets are whole pounds, rounded to £5 above £50.
const tidy = (value) => (value >= 50 ? Math.round(value / 5) * 5 : Math.round(value));

// The last `count` whole months before this one, oldest first.
export function fullMonths(today = new Date(), count = 6) {
  const current = monthOf(today);
  return Array.from({ length: count }, (_, i) => addMonths(current, i - count));
}

// A typical month in each flexible category, leaving out payments to
// subscriptions and bills (they're fixed, and counted apart):
// {category: amount}. Months with no data at all don't count.
export function typicalSpending(transactions, fixedMerchants = new Set(), today = new Date()) {
  const months = fullMonths(today);
  const seen = new Set(transactions.map((t) => t.booked_on.slice(0, 7)));
  const counted = months.filter((month) => seen.has(month));
  const typical = {};
  for (const category of FLEXIBLE) {
    const perMonth = counted.map((month) => sum(transactions
      .filter((t) => t.category === category && t.booked_on.startsWith(month) && !fixedMerchants.has(t.merchant))
      .map((t) => -t.amount)));
    typical[category] = round(Math.max(0, median(perMonth)));
  }
  return typical;
}

// The biggest non-essential merchants in a typical month, where cutting
// back would count: [{merchant, category, monthly}].
export function biggestNonEssentials(transactions, fixedMerchants = new Set(), today = new Date(), count = 5) {
  const months = fullMonths(today);
  const totals = new Map();
  for (const t of transactions) {
    if (t.amount >= 0 || !FLEXIBLE.includes(t.category) || ESSENTIALS.has(t.category) || fixedMerchants.has(t.merchant)) continue;
    if (!months.includes(t.booked_on.slice(0, 7))) continue;
    const entry = totals.get(t.merchant) ?? { merchant: t.merchant, category: t.category, total: 0 };
    entry.total -= t.amount;
    totals.set(t.merchant, entry);
  }
  return [...totals.values()]
    .map((entry) => ({ merchant: entry.merchant, category: entry.category, monthly: round(entry.total / months.length) }))
    .sort((a, b) => b.monthly - a.monthly)
    .slice(0, count);
}

// A plan's budgets: {category: amount}, each category's typical month
// trimmed by the plan, then your own changes on top.
export function budgetsFor(typical, plan, own = {}) {
  const cut = PLANS[plan] ?? PLANS.steady;
  const budgets = {};
  for (const category of FLEXIBLE) {
    if (own[category] !== undefined && own[category] !== null) budgets[category] = Number(own[category]);
    else if (typical[category] > 0) budgets[category] = tidy(typical[category] * (1 - (ESSENTIALS.has(category) ? cut.essential : cut.other)));
  }
  return budgets;
}

// What a plan means: {spending, saving, monthsToGoal}. `saving` is pay
// less fixed bills less the budgets; monthsToGoal is null when it can't
// save (or the goal's reached: 0).
export function outlook({ pay, fixed, budgets, saved, goal }) {
  const spending = sum(Object.values(budgets));
  const saving = round(pay - fixed - spending);
  const toGo = Math.max(0, goal - saved);
  const monthsToGoal = toGo === 0 ? 0 : saving > 0 ? Math.ceil(toGo / saving) : null;
  return { spending, saving, monthsToGoal };
}

// This month against the budgets: [{category, budget, spent, left, share,
// pace}], where pace compares the share spent with the share of the month
// gone (over 1 is ahead of pace). Fixed payments don't count.
export function monthProgress(transactions, budgets, fixedMerchants = new Set(), today = new Date()) {
  const month = monthOf(today);
  const day = Number(isoDate(today).slice(8, 10));
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return Object.entries(budgets).map(([category, budget]) => {
    const spent = round(Math.max(0, sum(transactions
      .filter((t) => t.category === category && t.booked_on.startsWith(month) && !fixedMerchants.has(t.merchant))
      .map((t) => -t.amount))));
    const share = budget > 0 ? spent / budget : spent > 0 ? Infinity : 0;
    return { category, budget, spent, left: round(budget - spent), share, pace: share / (day / days) };
  });
}

// What you can spend a day for the rest of the month, across all budgets.
export function dailyAllowance(progress, today = new Date()) {
  const day = Number(isoDate(today).slice(8, 10));
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const left = sum(progress.map((row) => Math.max(0, row.left)));
  return round(left / Math.max(1, days - day + 1));
}
