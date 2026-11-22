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
// Your names for accounts ("current" for "…5231"), set on each render.
let nameOf = (account) => account;

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

// The table's columns: what each sorts by, and its first direction.
// Amount's first click puts the biggest spending at the top.
const COLUMNS = [
  { key: "date", label: "date", value: (t) => t.booked_on, first: "desc" },
  { key: "merchant", label: "merchant", value: (t) => displayName(t.merchant).toLowerCase(), first: "asc" },
  { key: "category", label: "category", value: (t) => t.category, first: "asc" },
  { key: "amount", label: "amount", value: (t) => t.amount, first: "asc", num: true },
  { key: "account", label: "account", value: (t) => nameOf(t.account).toLowerCase(), first: "asc" },
];
const SORT_KEY = "f1nanc3.txSort";
const WIDTHS_KEY = "f1nanc3.txColumns";

function stored(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function store(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is off: it lasts until the page closes.
  }
}

// The table's order, remembered on this device: newest first to start.
let sort = stored(SORT_KEY, { key: "date", dir: "desc" });

// Sorted by the chosen column; ties stay newest first.
export function sorted(list, by = sort) {
  const column = COLUMNS.find((c) => c.key === by.key) ?? COLUMNS[0];
  const sign = by.dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const x = column.value(a);
    const y = column.value(b);
    const order = x < y ? -1 : x > y ? 1 : 0;
    return order * sign || b.booked_on.localeCompare(a.booked_on);
  });
}

function tableHtml(shown, filters, selected) {
  const query = queryString(filters);
  // Column widths you've dragged, remembered on this device.
  const widths = stored(WIDTHS_KEY, null);
  const head = COLUMNS.map((column, i) => {
    const on = sort.key === column.key;
    const arrow = on ? (sort.dir === "asc" ? "▲" : "▼") : "";
    return `<th class="${column.num ? "num " : ""}${on ? "sorted" : ""}" aria-sort="${on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}">
      <button type="button" class="sort" ${action("tx-sort", { key: column.key })}>${esc(column.label)}<span class="arrow">${arrow}</span></button>
      <span class="col-resize" data-col="${i}" title="drag to resize · double-click to reset" aria-hidden="true"></span></th>`;
  }).join("");
  return `
    <table class="tx-table${widths ? " sized" : ""}">
      ${widths ? `<colgroup>${widths.map((width) => `<col style="width:${Number(width)}px">`).join("")}</colgroup>` : ""}
      <thead><tr>${head}</tr></thead>
      <tbody>${shown.map((t) => `
        <tr class="${t.id === selected ? "on" : ""}" ${action("go", { to: `/tx/${t.id}${query}` })}>
          <td class="date">${esc(dayLabel(t.booked_on))}</td>
          <td class="who">${esc(displayName(t.merchant))}</td>
          <td class="what">${esc(t.category)}</td>
          <td class="num ${t.amount > 0 ? "in" : ""}">${pounds(t.amount, { sign: t.amount > 0 })}</td>
          <td class="muted">${esc(nameOf(t.account))}</td>
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
  if (wide()) return tableHtml(sorted(found).slice(0, state.limit), filters, selected) + more;
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
  nameOf = (account) => ctx.finance.accountName(account);
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
  nameOf = (account) => ctx.finance.accountName(account);
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
        <div><dt>account</dt><dd>${esc(nameOf(t.account))}${nameOf(t.account) !== t.account ? ` <span class="muted">${esc(t.account)}</span>` : ""}</dd></div>
        ${t.type ? `<div><dt>type</dt><dd>${esc(t.type)}</dd></div>` : ""}
        ${t.source === "manual" ? `<div><dt>added</dt><dd>by hand, in settings · your next statement's own record will replace it</dd></div>` : ""}
        <div><dt>statement</dt><dd class="raw">${esc(t.description)}</dd></div>
      </dl>
      ${heading("category")}
      <div class="chips">${CATEGORIES.map((category) => `<button type="button" class="chip${category === t.category ? " on" : ""}" ${action("tx-category-set", { id: t.id, value: category })}>${esc(category)}</button>`).join("")}</div>
      <label class="remember"><input type="checkbox" data-part="remember" checked> every ${esc(name)} payment</label>
      <p class="hint">${esc(how)}</p>
      <p class="error" data-part="error" hidden></p>
      ${t.source === "manual" ? `<div class="row-buttons bottom">${button("remove this move", "tx-remove-move", { id: t.id })}</div>` : ""}`;
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
  // A heading: sort by it, or turn the order round if it's already sorted.
  "tx-sort"(ctx, { key }) {
    const column = COLUMNS.find((c) => c.key === key);
    if (!column) return;
    sort = sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: column.first };
    store(SORT_KEY, sort);
    state.limit = PAGE;
    refreshList(ctx);
  },
  "tx-more"(ctx) {
    state.limit += PAGE;
    refreshList(ctx);
  },
  async "tx-remove-move"(ctx, { id }) {
    if (!confirm("remove this move (both its halves)?")) return;
    await ctx.finance.removeMove(id);
    ctx.go("/tx");
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

// Dragging a heading's right edge resizes its column. The first drag fixes
// every column at its current width, so only the dragged one changes.
document.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest(".col-resize");
  if (!handle) return;
  event.preventDefault();
  const table = handle.closest("table");
  const headings = [...table.querySelectorAll("thead th")];
  let widths = headings.map((th) => Math.round(th.getBoundingClientRect().width));
  if (!table.querySelector("colgroup")) {
    table.insertAdjacentHTML("afterbegin", `<colgroup>${widths.map((w) => `<col style="width:${w}px">`).join("")}</colgroup>`);
    table.classList.add("sized");
  }
  const cols = [...table.querySelectorAll("col")];
  const index = Number(handle.dataset.col);
  const startX = event.clientX;
  const startWidth = widths[index];
  handle.setPointerCapture(event.pointerId);
  table.classList.add("resizing");
  const move = (e) => {
    widths[index] = Math.max(48, Math.round(startWidth + e.clientX - startX));
    cols[index].style.width = `${widths[index]}px`;
  };
  const up = () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", up);
    table.classList.remove("resizing");
    store(WIDTHS_KEY, widths);
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", up);
});

// Double-clicking an edge puts every column back to its natural width.
document.addEventListener("dblclick", (event) => {
  const handle = event.target.closest(".col-resize");
  if (!handle) return;
  const table = handle.closest("table");
  table.querySelector("colgroup")?.remove();
  table.classList.remove("sized");
  store(WIDTHS_KEY, null);
});
