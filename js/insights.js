// The budget, the payday nudge and the alerts, worked out from your data.
// No UI code: the app's screens and the server's notifications
// (supabase/functions/fin-alerts) both use these, so they always agree.
//
// `data` is {transactions, subscriptionSettings: Map, accountKinds: Map
// (account -> "spending" | "savings"), budget: {plan, amounts}}.
import { latestBalances } from "./balances.js";
import { budgetsFor, dailyAllowance, fullMonths, GOAL_MONTHS, monthProgress, outlook, PLANS, typicalSpending } from "./budget.js";
import { expectedIncome, monthlyIncome } from "./income.js";
import { monthLabel, monthOf, pounds, sum } from "./money.js";
import { paydayNudge } from "./payday.js";
import { billDays, findSubscriptions } from "./subscriptions.js";

const kindOf = (data) => (account) => data.accountKinds?.get(account) ?? "spending";

// Everything the budget needs.
export function planPicture(data, today = new Date()) {
  const { transactions } = data;
  const accountKind = kindOf(data);
  const subs = findSubscriptions(transactions, data.subscriptionSettings, today).filter((sub) => !sub.ended && !sub.hidden);
  const fixedMerchants = new Set(subs.map((sub) => sub.merchant));
  const fixed = Math.round(sum(subs.map((sub) => sub.monthly)) * 100) / 100;
  // Plans use all your regular income (side income at its average); the
  // goal uses your main pay alone.
  const income = monthlyIncome(transactions, today);
  const pay = income.total;
  const savings = latestBalances(transactions).filter((b) => accountKind(b.account) === "savings");
  const saved = Math.round(sum(savings.map((b) => b.balance)) * 100) / 100;
  const goal = Math.round(income.main * GOAL_MONTHS);
  // Only months since your current pay started: a new job means new money.
  const since = income.sources[0]?.first?.slice(0, 7) ?? null;
  const counted = fullMonths(today, 6, since);
  const typical = typicalSpending(transactions, fixedMerchants, today, since);
  const plan = data.budget?.plan ?? null;
  const own = data.budget?.amounts ?? {};
  const outlooks = Object.fromEntries(Object.keys(PLANS).map((name) => [name, outlook({ pay, fixed, budgets: budgetsFor(typical, name, own), saved, goal })]));
  const budgets = plan ? budgetsFor(typical, plan, own) : {};
  const progress = plan ? monthProgress(transactions, budgets, fixedMerchants, today) : [];
  return {
    pay, income, since, counted, fixed, subs, fixedMerchants, saved, hasSavings: savings.length > 0, goal, typical, plan, own, budgets, outlooks,
    current: plan ? outlook({ pay, fixed, budgets, saved, goal }) : null,
    progress, allowance: plan ? dailyAllowance(progress, today) : 0,
    typicalTotal: Math.round(sum(Object.values(typical)) * 100) / 100,
  };
}

// The payday nudge: {nudge: {days, suggest, keep}, payDay, asOf, stale}, or
// null when there's nothing to say (pay isn't close, it's already in,
// there's no savings account, or nothing's spare).
export function paydayState(data, today = new Date(), picture = planPicture(data, today)) {
  const { transactions } = data;
  const accountKind = kindOf(data);
  const main = picture.income.sources[0];
  const pay = main && expectedIncome(transactions, today).find((p) => p.name === main.name);
  if (!pay) return null;
  const day = today.getDate();
  const balances = latestBalances(transactions);
  const spendingAccounts = balances.filter((b) => accountKind(b.account) === "spending");
  if (!spendingAccounts.length || !balances.some((b) => accountKind(b.account) === "savings")) return null;
  const spending = sum(spendingAccounts.map((b) => b.balance));
  const billsBefore = sum(billDays(findSubscriptions(transactions, data.subscriptionSettings, today), today)
    .filter((mark) => !mark.gone && mark.day >= day && mark.day < pay.day)
    .map((mark) => mark.amount));
  const monthly = picture.plan ? sum(Object.values(picture.budgets)) : picture.typicalTotal;
  const nudge = paydayNudge({ today: day, payDay: pay.day, spending, billsBefore, dailySpend: monthly / 30 });
  if (!nudge) return null;
  // The newest import: an account with nothing new isn't out of date.
  const asOf = spendingAccounts.map((b) => b.date).sort().at(-1);
  const stale = (today - new Date(`${asOf}T12:00:00`)) / 86400000 > 3;
  return { nudge, payDay: pay.day, asOf, stale };
}

const whole = (amount) => pounds(Math.round(amount)).replace(".00", "");
const left = (today) => new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate();

// What's worth a notification today: [{key, title, body, url}]. `key` is
// unique per alert per month, so each is sent once: a category at 80%,
// the same category over budget, and the payday nudge.
export function alertsFor(data, today = new Date()) {
  const month = monthOf(today);
  const picture = planPicture(data, today);
  const alerts = [];
  const daysLeft = left(today);
  const togo = daysLeft === 0 ? "on its last day" : `with ${daysLeft} ${daysLeft === 1 ? "day" : "days"} to go`;
  for (const row of picture.progress) {
    if (row.budget <= 0) continue;
    if (row.share >= 1) {
      alerts.push({
        key: `budget:${month}:${row.category}:over`,
        title: `${row.category} is over budget`,
        body: `${whole(row.spent)} of ${whole(row.budget)} this month, ${togo}`,
        url: "./#/budget",
      });
    } else if (row.share >= 0.8) {
      alerts.push({
        key: `budget:${month}:${row.category}:80`,
        title: `${row.category} is at ${Math.floor(row.share * 100)}%`,
        body: `${whole(row.spent)} of its ${whole(row.budget)} budget, ${togo}`,
        url: "./#/budget",
      });
    }
  }
  const payday = paydayState(data, today, picture);
  if (payday) {
    const when = payday.nudge.days === 0 ? "Payday's today" : payday.nudge.days === 1 ? "Payday's tomorrow" : `Payday's in ${payday.nudge.days} days`;
    alerts.push({
      key: `payday:${month}`,
      title: when,
      body: `About ${whole(payday.nudge.suggest)} is spare to move to savings for ${monthLabel(month).split(" ")[0]}`,
      url: "./#/",
    });
  }
  return alerts;
}
