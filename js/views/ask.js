// The command line (#/ask, or / anywhere): type a question in js/ask.js's
// fixed words and the answer prints below it, terminal-style. Only the
// questions are kept (in memory, for this visit); answers are worked out
// again on every render, so they follow the data and go when it's cleared.
import { ask, HELP, PLACE_NAMES } from "../ask.js";
import { displayName } from "../categories.js";
import { dayLabel, monthLabel, pounds } from "../money.js";
import { action, bar, esc, notReady } from "../ui.js";

const KEEP = 12;
const SHORTCUTS = ["biggest spend this month", "where do i spend the most", "by category last month", "help"];
const state = { asked: [], text: "" };

const money = (amount) => pounds(amount);
const short = (month) => monthLabel(month).slice(0, 3);

function line(text, kind = "") {
  return `<p class="ask-line ${kind}">${text}</p>`;
}

function answerHtml(answer) {
  if (answer.kind === "help") {
    return line("say what to look for, and when:", "dim")
      + HELP.map(([example, about]) => `<p class="ask-line ask-help"><button type="button" class="ask-example" ${action("ask-run", { q: example })}>${esc(example)}</button> <span class="dim">${esc(about)}</span></p>`).join("")
      + line(esc(`everyday words mean the usual places: ${PLACE_NAMES.join(", ")}. categories have other names too (food shop, restaurants, travel, fun, wages...). anything else is looked for in the shops' names. words like "how much did i spend on" are skipped`), "dim")
      + line("no AI: everything stays on this device", "dim");
  }

  if (answer.kind === "biggest") {
    if (!answer.rows.length) return line("nothing found. try <b>help</b>", "dim");
    const most = -answer.rows[0].amount;
    return line(esc(`biggest ${answer.rows.length}${answer.term ? ` · ${answer.term}` : ""}${answer.when ? ` · ${answer.when}` : ""}`), "dim")
      + `<ul class="ask-rows">${answer.rows.map((t) => `
        <li ${action("go", { to: `/tx/${t.id}` })}>
          <span class="who">${esc(displayName(t.merchant))} <small>${esc(dayLabel(t.booked_on))}</small></span>
          <span class="meter">${bar(-t.amount / most, 10)}</span>
          <span class="amount">${esc(money(-t.amount))}</span>
        </li>`).join("")}</ul>`;
  }

  if (answer.kind === "places") {
    if (!answer.rows.length) return line("nothing found. try <b>help</b>", "dim");
    const most = answer.rows[0].total;
    return line(esc(`top ${answer.rows.length} places${answer.term ? ` · ${answer.term}` : ""}${answer.when ? ` · ${answer.when}` : ""}`), "dim")
      + `<ul class="ask-rows">${answer.rows.map((row) => `
        <li ${action("ask-run", { q: `${row.merchant}${answer.when ? ` ${answer.when}` : ""}` })}>
          <span class="who">${esc(displayName(row.merchant))} <small>${row.count}×</small></span>
          <span class="meter">${bar(row.total / most, 10)}</span>
          <span class="amount">${esc(money(row.total))}</span>
        </li>`).join("")}</ul>`;
  }

  if (answer.kind === "categories") {
    if (!answer.rows.length) return line("nothing found. try <b>help</b>", "dim");
    const most = answer.rows[0].total;
    return line(esc(`by category${answer.term ? ` · ${answer.term}` : ""}${answer.when ? ` · ${answer.when}` : ""}`), "dim")
      + line(`<b>${esc(money(answer.total))}</b> out`)
      + `<ul class="ask-rows">${answer.rows.map((row) => `
        <li ${action("ask-run", { q: `${row.category}${answer.when ? ` ${answer.when}` : ""}` })}>
          <span class="who">${esc(row.category)} <small>${row.total / answer.total < 0.01 ? "<1" : Math.round((row.total / answer.total) * 100)}%</small></span>
          <span class="meter">${bar(row.total / most, 10)}</span>
          <span class="amount">${esc(money(row.total))}</span>
        </li>`).join("")}</ul>`;
  }

  if (answer.kind === "vs") {
    const most = Math.max(...answer.sides.map((side) => side.out), 0.01);
    const [a, b] = answer.sides;
    const more = a.out === b.out ? null : a.out > b.out ? a : b;
    return line(esc(`${a.term} vs ${b.term}${answer.when ? ` · ${answer.when}` : ""}`), "dim")
      + `<ul class="ask-rows">${answer.sides.map((side) => `
        <li>
          <span class="who">${esc(side.term)} <small>${side.count} payment${side.count === 1 ? "" : "s"}</small></span>
          <span class="meter">${bar(side.out / most, 10)}</span>
          <span class="amount">${esc(money(side.out))}</span>
        </li>`).join("")}</ul>`
      + (more ? line(esc(`${more.term} cost ${money(Math.abs(a.out - b.out))} more`), "dim") : "");
  }

  // A search.
  if (!answer.count) return line(`nothing found for "${esc(answer.term)}"${answer.when ? ` ${esc(answer.when)}` : ""}. try <b>help</b>`, "dim");
  const most = Math.max(...answer.months.map((row) => row.out), 0.01);
  const head = `${answer.term ? `"${answer.term}"` : "everything"}${answer.when ? ` · ${answer.when}` : ""}`;
  const totals = [
    answer.out ? `<b>${esc(money(answer.out))}</b> out` : "",
    answer.in ? `<b>${esc(money(answer.in))}</b> in` : "",
    `${answer.count} payment${answer.count === 1 ? "" : "s"}`,
    answer.out && answer.average ? `avg ${esc(money(answer.average))}` : "",
  ].filter(Boolean).join(" · ");
  return line(esc(head), "dim")
    + line(totals)
    + (answer.months.length > 1 && answer.out ? `<ul class="ask-months">${answer.months.map((row) => `
        <li><span class="m">${esc(short(row.month))}</span><span class="meter">${bar(row.out / most, 16)}</span><span class="amount">${esc(money(row.out))}</span></li>`).join("")}</ul>` : "")
    + (answer.top.length > 1 ? line(`most: ${answer.top.map((row) => `${esc(displayName(row.merchant))} <span class="dim">(${row.count})</span>`).join(", ")}`) : "")
    + `<ul class="ask-rows recent">${answer.recent.map((t) => `
        <li ${action("go", { to: `/tx/${t.id}` })}>
          <span class="who">${esc(displayName(t.merchant))} <small>${esc(dayLabel(t.booked_on))}</small></span>
          <span class="meter"></span>
          <span class="amount${t.amount > 0 ? " in" : ""}">${esc(pounds(t.amount, { sign: t.amount > 0 }))}</span>
        </li>`).join("")}</ul>`;
}

export function render(ctx) {
  const waiting = notReady(ctx.finance);
  if (waiting) return { crumbs: ["ask"], html: waiting };
  const today = new Date();
  const asked = state.asked.length ? state.asked : null;
  return {
    crumbs: ["ask"],
    html: `
      <div class="ask">
        <div class="ask-log" aria-live="polite">
          ${asked ? asked.map((q) => `
            <div class="ask-entry">
              ${line(`<span class="prompt">&gt;</span> ${esc(q)}`, "ask-q")}
              ${answerHtml(ask(q, ctx.finance.transactions, today))}
            </div>`).join("") : line(`type a question, or <b>help</b>. press <b>/</b> anywhere to come back here`, "dim")}
        </div>
        <div class="ask-shortcuts">${SHORTCUTS.map((q) => `<button type="button" class="ask-example" ${action("ask-run", { q })}>${esc(q)}</button>`).join("")}${asked ? `<button type="button" class="ask-example" ${action("ask-clear")}>clear</button>` : ""}</div>
        <form class="ask-form" data-form="ask" autocomplete="off">
          <label for="ask-q" class="prompt">&gt;</label>
          <input id="ask-q" name="q" data-input="ask-text" type="text" enterkeyhint="go" autocapitalize="off" spellcheck="false" placeholder="coffee since june" value="${esc(state.text)}" aria-label="ask a question">
          <button type="submit" class="button">run</button>
        </form>
      </div>`,
    mounted() {
      const field = document.getElementById("ask-q");
      // Newest at the bottom, by the prompt, as a terminal.
      field?.scrollIntoView({ block: "end" });
      field?.focus({ preventScroll: true });
    },
  };
}

function run(ctx, q) {
  const text = String(q ?? "").trim().slice(0, 120);
  state.text = "";
  if (text) state.asked = [...state.asked, text].slice(-KEEP);
  ctx.render();
}

export const actions = {
  "ask-run"(ctx, { q }) {
    run(ctx, q);
  },
  "ask-clear"(ctx) {
    state.asked = [];
    ctx.render();
  },
};

export const forms = {
  ask(ctx, form) {
    run(ctx, form.elements.q.value);
  },
};

export const inputs = {
  "ask-text"(ctx, field) {
    state.text = field.value;
  },
};

// Forgets the questions (signing out, or the lock clearing the data).
export function forget() {
  state.asked = [];
  state.text = "";
}
