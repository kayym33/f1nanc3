// The budget: your savings goal, this month against your budgets, the
// three plans and what each means for the goal, the budgets themselves
// (yours to change), and where the non-essential money goes.
import { latestBalances } from "../balances.js";
import { biggestNonEssentials, budgetsFor, dailyAllowance, ESSENTIALS, FLEXIBLE, GOAL_MONTHS, monthProgress, outlook, PLANS, typicalSpending } from "../budget.js";
import { displayName } from "../categories.js";
import { monthlyIncome } from "../income.js";
import { monthLabel, monthOf, pounds, sum } from "../money.js";
import { findSubscriptions } from "../subscriptions.js";
import { action, bar, button, esc, heading, notReady } from "../ui.js";

const whole = (amount) => `£${Math.round(amount).toLocaleString("en-GB")}`;
// "+£250" or "−£120".
const signed = (amount) => `${amount < 0 ? "−" : "+"}${whole(Math.abs(amount))}`;

// Everything the budget needs, from what's stored. Used here and on the
// overview.
export function budgetPicture(ctx) {
  const { finance } = ctx;
  const transactions = finance.transactions;
  const subs = findSubscriptions(transactions, finance.subscriptionSettings).filter((sub) => !sub.ended && !sub.hidden);
  const fixedMerchants = new Set(subs.map((sub) => sub.merchant));
  const fixed = Math.round(sum(subs.map((sub) => sub.monthly)) * 100) / 100;
  // Plans use all your regular income (side income at its average); the
  // goal uses your main pay alone.
  const income = monthlyIncome(transactions);
  const pay = income.total;
  const savings = latestBalances(transactions).filter((b) => finance.accountKind(b.account) === "savings");
  const saved = Math.round(sum(savings.map((b) => b.balance)) * 100) / 100;
  const goal = Math.round(income.main * GOAL_MONTHS);
  const typical = typicalSpending(transactions, fixedMerchants);
  const plan = finance.budget.plan;
  const own = finance.budget.amounts ?? {};
  const outlooks = Object.fromEntries(Object.keys(PLANS).map((name) => [name, outlook({ pay, fixed, budgets: budgetsFor(typical, name, own), saved, goal })]));
  const budgets = plan ? budgetsFor(typical, plan, own) : {};
  const progress = plan ? monthProgress(transactions, budgets, fixedMerchants) : [];
  return {
    pay, income, fixed, subs, fixedMerchants, saved, hasSavings: savings.length > 0, goal, typical, plan, own, budgets, outlooks,
    current: plan ? outlook({ pay, fixed, budgets, saved, goal }) : null,
    progress, allowance: plan ? dailyAllowance(progress) : 0,
    typicalTotal: Math.round(sum(Object.values(typical)) * 100) / 100,
  };
}

// A category's bar for this month: how much of its budget is gone, and
// whether that's ahead of the month.
export function progressRow(row) {
  const over = row.spent > row.budget;
  const warn = !over && row.share >= 0.8;
  const tone = over ? "over" : warn ? "warn" : "";
  const note = over ? `${whole(row.spent - row.budget)} over`
    : `${whole(row.left)} left${row.pace > 1.15 && row.share < 1 ? " · ahead of pace" : ""}`;
  return `
    <li class="${tone}">
      <span class="name">${esc(row.category)}</span>
      <span class="meter">${bar(Math.min(1, row.share))}</span>
      <span class="amount">${esc(whole(row.spent))} <small>of ${esc(whole(row.budget))}</small></span>
      <span class="note">${esc(note)}</span>
    </li>`;
}

function months(count) {
  if (count === null) return "never, at this rate";
  if (count === 0) return "reached";
  return count === 1 ? "about a month" : `about ${count} months`;
}

export function render(ctx) {
  const waiting = notReady(ctx.finance);
  if (waiting) return { crumbs: ["budget"], html: waiting };
  if (!ctx.finance.transactions.length) {
    return { crumbs: ["budget"], html: `<p class="muted">import a statement first (settings ⚙): the budget is built from how you spend</p>` };
  }
  const p = budgetPicture(ctx);
  const share = p.goal > 0 ? Math.min(1, Math.max(0, p.saved / p.goal)) : 0;
  const over = p.progress.filter((row) => row.share >= 0.8).sort((a, b) => b.share - a.share);
  const nonEssentials = biggestNonEssentials(ctx.finance.transactions, p.fixedMerchants, new Date(), 6);
  const flexible = FLEXIBLE.filter((category) => p.typical[category] > 0 || p.own[category] !== undefined);

  return {
    crumbs: ["budget"],
    html: `
      ${heading("your goal")}
      <div class="goal">
        <p><span class="big">${esc(whole(p.saved))}</span> of ${esc(whole(p.goal))} saved <span class="muted">· ${Math.round(share * 100)}%</span></p>
        <p class="goal-bar">${bar(share, 30)}</p>
        <p class="hint">${GOAL_MONTHS} × your typical pay (${esc(whole(p.income.main))})${p.hasSavings ? "" : " · mark your savings account in settings ⚙ so it counts"}${p.current ? ` · ${p.current.monthsToGoal === 0 ? "reached: keep going" : `goal in ${months(p.current.monthsToGoal)} on the ${PLANS[p.plan].label} plan`}` : ""}</p>
      </div>

      ${p.plan ? `
        ${heading(`this month · ${monthLabel(monthOf(new Date())).split(" ")[0]}`)}
        <p class="allowance">about <b>${esc(whole(p.allowance))}</b> a day to spend for the rest of the month</p>
        ${over.length ? `<p class="flash warn-flash">${over.map((row) => `${esc(row.category)} ${row.share >= 1 ? "is over" : `is at ${Math.round(row.share * 100)}%`}`).join(" · ")}</p>` : ""}
        <ul class="meters budget-meters">${p.progress.sort((a, b) => b.share - a.share).map(progressRow).join("")}</ul>` : ""}

      ${heading("pick a plan")}
      <p class="hint">what comes in (${esc(whole(p.pay))}), less your bills and subscriptions (${esc(whole(p.fixed))}), less the plan's budgets, is what you save each month</p>
      <div class="plans">${Object.entries(PLANS).map(([name, plan]) => {
        const o = p.outlooks[name];
        return `
          <button type="button" class="plan${p.plan === name ? " on" : ""}" ${action("budget-plan", { value: name })}>
            <span class="plan-name">${esc(plan.label)}</span>
            <span class="plan-saving ${o.saving < 0 ? "bad" : "good"}">${o.saving < 0 ? `${esc(whole(-o.saving))} <small>short a month</small>` : `saves ${esc(whole(o.saving))} <small>a month</small>`}</span>
            <span class="plan-goal">goal: ${esc(months(o.monthsToGoal))}</span>
            <span class="plan-about">${esc(plan.about)}</span>
          </button>`;
      }).join("")}</div>

      ${heading("a month, in numbers")}
      <dl class="facts sums">
        ${p.income.sources.map((source, i) => `<div><dt>${i === 0 ? "pay" : "other income"}</dt><dd>${i ? "+" : ""}${esc(whole(source.monthly))} <span class="muted">(${esc(source.name)}${source.share < 1 ? `: £${Math.round(source.amount)} in ${source.months} of the last ${source.outOf} months` : ""})</span></dd></div>`).join("") || `<div><dt>pay</dt><dd>${esc(whole(0))} <span class="muted">(no regular pay found yet)</span></dd></div>`}
        <div><dt>bills</dt><dd>−${esc(whole(p.fixed))} <span class="muted">(${p.subs.length} on the <a href="#/subs">subs</a> tab)</span></dd></div>
        <div><dt>spending</dt><dd>−${esc(whole(p.plan ? sum(Object.values(p.budgets)) : p.typicalTotal))} <span class="muted">(${p.plan ? "your budgets" : "a typical month"})</span></dd></div>
        <div class="total"><dt>${(p.current?.saving ?? p.pay - p.fixed - p.typicalTotal) < 0 ? "short" : "saved"}</dt><dd class="${(p.current?.saving ?? p.pay - p.fixed - p.typicalTotal) < 0 ? "bad" : "good"}">${esc(signed(p.current?.saving ?? p.pay - p.fixed - p.typicalTotal))}</dd></div>
      </dl>

      ${heading("budgets")}
      <p class="hint">a typical month is the middle of your last 6 full months; ${p.plan ? "change any budget and it stays as you set it" : "pick a plan to set them"}</p>
      <table class="budget-table">
        <thead><tr><th>category</th><th class="num">typical</th><th class="num">budget</th></tr></thead>
        <tbody>${flexible.map((category) => `
          <tr>
            <th>${esc(category)} <small class="${ESSENTIALS.has(category) ? "essential" : ""}">${ESSENTIALS.has(category) ? "essential" : ""}</small></th>
            <td class="num muted">${esc(whole(p.typical[category] ?? 0))}</td>
            <td class="num">${p.plan ? `
              <form class="budget-amount" data-form="budget-amount" data-category="${esc(category)}">
                <span>£</span><input name="amount" type="text" inputmode="decimal" value="${Math.round(p.budgets[category] ?? 0)}" aria-label="${esc(category)} budget">
                ${p.own[category] !== undefined ? button("↺", "budget-reset", { category }, { small: true }) : ""}
              </form>` : "—"}</td>
          </tr>`).join("")}
        </tbody>
      </table>

      ${nonEssentials.length ? `
        ${heading("where the non-essential money goes")}
        <p class="hint">a typical month over the last 6; the places where cutting back adds up</p>
        <ul class="where">${nonEssentials.map((row) => `<li><span>${esc(displayName(row.merchant))} <small class="muted">${esc(row.category)}</small></span><b>${esc(whole(row.monthly))}</b></li>`).join("")}</ul>` : ""}`,
  };
}

export const actions = {
  async "budget-plan"(ctx, { value }) {
    await ctx.finance.saveBudget({ plan: value });
  },
  async "budget-reset"(ctx, { category }) {
    const amounts = { ...ctx.finance.budget.amounts };
    delete amounts[category];
    await ctx.finance.saveBudget({ amounts });
  },
};

export const forms = {
  async "budget-amount"(ctx, form) {
    const amount = Number(String(form.elements.amount.value).replace(/[£,\s]/g, ""));
    if (!Number.isFinite(amount) || amount < 0) return;
    await ctx.finance.saveBudget({ amounts: { ...ctx.finance.budget.amounts, [form.dataset.category]: Math.round(amount) } });
  },
};
