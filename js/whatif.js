// What-if mode (#/budget/whatif): what spending less, or cancelling
// subscriptions, would do for your saving and your goal. No UI code.
//
// It starts from how you actually spend (a typical month, as the budget
// works it out), not from a plan, so "eat out 30% less" means 30% less
// than you really do. Nothing here is saved: it's for trying things.
import { FLEXIBLE, outlook } from "./budget.js";
import { addMonths, monthOf, sum } from "./money.js";

// Each slider goes from as now to half, in steps of 5%.
export const MAX_CUT = 50;
export const CUT_STEP = 5;

const round = (value) => Math.round(value * 100) / 100;

// `picture` is insights.planPicture's; `cuts` is {category: percent less};
// `cancelled` is a Set of subscription merchants. Returns
// {rows: [{category, before, after, cut}], subs: [{merchant, name,
// monthly, cancelled}], before, after (each {spending, saving,
// monthsToGoal, fixed}), saved, goal}. Only subscriptions can be
// cancelled here: bills (rent, council tax) can't be wished away.
export function whatIf(picture, { cuts = {}, cancelled = new Set() } = {}) {
  const rows = FLEXIBLE.filter((category) => picture.typical[category] > 0).map((category) => {
    const cut = Math.min(MAX_CUT, Math.max(0, Number(cuts[category]) || 0));
    const before = picture.typical[category];
    return { category, before, after: round(before * (1 - cut / 100)), cut };
  });
  const subs = picture.subs
    .filter((sub) => sub.kind === "subscription")
    .map((sub) => ({ merchant: sub.merchant, name: sub.name, monthly: sub.monthly, cancelled: cancelled.has(sub.merchant) }));
  const dropped = sum(subs.filter((sub) => sub.cancelled).map((sub) => sub.monthly));
  const base = { pay: picture.pay, saved: picture.saved, goal: picture.goal };
  const budgetsOf = (key) => Object.fromEntries(rows.map((row) => [row.category, row[key]]));
  const before = { ...outlook({ ...base, fixed: picture.fixed, budgets: budgetsOf("before") }), fixed: picture.fixed };
  const fixedAfter = round(picture.fixed - dropped);
  const after = { ...outlook({ ...base, fixed: fixedAfter, budgets: budgetsOf("after") }), fixed: fixedAfter };
  return { rows, subs, before, after, saved: picture.saved, goal: picture.goal };
}

// The month the goal is reached, `months` from now ("2027-03"), or null.
export function goalMonth(months, today = new Date()) {
  if (months === null || months === undefined) return null;
  return addMonths(monthOf(today), months);
}
