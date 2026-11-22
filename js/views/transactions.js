// Every transaction, searchable and filtered by month and category; and
// one transaction, where its category can be changed. On a phone that's a
// list grouped by day and a page per transaction; on a wide screen it's a
// table with the chosen transaction in a panel beside it.
import { CATEGORIES, displayName } from "../categories.js";
import { dayLabel, monthLabel, pounds } from "../money.js";
import { action, button, esc, heading, notReady, wide } from "../ui.js";

// Rows drawn at first; "show more" adds this many again.
const PAGE = 150;

const state = { search: "", limit: PAGE };

export function transactionRow(t) {
  const money = t.amount > 0 ? "in" : "";
  return `
    <li ${action("go", { to: `/tx/${t.id}` })}>
      <span class="who">${esc(displayName(t.merchant))}</span>
      <span class="amount ${money}">${pounds(t.amount, { sign: t.amount > 0 })}</span>
      <span class="what">${esc(t.category)}</span>
    </li>`;
}

function matching(ctx, { month, category }) {
  const words = state.search.toLowerCase().split(/\s+/).filter(Boolean);
  return ctx.finance.transactions.filter((t) => {
    if (month && !t.booked_on.startsWith(month)) return false;
    if (category && t.category !== category) return false;
    const text = `${t.merchant} ${t.description} ${t.category}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

// The filters as a query string, so opening a transaction keeps them.
function queryString({ month, category }) {
  const search = new URLSearchParams(Object.entries({ month, category }).filter(([, value]) => value)).toString();
  return search ? `?${search}` : "";
}

function tableHtml(shown, filters, selected) {
  const query = queryString(filters);
  return `
    <table class="tx-table">
      <thead><tr><th>date</th><th>merchant</th><th>category</th><th class="num">amount</th><th>account</th></tr></thead>
      <tbody>${shown.map((t) => `
        <tr class="${t.id === selected ? "on" : ""}" ${action("go", { to: `/tx/${t.id}${query}` })}>
          <td class="date">${esc(dayLabel(t.booked_on))}</td>
          <td class="who">${esc(displayName(t.merchant))}</td>
          <td class="what">${esc(t.category)}</td>
          <td class="num ${t.amount > 0 ? "in" : ""}">${pounds(t.amount, { sign: t.amount > 0 })}</td>
          <td class="muted">${esc(t.account)}</td>
        </tr>`).join("")}
      </tbody>
    </table>`;
}

// A table on a wide screen; on a phone, grouped by day, newest first.
function listHtml(ctx, filters, selected = null) {
  const found = matching(ctx, filters);
  if (!found.length) return `<p class="muted">nothing matches</p>`;
  const shown = found.slice(0, state.limit);
  const more = found.length > shown.length
    ? `<div class="row-buttons">${button(`show more (${found.length - shown.length})`, "tx-more")}</div>` : "";
  if (wide()) return tableHtml(shown, filters, selected) + more;
  const days = new Map();
  for (const t of shown) {
    if (!days.has(t.booked_on)) days.set(t.booked_on, []);
    days.get(t.booked_on).push(t);
  }
  return [...days].map(([day, list]) => `
    <h3>${esc(dayLabel(day))}</h3>
    <ul class="transactions">${list.map(transactionRow).join("")}</ul>`).join("") + more;
}

function select(name, label, options, selected) {
  return `
    <label class="select-row"><span class="sr">${esc(label)}</span>
      <select data-input="${name}" aria-label="${esc(label)}">${options.map(([value, text]) => `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(text)}</option>`).join("")}</select>
      <span class="caret" aria-hidden="true">▾</span>
    </label>`;
}

export function render(ctx, params) {
  const waiting = notReady(ctx.finance);
  if (waiting) return { crumbs: ["transactions"], html: waiting };
  const filters = { month: params.month ?? "", category: params.category ?? "" };
  const months = [["", "every month"], ...ctx.finance.months().map((month) => [month, monthLabel(month)])];
  const categories = [["", "every category"], ...CATEGORIES.map((category) => [category, category])];
  const controls = `
      <input class="search" type="search" placeholder="search" value="${esc(state.search)}" data-input="tx-search" autocomplete="off">
      <div class="filters">
        ${select("tx-month", "month", months, filters.month)}
        ${select("tx-category", "category", categories, filters.category)}
      </div>`;
  if (!wide()) {
    return { crumbs: ["transactions"], html: `${controls}<div data-part="list">${listHtml(ctx, filters)}</div>` };
  }
  const chosen = params.id ? ctx.finance.byId(params.id) : null;
  return {
    crumbs: chosen ? [["transactions", `/tx${queryString(filters)}`], displayName(chosen.merchant)] : ["transactions"],
    html: `
      <div class="split">
        <section class="split-list">${controls}<div data-part="list">${listHtml(ctx, filters, chosen?.id)}</div></section>
        <aside class="split-detail">${chosen ? detailHtml(chosen)
          : params.id ? `<p class="muted">this transaction isn't here any more</p>`
          : `<p class="muted">choose a transaction to see it here</p>`}</aside>
      </div>`,
  };
}

// On a wide screen, the table with this transaction beside it.
export function renderOne(ctx, params) {
  if (wide()) return render(ctx, params);
  const waiting = notReady(ctx.finance);
  if (waiting) return { crumbs: [["transactions", "/tx"]], html: waiting };
  const t = ctx.finance.byId(params.id);
  if (!t) {
    return { crumbs: [["transactions", "/tx"]], html: `<p class="muted">this transaction isn't here any more</p>` };
  }
  return { crumbs: [["transactions", "/tx"], displayName(t.merchant)], html: detailHtml(t) };
}

function detailHtml(t) {
  const name = displayName(t.merchant);
  const how = { auto: "category guessed", rule: `category used for every ${name} payment`, manual: "category set for this payment only" }[t.category_source];
  return `
      <h1>${esc(name)}</h1>
      <p class="big-amount ${t.amount > 0 ? "in" : ""}">${pounds(t.amount, { sign: true })}</p>
      <dl class="facts">
        <div><dt>date</dt><dd>${esc(dayLabel(t.booked_on))} ${esc(t.booked_on.slice(0, 4))}</dd></div>
        <div><dt>account</dt><dd>${esc(t.account)}</dd></div>
        ${t.type ? `<div><dt>type</dt><dd>${esc(t.type)}</dd></div>` : ""}
        <div><dt>statement</dt><dd class="raw">${esc(t.description)}</dd></div>
      </dl>
      ${heading("category")}
      <div class="chips">${CATEGORIES.map((category) => `<button type="button" class="chip${category === t.category ? " on" : ""}" ${action("tx-category-set", { id: t.id, value: category })}>${esc(category)}</button>`).join("")}</div>
      <label class="remember"><input type="checkbox" data-part="remember" checked> every ${esc(name)} payment</label>
      <p class="hint">${esc(how)}</p>
      <p class="error" data-part="error" hidden></p>`;
}

function refreshList(ctx) {
  const part = document.querySelector('[data-part="list"]');
  const selected = location.hash.match(/^#\/tx\/([\w-]+)/)?.[1] ?? null;
  if (part) part.innerHTML = listHtml(ctx, ctx.query(), selected);
}

export const inputs = {
  "tx-search"(ctx, field) {
    state.search = field.value;
    state.limit = PAGE;
    refreshList(ctx);
  },
  "tx-month"(ctx, field) {
    state.limit = PAGE;
    ctx.replaceQuery({ ...ctx.query(), month: field.value });
  },
  "tx-category"(ctx, field) {
    state.limit = PAGE;
    ctx.replaceQuery({ ...ctx.query(), category: field.value });
  },
};

export const actions = {
  "tx-more"(ctx) {
    state.limit += PAGE;
    refreshList(ctx);
  },
  async "tx-category-set"(ctx, { id, value }) {
    const remember = document.querySelector('[data-part="remember"]')?.checked ?? false;
    const error = document.querySelector('[data-part="error"]');
    try {
      await ctx.finance.setCategory(id, value, remember);
    } catch (problem) {
      if (error) {
        error.textContent = problem.message;
        error.hidden = false;
      }
    }
  },
};
