// What-if mode (#/budget/whatif): a slider per category and a box per
// subscription; the saving and the goal's month follow as you drag. The
// page is drawn once and then patched in place (replacing it would drop
// the slider you're holding). Nothing is saved: it's for trying things.
import { budgetPicture } from "./budget.js";
import { CUT_STEP, goalMonth, MAX_CUT, whatIf } from "../whatif.js";
import { monthLabel } from "../money.js";
import { button, esc, heading, notReady } from "../ui.js";

const state = { cuts: {}, cancelled: new Set() };

const whole = (amount) => `£${Math.round(amount).toLocaleString("en-GB")}`;

function savingText(saving) {
  return saving < 0 ? `${whole(-saving)} short` : whole(saving);
}

function goalText(months) {
  if (months === null) return "never, at this rate";
  if (months === 0) return "reached";
  return monthLabel(goalMonth(months));
}

function soonerText(before, after) {
  if (after === null) return "";
  if (before === null) return after === 0 ? "" : "(instead of never)";
  const sooner = before - after;
  if (sooner <= 0) return "(as now)";
  return `(${sooner} month${sooner === 1 ? "" : "s"} sooner)`;
}

function cutText(row) {
  return row.cut ? `−${row.cut}% · saves ${whole(row.before - row.after)}` : "as now";
}

// Bars are against the biggest category, so they compare.
const widthOf = (amount, most) => `${Math.max(0, Math.min(100, (amount / most) * 100)).toFixed(1)}%`;

export function render(ctx) {
  const crumbs = [["budget", "/budget"], "what if"];
  const waiting = notReady(ctx.finance);
  if (waiting) return { crumbs, html: waiting };
  if (!ctx.finance.transactions.length) {
    return { crumbs, html: `<p class="muted">import a statement first (settings ⚙): what-if starts from how you spend</p>` };
  }
  const picture = budgetPicture(ctx);
  const w = whatIf(picture, state);
  if (!w.rows.length) {
    return { crumbs, html: `<p class="muted">there isn't a full month of spending to start from yet</p>` };
  }
  const most = Math.max(...w.rows.map((row) => row.before), 1);
  return {
    crumbs,
    html: `
      <div class="whatif">
        <div class="whatif-head">
          <p class="muted">you'd save a month</p>
          <p class="whatif-save"><span class="big" data-w="save">${esc(savingText(w.after.saving))}</span> <span class="muted" data-w="was">${esc(w.after.saving === w.before.saving ? "as now" : `was ${savingText(w.before.saving)}`)}</span></p>
          <p>goal reached <b class="whatif-goal" data-w="goal">${esc(goalText(w.after.monthsToGoal))}</b> <span class="muted" data-w="sooner">${esc(soonerText(w.before.monthsToGoal, w.after.monthsToGoal))}</span></p>
          ${picture.hasSavings ? "" : `<p class="hint">mark your savings account in settings ⚙ so what's saved counts towards the goal</p>`}
        </div>

        ${heading("spend less on")}
        <p class="hint">from a typical month (what you really spend), not your plan. nothing here changes your budget</p>
        <ul class="whatif-rows">${w.rows.map((row) => `
          <li>
            <label class="whatif-label" for="cut-${esc(row.category)}">
              <span>${esc(row.category)}</span>
              <span class="whatif-cut" data-w-cut="${esc(row.category)}">${esc(cutText(row))}</span>
            </label>
            <div class="whatif-bar" aria-hidden="true">
              <span class="ghost" style="width: ${widthOf(row.before, most)}"></span>
              <span class="fill${row.cut ? " cut" : ""}" data-w-fill="${esc(row.category)}" style="width: ${widthOf(row.after, most)}"></span>
            </div>
            <div class="whatif-slide">
              <input id="cut-${esc(row.category)}" type="range" min="0" max="${MAX_CUT}" step="${CUT_STEP}" value="${row.cut}" data-input="whatif-cut" data-category="${esc(row.category)}">
              <span class="amount" data-w-amount="${esc(row.category)}">${esc(whole(row.after))}</span>
            </div>
          </li>`).join("")}
        </ul>

        ${w.subs.length ? `
          ${heading("cancel")}
          <div class="whatif-subs">${w.subs.map((sub) => `
            <label class="whatif-sub${sub.cancelled ? " on" : ""}">
              <input type="checkbox" data-input="whatif-cancel" data-merchant="${esc(sub.merchant)}"${sub.cancelled ? " checked" : ""}>
              <span><span>${esc(sub.name)}</span><small>${esc(`£${sub.monthly.toFixed(2)}`)}</small></span>
            </label>`).join("")}
          </div>` : ""}

        <div class="row-buttons">${button("start again", "whatif-reset")}</div>
      </div>`,
  };
}

// Puts the new numbers on the page without redrawing it.
function update(ctx) {
  const w = whatIf(budgetPicture(ctx), state);
  const set = (selector, text) => {
    const element = document.querySelector(selector);
    if (element && element.textContent !== text) element.textContent = text;
  };
  set('[data-w="save"]', savingText(w.after.saving));
  set('[data-w="was"]', w.after.saving === w.before.saving ? "as now" : `was ${savingText(w.before.saving)}`);
  set('[data-w="goal"]', goalText(w.after.monthsToGoal));
  set('[data-w="sooner"]', soonerText(w.before.monthsToGoal, w.after.monthsToGoal));
  const most = Math.max(...w.rows.map((row) => row.before), 1);
  for (const row of w.rows) {
    const key = CSS.escape(row.category);
    set(`[data-w-cut="${key}"]`, cutText(row));
    set(`[data-w-amount="${key}"]`, whole(row.after));
    const fill = document.querySelector(`[data-w-fill="${key}"]`);
    if (fill) {
      fill.style.width = widthOf(row.after, most);
      fill.classList.toggle("cut", row.cut > 0);
    }
  }
  for (const sub of w.subs) {
    document.querySelector(`[data-merchant="${CSS.escape(sub.merchant)}"]`)?.closest(".whatif-sub")?.classList.toggle("on", sub.cancelled);
  }
}

export const inputs = {
  "whatif-cut"(ctx, field) {
    state.cuts = { ...state.cuts, [field.dataset.category]: Number(field.value) };
    update(ctx);
  },
  "whatif-cancel"(ctx, field) {
    const cancelled = new Set(state.cancelled);
    if (field.checked) cancelled.add(field.dataset.merchant);
    else cancelled.delete(field.dataset.merchant);
    state.cancelled = cancelled;
    update(ctx);
  },
};

export const actions = {
  "whatif-reset"(ctx) {
    state.cuts = {};
    state.cancelled = new Set();
    ctx.render();
  },
};
