// Settings (the ⚙ at the top): the account, importing statements, the
// bank connection (when it's switched on), the theme; and the sign-in
// screen.
import { BANK_CONNECTION } from "../config.js";
import { dayLabel } from "../money.js";
import { CHART_STYLES, chartStyle, setChartStyle } from "../chartstyle.js";
import { setTheme, theme, THEMES } from "../theme.js";
import { latestBalances } from "../balances.js";
import { disablePush, enablePush, pushStatus } from "../push.js";
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

// Notifications on this device: filled in once the page is up, since
// checking is asynchronous.
const pushState = { status: "checking", message: null, error: null };

function notificationsHtml() {
  const note = pushState.message ? `<p class="flash">${esc(pushState.message)}</p>` : "";
  const error = pushState.error ? `<p class="error">${esc(pushState.error)}</p>` : "";
  const about = `<p class="hint">budgets at 80% and over, and a nudge before payday to move what's spare to savings; checked every morning at 9 and straight after an import</p>`;
  switch (pushState.status) {
    case "on":
      return `${note}${error}<p>on for this device.</p>${about}<div class="row-buttons">${button("send a test", "push-test")}${button("turn off", "push-off")}</div>`;
    case "install":
      return `<p>on an iPhone, add f1nanc3 to your home screen first: tap <b>share</b> in Safari, then <b>add to home screen</b>, and open it from there.</p>${about}`;
    case "blocked":
      return `${error}<p>blocked: allow notifications for f1nanc3 in this device's settings, then come back.</p>`;
    case "unsupported":
      return `<p>this browser can't receive notifications.</p>`;
    case "checking":
      return `<p class="muted">checking...</p>`;
    default:
      return `${note}${error}<p>off for this device.</p>${about}<div class="row-buttons">${button("turn on", "push-on", {}, { solid: true })}</div>`;
  }
}

export async function mounted() {
  pushState.status = await pushStatus().catch(() => "unsupported");
  const part = document.querySelector('[data-part="notifications"]');
  if (part) part.innerHTML = notificationsHtml();
}

async function pushAction(work) {
  pushState.message = null;
  pushState.error = null;
  try {
    await work();
  } catch (problem) {
    pushState.error = problem.message ?? String(problem);
  }
  await mounted();
}

// Record money you've moved between your accounts in your banking app,
// so f1nanc3 (and the savings goal) shows it before the statement does.
const moveState = { message: null, error: null };

function moveHtml(ctx, amount = "") {
  const accounts = ctx.finance.accountList();
  if (accounts.length < 2) return "";
  const savings = accounts.find((account) => ctx.finance.accountKind(account) === "savings") ?? accounts[1];
  const spending = accounts.find((account) => account !== savings) ?? accounts[0];
  const options = (selected) => accounts.map((account) => `<option value="${esc(account)}"${account === selected ? " selected" : ""}>${esc(ctx.finance.accountName(account))}${ctx.finance.accountName(account) !== account ? ` (${esc(account)})` : ""}</option>`).join("");
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return `
    <span id="move-money"></span>${heading("move money")}
    <p class="hint">moved money in your banking app? add it here and it shows straight away. When the statement comes in, its own record replaces this one, so nothing counts twice.</p>
    ${moveState.message ? `<p class="flash">${esc(moveState.message)}</p>` : ""}
    ${moveState.error ? `<p class="error">${esc(moveState.error)}</p>` : ""}
    <form class="editor move-form" data-form="move-money">
      <div class="pair">
        <label>from<span class="select-row"><select name="from">${options(spending)}</select><span class="caret" aria-hidden="true">▾</span></span></label>
        <label>to<span class="select-row"><select name="to">${options(savings)}</select><span class="caret" aria-hidden="true">▾</span></span></label>
      </div>
      <div class="pair">
        <label>amount<input name="amount" type="text" inputmode="decimal" placeholder="£" required autocomplete="off" value="${esc(amount)}"></label>
        <label>date<input name="date" type="date" value="${date}" required></label>
      </div>
      <button type="submit" class="button solid">add the move</button>
    </form>`;
}

// Each account: its name, and whether it's money to spend or savings.
function accountsHtml(ctx) {
  const accounts = ctx.finance.accountList();
  if (!accounts.length) return "";
  const balances = new Map(latestBalances(ctx.finance.transactions).map((b) => [b.account, b]));
  return `
    ${heading("accounts")}
    <ul class="accounts">${accounts.map((account) => {
      const own = ctx.finance.accounts.get(account) ?? {};
      const kind = own.kind ?? "spending";
      const balance = balances.get(account);
      return `
        <li>
          <form class="account-name" data-form="account-name" data-account="${esc(account)}">
            <span class="number">${esc(account)}</span>
            <input name="name" value="${esc(own.name ?? "")}" placeholder="name it" maxlength="40" autocomplete="off" aria-label="name for ${esc(account)}">
            <button type="submit" class="button small">save</button>
          </form>
          <div class="chips">${["spending", "savings"].map((choice) => `<button type="button" class="chip${choice === kind ? " on" : ""}" ${action("account-kind", { account, value: choice })}>${choice}</button>`).join("")}</div>
          ${balance ? `<span class="muted balance-note">£${balance.balance.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} on ${esc(dayLabel(balance.date))}</span>` : ""}
        </li>`;
    }).join("")}</ul>
    <p class="hint">names show in the list and the balance; savings are counted apart from money to spend</p>`;
}

export function render(ctx, params = {}) {
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
      ${accountsHtml(ctx)}
      ${moveHtml(ctx, params.move ?? "")}
      ${BANK_CONNECTION ? `${heading("bank")}${bankHtml(ctx)}` : ""}
      ${heading("notifications")}
      <div data-part="notifications">${notificationsHtml()}</div>
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
  "push-on"(ctx) {
    return pushAction(async () => {
      await enablePush(ctx.cloud);
      pushState.message = "notifications are on: try sending a test";
    });
  },
  "push-off"(ctx) {
    return pushAction(() => disablePush(ctx.cloud));
  },
  "push-test"(ctx) {
    return pushAction(async () => {
      const sent = await ctx.cloud.sendTestPush();
      if (!sent) throw new Error("the server couldn't reach this device: try turning notifications off and on");
      pushState.message = "sent: it should arrive in a few seconds";
    });
  },
  async "account-kind"(ctx, { account, value }) {
    await ctx.finance.saveAccount(account, { kind: value }).catch((problem) => alert(problem.message));
  },
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
  async "move-money"(ctx, form) {
    moveState.message = null;
    moveState.error = null;
    const from = form.elements.from.value;
    const to = form.elements.to.value;
    const amount = Number(String(form.elements.amount.value).replace(/[£,\s]/g, ""));
    const date = form.elements.date.value;
    if (from === to) moveState.error = "pick two different accounts";
    else if (!Number.isFinite(amount) || amount <= 0) moveState.error = "that amount doesn't look right";
    if (moveState.error) return ctx.render();
    try {
      await ctx.finance.addMove({ from, to, amount, date });
      moveState.message = `moved £${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} from ${ctx.finance.accountName(from)} to ${ctx.finance.accountName(to)}`;
    } catch (problem) {
      moveState.error = problem.message;
    }
    ctx.render();
  },
  async "account-name"(ctx, form) {
    const name = form.elements.name.value.trim() || null;
    await ctx.finance.saveAccount(form.dataset.account, { name }).catch((problem) => alert(problem.message));
  },
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
