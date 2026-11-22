// Uploading a statement CSV: read it on the device, show what's in it,
// then add the new transactions.
import { readStatement } from "../csv.js";
import { dayLabel, monthLabel, pounds, windowStart } from "../money.js";
import { button, esc, heading } from "../ui.js";

// What's been read and not yet imported, and the last import's result.
const state = { file: null, read: null, working: false, result: null, error: null };

function previewHtml() {
  const { file, read } = state;
  if (!read) return "";
  if (read.error) return `<p class="error">${esc(file)}: ${esc(read.error)}</p>`;
  const list = read.transactions;
  if (!list.length) return `<p class="error">${esc(file)} has no transactions in it</p>`;
  const start = windowStart();
  const recent = list.filter((t) => t.booked_on >= start);
  const dates = list.map((t) => t.booked_on).sort();
  const accounts = [...new Set(list.map((t) => t.account))];
  const out = recent.filter((t) => t.amount < 0).reduce((total, t) => total - t.amount, 0);
  return `
    ${heading(file)}
    <dl class="facts">
      <div><dt>transactions</dt><dd>${list.length}</dd></div>
      <div><dt>dates</dt><dd>${esc(dayLabel(dates[0]))} ${dates[0].slice(0, 4)} to ${esc(dayLabel(dates.at(-1)))} ${dates.at(-1).slice(0, 4)}</dd></div>
      <div><dt>${accounts.length === 1 ? "account" : "accounts"}</dt><dd>${esc(accounts.join(", "))}</dd></div>
      <div><dt>money out</dt><dd>${pounds(out)}</dd></div>
    </dl>
    ${list.length > recent.length ? `<p class="hint">${list.length - recent.length} from before ${esc(monthLabel(start.slice(0, 7)))} will be left out: f1nanc3 keeps 13 months</p>` : ""}
    ${read.skipped ? `<p class="hint">${read.skipped} lines weren't transactions and were skipped</p>` : ""}
    <div class="row-buttons">
      ${state.working ? `<button type="button" class="button solid" disabled>importing...</button>`
        : button(`import ${recent.length}`, "import-go", {}, { solid: true })}
      ${state.working ? "" : button("cancel", "import-cancel")}
    </div>`;
}

export function render() {
  const result = state.result;
  return {
    crumbs: ["import"],
    html: `
      ${result ? `<p class="flash">added ${result.added} new${result.already ? `; ${result.already} were already here` : ""}${result.tooOld ? `; ${result.tooOld} too old` : ""}</p>` : ""}
      ${state.error ? `<p class="error">${esc(state.error)}</p>` : ""}
      <p>Upload a statement CSV from RBS. Transactions already here are skipped, so overlapping dates are fine.</p>
      <label class="button solid wide file">choose a CSV file
        <input type="file" accept=".csv,text/csv" data-input="import-file" hidden>
      </label>
      <div data-part="preview">${previewHtml()}</div>
      ${heading("getting one from RBS")}
      <ol class="how">
        <li>Sign in to RBS digital banking in a web browser.</li>
        <li>Open your current account's transactions or statements.</li>
        <li>Choose to download or export them, pick the dates (up to a year), and pick CSV as the format.</li>
      </ol>
      <p class="hint">The menu names may differ a little. Nothing is uploaded until you tap import, and only the last 4 digits of the account number are kept.</p>`,
  };
}

function showPreview() {
  const part = document.querySelector('[data-part="preview"]');
  if (part) part.innerHTML = previewHtml();
}

export const inputs = {
  async "import-file"(ctx, field) {
    const file = field.files?.[0];
    field.value = "";
    if (!file) return;
    state.result = null;
    state.error = null;
    state.file = file.name;
    state.read = await readStatement(await file.text());
    ctx.render();
  },
};

export const actions = {
  async "import-go"(ctx) {
    if (!state.read?.transactions.length || state.working) return;
    state.working = true;
    showPreview();
    try {
      state.result = await ctx.finance.importStatement(state.read.transactions);
      state.read = null;
      state.file = null;
    } catch (error) {
      state.error = error.message ?? String(error);
    }
    state.working = false;
    ctx.render();
  },
  "import-cancel"(ctx) {
    state.read = null;
    state.file = null;
    ctx.render();
  },
};
