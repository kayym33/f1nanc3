// A month at a glance: money in and out, spending by category, and the
// latest transactions.
import { latestBalances } from "../balances.js";
import { expectedIncome } from "../income.js";
import { addMonths, dayLabel, monthLabel, monthOf, pounds, windowMonths } from "../money.js";
import { monthSummary } from "../summary.js";
import { action, bar, button, esc, heading, notReady } from "../ui.js";
import { budgetPicture, progressRow } from "./budget.js";
import { transactionRow } from "./transactions.js";

// The phone shows the first 5 of these (style.css); a wide screen all.
const LATEST = 12;

// What's in your accounts, as of each one's latest transaction: money to
// spend and savings apart, each account named as you named it.
function balanceHtml(ctx) {
  const balances = latestBalances(ctx.finance.transactions);
  if (!balances.length) return "";
  const group = (kind) => balances.filter((b) => ctx.finance.accountKind(b.account) === kind);
  const total = (list) => Math.round(list.reduce((sum, b) => sum + b.balance, 0) * 100) / 100;
  const spend = group("spending");
  const saved = group("savings");
  const latest = balances.map((b) => b.date).sort().at(-1);
  // An overdrawn account keeps its minus sign (pounds() drops it).
  const money = (value) => (value < 0 ? `−${pounds(value)}` : pounds(value));
  const parts = (list) => list.map((b) => `<span class="part${b.balance < 0 ? " overdrawn" : ""}">${esc(ctx.finance.accountName(b.account))} ${esc(money(b.balance))}${b.balance < 0 ? " overdrawn" : ""}</span>`).join("");
  const sum = (list) => {
    const value = total(list);
    return `<span class="big${value < 0 ? " overdrawn" : ""}">${esc(money(value))}</span>`;
  };
  return `
    <div class="balance">
      ${spend.length ? `<div>${sum(spend)} to spend ${parts(spend)}</div>` : ""}
      ${saved.length ? `<div>${sum(saved)} saved ${parts(saved)}</div>` : ""}
      <p class="hint">balances as of ${esc(dayLabel(latest))}, from your last import${ctx.finance.accounts.size ? "" : " · name your accounts in settings ⚙"}</p>
    </div>`;
}

// This month against the budget: what's left a day, and any category at
// 80% or more (the in-app alert). A nudge to set one up if there's none.
function budgetBox(ctx) {
  const picture = budgetPicture(ctx);
  if (!picture.plan) {
    return `<button type="button" class="wrapped-link budget-link" ${action("go", { to: "/budget" })}><span>£</span> set up your budget: saving towards ${esc(pounds(picture.goal).replace(".00", ""))} <span class="go">›</span></button>`;
  }
  const hot = picture.progress.filter((row) => row.share >= 0.8).sort((a, b) => b.share - a.share);
  return `
    <div class="budget-box">
      <div class="section-head">${heading("budget")}${button("budget ›", "go", { to: "/budget" }, { small: true })}</div>
      <p class="allowance">about <b>${esc(pounds(picture.allowance).replace(/\.\d\d$/, ""))}</b> a day to spend for the rest of the month</p>
      ${hot.length ? `<ul class="meters budget-meters">${hot.map(progressRow).join("")}</ul>` : `<p class="muted">every budget is under 80%</p>`}
    </div>`;
}

export function render(ctx, { month }) {
  const shown = month ?? monthOf(new Date());
  const waiting = notReady(ctx.finance);
  if (waiting) return { crumbs: [], html: waiting };
  if (!ctx.finance.transactions.length) {
    return {
      crumbs: [],
      html: `
        <pre class="art center">  .-----------.  \n  |  £  ·  £  |  \n  '-----------'  </pre>
        <p class="center muted">no transactions yet</p>
        <div class="row-buttons center-row">${button("import a statement", "go", { to: "/import" }, { solid: true })}</div>`,
    };
  }
  const months = windowMonths();
  const older = addMonths(shown, -1);
  const newer = addMonths(shown, 1);
  const { income, spending, net, categories } = monthSummary(ctx.finance.transactions, shown);
  // This month, before payday: the pay still to come.
  const current = shown === monthOf(new Date());
  const pay = current ? expectedIncome(ctx.finance.transactions) : [];
  const payTotal = pay.reduce((total, p) => total + p.amount, 0);
  const ordinal = (day) => `${day}${[11, 12, 13].includes(day) ? "th" : ["th", "st", "nd", "rd"][day % 10] ?? "th"}`;
  const biggest = Math.max(...categories.map((row) => row.total), 0);
  const latest = ctx.finance.transactions.filter((t) => t.booked_on.startsWith(shown)).slice(0, LATEST);
  const step = (target, label) => (months.includes(target)
    ? `<button type="button" class="step" ${action("go", { to: target === monthOf(new Date()) ? "/" : `/m/${target}` })}>${label}</button>`
    : `<span class="step off">${label}</span>`);

  return {
    crumbs: shown === monthOf(new Date()) ? [] : [monthLabel(shown)],
    html: `
      <div class="overview-head">
        <div class="month-bar">${step(older, "‹")}<h1>${esc(monthLabel(shown))}</h1>${step(newer, "›")}</div>
        <dl class="totals">
          <div><dt>in</dt><dd>${pounds(income)}</dd>${payTotal ? `<span class="note">+ pay ~${esc(pounds(Math.round(payTotal)).replace(".00", ""))} due ${pay.length === 1 ? `the ${ordinal(pay[0].day)}` : "soon"}</span>` : ""}</div>
          <div><dt>out</dt><dd>${pounds(spending)}</dd></div>
          <div><dt>left</dt><dd>${pounds(net, { sign: true })}</dd>${payTotal ? `<span class="note">about ${esc(pounds(Math.round(net + payTotal), { sign: true }).replace(".00", ""))} after pay</span>` : ""}</div>
        </dl>
      </div>
      ${current ? balanceHtml(ctx) : ""}
      ${current ? budgetBox(ctx) : ""}
      <button type="button" class="wrapped-link" ${action("go", { to: "/wrapped" })}><span>✶</span> your year, wrapped <span class="go">›</span></button>
      <div class="columns">
        <section>
          <div class="section-head">${heading("spending")}${button("as a river ›", "go", { to: shown === monthOf(new Date()) ? "/river" : `/river/${shown}` }, { small: true })}</div>
          ${categories.length ? `<ul class="meters">${categories.map((row) => `
            <li ${action("go", { to: `/tx?month=${shown}&category=${row.category}` })}>
              <span class="name">${esc(row.category)}</span>
              <span class="meter">${bar(biggest > 0 ? row.total / biggest : 0)}</span>
              <span class="amount">${pounds(row.total)}</span>
            </li>`).join("")}</ul>` : `<p class="muted">nothing spent this month</p>`}
        </section>
        <section>
          <div class="section-head">${heading("latest")}${button("all ›", "go", { to: `/tx?month=${shown}` }, { small: true })}</div>
          ${latest.length ? `<ul class="transactions latest">${latest.map(transactionRow).join("")}</ul>` : `<p class="muted">none this month</p>`}
        </section>
      </div>`,
  };
}
