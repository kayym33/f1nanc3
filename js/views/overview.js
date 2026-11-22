// A month at a glance: money in and out, spending by category, and the
// latest transactions.
import { addMonths, monthLabel, monthOf, pounds, windowMonths } from "../money.js";
import { monthSummary } from "../summary.js";
import { action, bar, button, esc, heading, notReady } from "../ui.js";
import { transactionRow } from "./transactions.js";

// The phone shows the first 5 of these (style.css); a wide screen all.
const LATEST = 12;

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
          <div><dt>in</dt><dd>${pounds(income)}</dd></div>
          <div><dt>out</dt><dd>${pounds(spending)}</dd></div>
          <div><dt>left</dt><dd>${pounds(net, { sign: true })}</dd></div>
        </dl>
      </div>
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
