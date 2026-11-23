// A stand-in for Supabase, for trying the app without a real account:
// node tests/stub_server.mjs, then open
// http://localhost:8765/?api=http://localhost:8766 and sign in with any
// email and password. Serves the app on 8765 and a pretend API on 8766,
// keeping data in memory. Only what f1nanc3 uses is implemented.
// It starts with a year of made-up transactions (tests/pretend_data.mjs);
// STUB_EMPTY=1 starts it empty instead.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { ACCOUNT_NAMES, pretendTransactions } from "./pretend_data.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const transactions = new Map();
// Account names: account -> {name, kind}.
const accountNames = new Map();
// Subscription choices: merchant -> {kind, url, hidden}.
const subscriptionSettings = new Map();
// The budget: {plan, amounts}, or null until one's picked.
let budget = null;
const rules = new Map();
// As supabase/schema.sql's fin_mark_transfers: the same amount out of one
// account and into another within a day is a transfer.
function markTransfers() {
  const all = [...transactions.values()];
  let marked = 0;
  for (const t of all) {
    if (t.category_source !== "auto" || t.category === "transfers") continue;
    const day = Date.parse(t.booked_on);
    const pair = all.some((o) => o.account !== t.account && Number(o.amount) === -Number(t.amount)
      && Math.abs(Date.parse(o.booked_on) - day) <= 86400000);
    if (pair) {
      t.category = "transfers";
      marked++;
    }
  }
  return marked;
}

if (!process.env.STUB_EMPTY) {
  for (const row of pretendTransactions()) transactions.set(row.id, row);
  for (const { account, name, kind } of ACCOUNT_NAMES) accountNames.set(account, { name, kind });
  markTransfers();
  // The rent goes to a person, so it's set as a bill, as you would.
  subscriptionSettings.set("to a/c …5555", { kind: "bill", url: null, hidden: false, cancelled_on: null });
}
// The pretend bank connection: [{id, bank, status, valid_until, accounts, ...}].
const links = [];

createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  const file = normalize(join(ROOT, path === "/" ? "index.html" : path));
  if (!file.startsWith(ROOT)) return response.writeHead(403).end();
  try {
    const body = await readFile(file);
    response.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(8765);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

function json(response, status, data) {
  response.writeHead(status, { ...CORS, "Content-Type": "application/json" }).end(data === undefined ? "" : JSON.stringify(data));
}

// PostgREST-style filters: column=eq.value / neq.value / gte.value.
function matches(row, params) {
  for (const [column, filter] of params) {
    if (["select", "order", "limit", "offset", "on_conflict"].includes(column)) continue;
    const [op, ...rest] = filter.split(".");
    const value = rest.join(".");
    const actual = String(row[column]);
    if (op === "eq" && actual !== value) return false;
    if (op === "in" && !value.replace(/^\(|\)$/g, "").split(",").includes(actual)) return false;
    if (op === "neq" && actual === value) return false;
    if (op === "gte" && actual < value) return false;
  }
  return true;
}

createServer(async (request, response) => {
  if (request.method === "OPTIONS") return json(response, 204);
  const url = new URL(request.url, "http://localhost");
  let body = "";
  for await (const chunk of request) body += chunk;
  const data = body ? JSON.parse(body) : null;
  const route = `${request.method} ${url.pathname}`;

  if (route === "POST /auth/v1/token") {
    return json(response, 200, {
      access_token: "stub", refresh_token: "stub", expires_in: 3600,
      user: { id: "00000000-0000-0000-0000-000000000001", email: data?.email ?? "you@example.com" },
    });
  }
  if (route === "POST /auth/v1/logout") return json(response, 204);

  if (route === "GET /rest/v1/fin_transactions") {
    const rows = [...transactions.values()].filter((row) => matches(row, url.searchParams))
      .sort((a, b) => b.booked_on.localeCompare(a.booked_on) || b.created_at - a.created_at);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return json(response, 200, rows.slice(offset, offset + Number(url.searchParams.get("limit") ?? 1000)));
  }
  if (route === "POST /rest/v1/fin_transactions") {
    const added = [];
    for (const row of data) {
      if (transactions.has(row.id)) continue;
      transactions.set(row.id, { ...row, created_at: Date.now() + added.length });
      added.push({ id: row.id });
    }
    return json(response, 201, added);
  }
  if (route === "DELETE /rest/v1/fin_transactions") {
    for (const [id, row] of [...transactions]) if (matches(row, url.searchParams)) transactions.delete(id);
    return json(response, 204);
  }
  if (route === "PATCH /rest/v1/fin_transactions") {
    for (const row of transactions.values()) if (matches(row, url.searchParams)) Object.assign(row, data);
    return json(response, 204);
  }
  // Notifications: no real push service here, so nothing is sent.
  if (route === "GET /functions/v1/fin-push") return json(response, 200, { vapid_public_key: null });
  if (route === "POST /functions/v1/fin-push") return json(response, 200, { sent: 0 });
  if (route === "POST /functions/v1/fin-alerts") return json(response, 200, { sent: 0 });
  if (route === "POST /rest/v1/fin_push_subscriptions" || route === "DELETE /rest/v1/fin_push_subscriptions") return json(response, 201);
  if (route === "GET /rest/v1/fin_budget") return json(response, 200, budget ? [budget] : []);
  if (route === "POST /rest/v1/fin_budget") {
    budget = { plan: data[0].plan, amounts: data[0].amounts };
    return json(response, 201);
  }
  if (route === "GET /rest/v1/fin_accounts") {
    return json(response, 200, [...accountNames].map(([account, row]) => ({ account, ...row })));
  }
  if (route === "POST /rest/v1/fin_accounts") {
    for (const { account, name, kind } of data) accountNames.set(account, { name, kind });
    return json(response, 201);
  }
  if (route === "GET /rest/v1/fin_subscriptions") {
    return json(response, 200, [...subscriptionSettings].map(([merchant, row]) => ({ merchant, ...row })));
  }
  if (route === "POST /rest/v1/fin_subscriptions") {
    for (const { merchant, updated_at: _, ...row } of data) subscriptionSettings.set(merchant, row);
    return json(response, 201);
  }
  if (route === "GET /rest/v1/fin_bank_links") {
    return json(response, 200, links.filter((link) => matches(link, url.searchParams)).reverse());
  }
  // A pretend bank: "approving" sends you straight back with a code.
  if (route === "POST /functions/v1/bank") {
    const active = links.find((link) => link.status === "active");
    if (data.action === "start") {
      links.push({ id: `l${links.length}`, bank: "Royal Bank of Scotland", status: "pending", state: "s1", accounts: [], valid_until: null, last_synced_at: null, last_error: null });
      return json(response, 200, { url: `${data.redirect_url}?api=http://localhost:8766&code=c1&state=s1` });
    }
    if (data.action === "finish") {
      const pending = links.findLast((link) => link.status === "pending");
      if (!pending || data.state !== pending.state) return json(response, 400, { error: "this approval doesn't match a connection you started" });
      Object.assign(pending, {
        status: "active", valid_until: new Date(Date.now() + (Number(process.env.STUB_DAYS ?? 90)) * 86400000).toISOString(),
        last_synced_at: new Date().toISOString(),
        accounts: [{ account: "…5678" }, { account: "…4321" }],
      });
      const today = new Date().toISOString().slice(0, 10);
      transactions.set("ebnew", { id: "ebnew", account: "…5678", booked_on: today, amount: -3.2, description: "GREGGS 12 , EDINBURGH GB", merchant: "greggs", type: "", category: "eating out", category_source: "auto", source: "bank", balance: null, created_at: Date.now() });
      return json(response, 200, { added: 1, accounts: ["…5678", "…4321"] });
    }
    if (data.action === "sync") {
      if (!active) return json(response, 400, { error: "no bank is connected" });
      active.last_synced_at = new Date().toISOString();
      return json(response, 200, { added: 0 });
    }
    if (data.action === "disconnect") {
      for (const link of links) if (link.status !== "disconnected") link.status = "disconnected";
      return json(response, 200, {});
    }
  }
  if (route === "DELETE /rest/v1/fin_rules") {
    for (const merchant of [...rules.keys()]) if (matches({ merchant }, url.searchParams)) rules.delete(merchant);
    return json(response, 204);
  }
  if (route === "GET /rest/v1/fin_rules") {
    return json(response, 200, [...rules].map(([merchant, category]) => ({ merchant, category })));
  }
  if (route === "POST /rest/v1/fin_rules") {
    for (const row of data) rules.set(row.merchant, row.category);
    return json(response, 201);
  }
  if (route === "POST /rest/v1/rpc/fin_mark_transfers") {
    return json(response, 200, markTransfers());
  }
  json(response, 404, { message: `stub has no ${route}` });
}).listen(8766);

console.log("app: http://localhost:8765/?api=http://localhost:8766");
