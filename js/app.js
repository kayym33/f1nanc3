// f1nanc3: routing, rendering and the pieces every view shares (header
// trail, tab bar). Views live in views/; each returns {crumbs, html} and
// lists its actions, forms and inputs, which the handlers here dispatch
// to by name (data-action="tx-more"). Modelled on t1ld3's phone app.
import { AuthError, Cloud } from "./cloud.js";
import { Finance } from "./data.js";
import { applyTheme } from "./theme.js";
import { esc, WIDE, wide } from "./ui.js";
import * as importer from "./views/importer.js";
import * as me from "./views/me.js";
import * as overview from "./views/overview.js";
import * as river from "./views/river.js";
import * as transactions from "./views/transactions.js";
import * as wrapped from "./views/wrapped.js";

const NOISE = " .:;'`~*+-,";
const SPECK_SHARE = 0.4;
// Reload when the app comes back after this long in the background.
const STALE_MS = 10 * 60 * 1000;

const cloud = new Cloud();
const finance = new Finance(cloud);
const main = document.querySelector("main");

// [pattern, view name, render, tab]
const ROUTES = [
  [/^\/$/, "overview", overview.render, "/"],
  [/^\/m\/(?<month>\d{4}-\d{2})$/, "overview", overview.render, "/"],
  [/^\/tx$/, "transactions", transactions.render, "/tx"],
  [/^\/tx\/(?<id>[\w-]+)$/, "transaction", transactions.renderOne, "/tx"],
  [/^\/river$/, "river", river.render, "/river"],
  [/^\/river\/(?<month>\d{4}-\d{2})$/, "river", river.render, "/river"],
  [/^\/wrapped$/, "wrapped", wrapped.render, "/"],
  [/^\/import$/, "import", importer.render, "/import"],
  [/^\/me$/, "me", me.render, "/me"],
];
const VIEWS = [overview, transactions, river, wrapped, importer, me];
const handlers = (kind) => Object.assign({}, ...VIEWS.map((view) => view[kind] ?? {}));
const ACTIONS = handlers("actions");
const FORMS = handlers("forms");
const INPUTS = handlers("inputs");

let currentPath = null;
let currentTab = null;
let loadedAt = 0;
const scrolls = new Map();

function split(hash) {
  const [path, search = ""] = hash.replace(/^#/, "").split("?");
  return { path: path || "/", query: Object.fromEntries(new URLSearchParams(search)) };
}

function route() {
  const { path, query } = split(location.hash);
  for (const [pattern, name, view, tab] of ROUTES) {
    const match = path.match(pattern);
    if (match) return { path, query, name, view, tab, params: { ...query, ...(match.groups ?? {}) } };
  }
  return { path: "/", query: {}, name: "overview", view: overview.render, tab: "/", params: {} };
}

const ctx = {
  cloud, finance,
  go(path) {
    if (location.hash !== `#${path}`) history.pushState(null, "", `#${path}`);
    render();
  },
  render,
  query: () => route().query,
  // Changes the filters without adding a history entry for each one.
  replaceQuery(query) {
    const kept = Object.entries(query).filter(([, value]) => value);
    const search = new URLSearchParams(kept).toString();
    history.replaceState(null, "", `#${route().path}${search ? `?${search}` : ""}`);
    render();
  },
};

function crumbHtml(crumbs) {
  // The "1" wears the accent, as t1ld3's does.
  const parts = [`<a href="#/" class="home">f<span class="one">1</span>nanc3</a>`];
  for (const [index, crumb] of crumbs.entries()) {
    const [label, href] = Array.isArray(crumb) ? crumb : [crumb, null];
    const last = index === crumbs.length - 1;
    parts.push(last || !href ? `<span>${esc(label)}</span>` : `<a href="#${href}">${esc(label)}</a>`);
  }
  return parts.join(`<span class="slash">/</span>`);
}

// The focused field, so a re-render can put focus (and the caret) back.
function focusedField() {
  const element = document.activeElement;
  if (!element || !main.contains(element) || !element.dataset?.input) return null;
  return { key: `[data-input="${element.dataset.input}"]`, start: element.selectionStart, end: element.selectionEnd };
}

function render() {
  const current = route();
  const signedIn = cloud.signedIn;
  const result = signedIn ? current.view(ctx, current.params) : me.renderSignIn();
  const fullPath = location.hash;
  const sameRoute = fullPath === currentPath;
  if (!sameRoute && currentPath !== null) scrolls.set(currentPath, window.scrollY);
  // On a wide screen, choosing a transaction keeps the table where it was.
  const stay = sameRoute || (wide() && current.tab === "/tx" && currentTab === "/tx");
  const scroll = stay ? window.scrollY : scrolls.get(fullPath) ?? 0;
  const focus = focusedField();
  currentPath = fullPath;
  currentTab = current.tab;

  document.querySelector(".trail").innerHTML = crumbHtml(result.crumbs);
  document.querySelector("nav").hidden = !signedIn;
  for (const link of document.querySelectorAll("nav a")) {
    link.classList.toggle("on", signedIn && link.getAttribute("href") === `#${current.tab}`);
  }
  main.dataset.view = signedIn ? current.name : "sign-in";
  // While the bank connection needs you, every page says so (not wrapped).
  const banner = signedIn && current.name !== "wrapped" ? me.bankBanner(finance) : null;
  const bannerBox = document.querySelector(".banner");
  bannerBox.hidden = !banner;
  bannerBox.innerHTML = banner ?? "";
  // Sticky things on a wide screen sit just under the header.
  document.documentElement.style.setProperty("--header-height", `${document.querySelector("header").offsetHeight}px`);
  main.innerHTML = result.html;
  window.scrollTo(0, scroll);
  // Views that draw once they're on the page (the river's canvas).
  result.mounted?.();
  if (focus) {
    const field = main.querySelector(focus.key);
    if (field) {
      field.focus({ preventScroll: true });
      try {
        field.setSelectionRange(focus.start, focus.end);
      } catch {
        // Not a text field.
      }
    }
  }
}

// Two rows of faint marks, a share of them specks of the accent.
function fillNoise() {
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  const mark = () => NOISE[1 + Math.floor(Math.random() * (NOISE.length - 1))];
  const glyph = () => {
    if (Math.random() >= 0.18) return " ";
    if (Math.random() >= SPECK_SHARE) return esc(mark());
    return `<b style="color:${accent}">${esc(mark())}</b>`;
  };
  const row = () => Array.from({ length: 160 }, glyph).join("");
  document.querySelector(".noise").innerHTML = `${row()}\n${row()}`;
}

async function load() {
  if (!cloud.signedIn) return;
  await finance.load();
  loadedAt = Date.now();
  // A revoked sign-in shows up as an error here; go back to signing in.
  if (!cloud.signedIn) render();
}

// Taps, forms and typing all dispatch by name.

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const name = target.dataset.action;
  if (name === "go") return ctx.go(target.dataset.to);
  if (name === "reload") return load();
  ACTIONS[name]?.(ctx, { ...target.dataset }, target);
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  FORMS[form.dataset.form]?.(ctx, form);
});

// Text fields act as you type; menus and file pickers when they change.
document.addEventListener("input", (event) => {
  const field = event.target;
  if (field.tagName === "SELECT" || field.type === "file") return;
  const name = field.dataset?.input;
  if (name) INPUTS[name]?.(ctx, field);
});
document.addEventListener("change", (event) => {
  const field = event.target;
  if (field.tagName !== "SELECT" && field.type !== "file") return;
  const name = field.dataset?.input;
  if (name) INPUTS[name]?.(ctx, field);
});

const followAddress = () => {
  if (location.hash !== currentPath) render();
};
window.addEventListener("hashchange", followAddress);
window.addEventListener("popstate", followAddress);
finance.listeners.push(render);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - loadedAt > STALE_MS) load();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
// Crossing between phone and desktop widths changes some views' markup.
matchMedia(WIDE).addEventListener("change", () => render());
window.addEventListener("unhandledrejection", (event) => {
  if (event.reason instanceof AuthError) render();
});

history.scrollRestoration = "manual";
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
applyTheme();
fillNoise();
// Back from approving at the bank: ?code=...&state=... (or ?error=...).
const back = new URLSearchParams(location.search);
if (cloud.signedIn && (back.has("code") || back.has("error")) && back.has("state")) {
  const keep = new URLSearchParams([...back].filter(([name]) => name === "api"));
  history.replaceState(null, "", `${location.pathname}${keep.size ? `?${keep}` : ""}#/me`);
  render();
  me.finishConnecting(ctx, back);
} else {
  render();
  load();
}
