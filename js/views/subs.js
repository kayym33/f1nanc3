// Subscriptions and bills: everything that comes out about once a month
// (js/subscriptions.js), with what it costs and a link to manage it. One
// payment's page lets you add a link, move it between subscriptions and
// bills, or say it isn't one.
import { columnsChart } from "../chart.js";
import { dayLabel, monthLabel, pounds } from "../money.js";
import { findSubscriptions } from "../subscriptions.js";
import { action, button, esc, heading, notReady } from "../ui.js";

const route = (merchant) => `/subs/${encodeURIComponent(merchant)}`;
const short = (iso) => dayLabel(iso).split(" ").slice(1).join(" ");

function find(ctx) {
  return findSubscriptions(ctx.finance.transactions, ctx.finance.subscriptionSettings);
}

function link(sub, label = "↗") {
  if (!sub.url) return "";
  return `<a class="sub-link" href="${esc(sub.url)}" target="_blank" rel="noopener noreferrer" aria-label="open ${esc(sub.name)}'s website">${label}</a>`;
}

function changeNote(sub) {
  if (!sub.change) return "";
  const up = sub.change.to > sub.change.from;
  return `<span class="change ${up ? "up" : "down"}">${up ? "↑" : "↓"} was ${esc(pounds(sub.change.from))} until ${esc(monthLabel(sub.change.on.slice(0, 7)).split(" ")[0])}</span>`;
}

function row(sub) {
  return `
    <li ${action("go", { to: route(sub.merchant) })}>
      <span class="who">${esc(sub.name)}</span>
      <span class="amount">${esc(pounds(sub.monthly))}</span>
      <span class="side">${sub.url ? link(sub) : `<span class="add-link" aria-hidden="true">+ link</span>`}</span>
      <span class="what">${sub.ended ? `last paid ${esc(short(sub.last))}` : `next ${esc(short(sub.next))} · ${esc(pounds(sub.yearly))} a year`}</span>
      ${sub.change && !sub.ended ? `<span class="what">${changeNote(sub)}</span>` : ""}
    </li>`;
}

function section(title, list, total = null) {
  if (!list.length) return "";
  return `
    <div class="section-head">${heading(title)}${total === null ? "" : `<span class="section-total">${esc(pounds(total))} a month</span>`}</div>
    <ul class="subs">${list.map(row).join("")}</ul>`;
}

const sum = (list) => Math.round(list.reduce((total, sub) => total + sub.monthly, 0) * 100) / 100;

export function render(ctx) {
  const waiting = notReady(ctx.finance);
  if (waiting) return { crumbs: ["subs"], html: waiting };
  const all = find(ctx);
  const live = all.filter((sub) => !sub.ended && !sub.hidden);
  const subscriptions = live.filter((sub) => sub.kind === "subscription");
  const bills = live.filter((sub) => sub.kind === "bill");
  const ended = all.filter((sub) => sub.ended && !sub.hidden);
  const hidden = all.filter((sub) => sub.hidden);
  if (!all.length) {
    return {
      crumbs: ["subs"],
      html: `<pre class="art center">  [ ↻ ]  </pre><p class="center muted">nothing comes out every month yet. Payments show here once they've gone out in three different months.</p>`,
    };
  }
  const monthly = sum(live);
  return {
    crumbs: ["subs"],
    html: `
      <p class="subs-total"><strong>${esc(pounds(monthly))}</strong> a month</p>
      <p class="muted">${esc(pounds(Math.round(monthly * 12 * 100) / 100))} a year · ${subscriptions.length} ${subscriptions.length === 1 ? "subscription" : "subscriptions"} · ${bills.length} ${bills.length === 1 ? "bill" : "bills"}</p>
      ${section("subscriptions", subscriptions, sum(subscriptions))}
      ${section("bills", bills, sum(bills))}
      ${ended.length ? `${heading("looks ended")}<ul class="subs ended">${ended.map(row).join("")}</ul>` : ""}
      ${hidden.length ? `
        <details class="hidden-subs"><summary>not subscriptions (${hidden.length})</summary>
          <ul class="subs ended">${hidden.map(row).join("")}</ul>
        </details>` : ""}
      <p class="hint">anything paid about once a month, three months or more. Tap one to add a link, move it between subscriptions and bills, or hide it.</p>`,
  };
}

export function renderOne(ctx, { key }) {
  const waiting = notReady(ctx.finance);
  if (waiting) return { crumbs: [["subs", "/subs"]], html: waiting };
  const merchant = decodeURIComponent(key);
  const sub = find(ctx).find((candidate) => candidate.merchant === merchant);
  if (!sub) return { crumbs: [["subs", "/subs"]], html: `<p class="muted">this isn't a monthly payment any more</p>` };
  const own = ctx.finance.subscriptionSettings.get(merchant) ?? {};
  const recent = sub.payments.slice(-12);
  return {
    crumbs: [["subs", "/subs"], sub.name],
    html: `
      <h1>${esc(sub.name)}</h1>
      <p class="big-amount">${esc(pounds(sub.monthly))} <small class="muted">a month</small></p>
      ${sub.url ? `<p>${link(sub, "open their website ↗")}</p>` : ""}
      <dl class="facts">
        <div><dt>a year</dt><dd>${esc(pounds(sub.yearly))}</dd></div>
        <div><dt>last paid</dt><dd>${esc(dayLabel(sub.last))}</dd></div>
        <div><dt>${sub.ended ? "status" : "next"}</dt><dd>${sub.ended ? "looks ended: nothing for over 6 weeks" : `about ${esc(dayLabel(sub.next))}`}</dd></div>
        <div><dt>since</dt><dd>${esc(dayLabel(sub.payments[0].booked_on))} ${sub.payments[0].booked_on.slice(0, 4)} · ${sub.payments.length} payments</dd></div>
        ${sub.change ? `<div><dt>price</dt><dd>${changeNote(sub)}</dd></div>` : ""}
      </dl>
      ${columnsChart(recent.map((t) => -t.amount), recent.map((t) => monthLabel(t.booked_on.slice(0, 7))[0]), recent.length - 1)}

      ${heading("it's a")}
      <div class="chips">${["subscription", "bill"].map((kind) => `<button type="button" class="chip${sub.kind === kind ? " on" : ""}" ${action("subs-kind", { merchant, value: kind })}>${kind}</button>`).join("")}</div>

      ${heading("link")}
      <form class="editor link-form" data-form="subs-link" data-merchant="${esc(merchant)}">
        <input name="url" type="text" inputmode="url" autocapitalize="off" spellcheck="false" autocomplete="off" placeholder="https://..." value="${esc(own.url ?? "")}" aria-label="link to manage it">
        <div class="row-buttons">
          <button type="submit" class="button solid">${own.url ? "save link" : "add link"}</button>
          ${own.url ? button(sub.linkKnown ? "use the built-in link" : "remove my link", "subs-unlink", { merchant }) : ""}
        </div>
      </form>
      <p class="hint">${sub.linkKnown && !own.url ? "the link above is from f1nanc3's list; add your own to replace it" : "where you manage or cancel it"}</p>
      <p class="error" data-part="error" hidden></p>

      <div class="row-buttons bottom">${own.hidden ? button("show it again", "subs-hide", { merchant, value: "" })
        : button("not a subscription", "subs-hide", { merchant, value: "1" })}</div>`,
  };
}

function showError(problem) {
  const part = document.querySelector('[data-part="error"]');
  if (!part) return;
  part.textContent = problem.message ?? String(problem);
  part.hidden = false;
}

// "netflix.com/account" -> "https://netflix.com/account"; null if it isn't a web address.
export function cleanUrl(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
}

export const actions = {
  async "subs-kind"(ctx, { merchant, value }) {
    await ctx.finance.saveSubscription(merchant, { kind: value }).catch(showError);
  },
  async "subs-hide"(ctx, { merchant, value }) {
    try {
      await ctx.finance.saveSubscription(merchant, { hidden: Boolean(value) });
      if (value) ctx.go("/subs");
    } catch (problem) {
      showError(problem);
    }
  },
  async "subs-unlink"(ctx, { merchant }) {
    await ctx.finance.saveSubscription(merchant, { url: null }).catch(showError);
  },
};

export const forms = {
  async "subs-link"(ctx, form) {
    const url = cleanUrl(form.elements.url.value);
    if (!url) return showError(new Error("that doesn't look like a web address"));
    await ctx.finance.saveSubscription(form.dataset.merchant, { url }).catch(showError);
  },
};
