// Settings (the ⚙ at the top): the account, importing statements, the
// bank connection (when it's switched on), the theme; and the sign-in
// screen.
import { BANK_CONNECTION } from "../config.js";
import { dayLabel } from "../money.js";
import { CHART_STYLES, chartStyle, setChartStyle } from "../chartstyle.js";
import { setTheme, theme, THEMES } from "../theme.js";
import { action, button, esc, heading } from "../ui.js";

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

// Where the bank sends you back after you approve: this page's address
// without its route (the server only accepts the real site and localhost).
export const returnAddress = () => `${location.origin}/`;

// What's happening with the bank connection, set by the actions below.
const bankState = { working: null, message: null, error: null };

const when = (iso) => {
  const date = new Date(iso);
  const day = dayLabel(iso.slice(0, 10));
  return `${day} ${date.getFullYear()}`;
};

const ago = (iso) => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 36 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
};

function bankHtml(ctx) {
  const link = ctx.finance.link;
  const working = bankState.working ? `<p class="muted">${esc(bankState.working)}</p>` : "";
  const message = bankState.message ? `<p class="flash">${esc(bankState.message)}</p>` : "";
  const error = bankState.error ? `<p class="error">${esc(bankState.error)}</p>` : "";
  if (!link || link.status !== "active") {
    const ended = link?.status === "expired";
    return `
      ${message}${error}
      <p>${ended ? `your ${esc(link.bank)} connection has ended: the bank's approval ran out or was withdrawn. Connect again to keep transactions coming in.`
        : "connect your RBS accounts and new transactions come in every morning at 6am, no downloads needed."}</p>
      ${working || `<div class="row-buttons">${button(ended ? "connect again" : "connect RBS", "bank-connect", {}, { solid: true })}</div>`}
      <p class="hint">you'll approve in the RBS app and pick which accounts to share; f1nanc3 can only read transactions, never move money</p>`;
  }
  const accounts = (link.accounts ?? []).map((a) => a.account).join(", ") || "none";
  return `
    ${message}${error}
    <dl class="facts">
      <div><dt>bank</dt><dd>${esc(link.bank)}</dd></div>
      <div><dt>accounts</dt><dd>${esc(accounts)}</dd></div>
      <div><dt>until</dt><dd>${link.valid_until ? esc(when(link.valid_until)) : "the bank didn't say"}</dd></div>
      <div><dt>fetched</dt><dd>${link.last_synced_at ? esc(ago(link.last_synced_at)) : "not yet"}</dd></div>
      ${link.last_error ? `<div><dt>problem</dt><dd class="error">${esc(link.last_error)}</dd></div>` : ""}
    </dl>
    ${working || `<div class="row-buttons">${button("sync now", "bank-sync")}${button("disconnect", "bank-disconnect")}</div>`}
    <p class="hint">fetches by itself every morning at 6am</p>`;
}

// The banner every page shows while the connection needs you: in its last
// 7 days, or once it's ended. Null otherwise.
export function bankBanner(finance) {
  if (!BANK_CONNECTION) return null;
  const link = finance.link;
  if (!link) return null;
  if (link.status === "expired") return `your bank connection has ended · <a href="#/me">connect again ›</a>`;
  if (link.status !== "active" || !link.valid_until) return null;
  const days = Math.ceil((Date.parse(link.valid_until) - Date.now()) / 86400000);
  if (days > 7) return null;
  return `your bank connection ends ${days <= 1 ? "tomorrow" : `in ${days} days`} · <a href="#/me">reconnect ›</a>`;
}

// After approving at the bank, RBS sends you back here with ?code&state
// (or ?error). Finishes connecting and fetches your history.
export async function finishConnecting(ctx, params) {
  ctx.go("/me");
  if (params.get("error")) {
    bankState.error = params.get("error_description") || "the bank didn't give access";
    return ctx.render();
  }
  bankState.error = null;
  bankState.working = "connected; fetching your transactions...";
  ctx.render();
  try {
    const { added, accounts } = await ctx.cloud.callFunction("bank", { action: "finish", code: params.get("code"), state: params.get("state") });
    bankState.message = `connected ${plural(accounts.length, "account")}; ${plural(added, "new transaction")}`;
  } catch (problem) {
    bankState.error = problem.message;
  }
  bankState.working = null;
  await ctx.finance.load();
}

export function render(ctx) {
  const count = ctx.finance.transactions.length;
  return {
    crumbs: ["settings"],
    html: `
      ${heading("account")}
      <p>${esc(ctx.cloud.session?.email ?? "")}</p>
      <p class="hint">your t1ld3 account</p>
      <div class="row-buttons">${button("reload", "reload")}${button("sign out", "me-sign-out")}</div>
      ${heading("statements")}
      <p>${plural(count, "transaction")}, kept for the current month and the 12 before it.</p>
      <div class="row-buttons">${button("import a statement ›", "go", { to: "/import" }, { solid: true })}</div>
      ${BANK_CONNECTION ? `${heading("bank")}${bankHtml(ctx)}` : ""}
      ${heading("theme")}
      <div class="chips">${THEMES.map((choice) => `<button type="button" class="chip${choice === theme() ? " on" : ""}" ${action("me-theme", { value: choice })}>${choice}</button>`).join("")}</div>
      <p class="hint">auto follows this device's light and dark mode; the choice is kept on this device only</p>
      ${heading("charts")}
      <div class="chips">${CHART_STYLES.map(([name, label]) => `<button type="button" class="chip${name === chartStyle() ? " on" : ""}" ${action("me-charts", { value: name })}>${label}</button>`).join("")}</div>
      <p class="hint">terminal: area lines and price tags in ink and orange · green/red: the same in finance colours · soft: rounded bars, like a banking app. Kept on this device.</p>
      <p class="legal-links"><a href="privacy.html">privacy</a> · <a href="terms.html">terms</a></p>`,
  };
}

export const actions = {
  async "bank-connect"(ctx) {
    bankState.error = null;
    bankState.message = null;
    bankState.working = "opening RBS...";
    ctx.render();
    try {
      const { url } = await ctx.cloud.callFunction("bank", { action: "start", redirect_url: returnAddress() });
      location.href = url;
    } catch (problem) {
      bankState.working = null;
      bankState.error = problem.message;
      ctx.render();
    }
  },
  async "bank-sync"(ctx) {
    bankState.error = null;
    bankState.message = null;
    bankState.working = "fetching...";
    ctx.render();
    try {
      const added = await ctx.finance.syncBank();
      bankState.message = added ? plural(added, "new transaction") : "nothing new";
    } catch (problem) {
      bankState.error = problem.message;
      await ctx.finance.load();
    }
    bankState.working = null;
    ctx.render();
  },
  async "bank-disconnect"(ctx) {
    if (!confirm("disconnect the bank? transactions already here stay")) return;
    bankState.error = null;
    bankState.working = "disconnecting...";
    ctx.render();
    try {
      await ctx.cloud.callFunction("bank", { action: "disconnect" });
      bankState.message = "disconnected; your transactions are still here";
    } catch (problem) {
      bankState.error = problem.message;
    }
    bankState.working = null;
    await ctx.finance.load();
  },
  "me-charts"(ctx, { value }) {
    setChartStyle(value);
    ctx.render();
  },
  "me-theme"(ctx, { value }) {
    setTheme(value);
    ctx.render();
  },
  async "me-sign-out"(ctx) {
    if (!confirm("sign out of f1nanc3 here?")) return;
    await ctx.cloud.signOut();
    ctx.finance.clear();
    ctx.go("/");
  },
};

export function renderSignIn() {
  return {
    crumbs: ["sign in"],
    html: `
      <pre class="art center">  .---------.  \n  | f1nanc3 |  \n  '---------'  </pre>
      <p class="center muted">sign in with your t1ld3 account</p>
      <form class="editor" data-form="sign-in">
        <label>email<input name="email" type="email" autocomplete="username" required></label>
        <label>password<input name="password" type="password" autocomplete="current-password" required></label>
        <p class="error" hidden></p>
        <button type="submit" class="button solid wide">sign in</button>
      </form>`,
  };
}

export const forms = {
  async "sign-in"(ctx, form) {
    const error = form.querySelector(".error");
    error.hidden = true;
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    submit.textContent = "signing in...";
    try {
      await ctx.cloud.signIn(form.elements.email.value.trim(), form.elements.password.value);
      ctx.go("/");
      await ctx.finance.load();
    } catch (problem) {
      error.textContent = problem.message;
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = "sign in";
    }
  },
};
