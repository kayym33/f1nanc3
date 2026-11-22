// The signed-in user's transactions and category rules, loaded from
// Supabase and kept in memory while the app is open. Nothing is stored on
// the device itself: bank data stays on the server, behind the sign-in.
import { notAlreadyThere } from "./bank.js";
import { AuthError } from "./cloud.js";
import { guessCategory, merchantOf } from "./categories.js";
import { windowStart } from "./money.js";

export class Finance {
  constructor(cloud) {
    this.cloud = cloud;
    this.transactions = [];
    this.rules = new Map();
    // The latest bank connection (fin_bank_links), or null.
    this.link = null;
    // Your choices about monthly payments: merchant -> {kind, url, hidden}.
    this.subscriptionSettings = new Map();
    // Your names for accounts: "…5231" -> {name, kind: spending|savings}.
    this.accounts = new Map();
    // idle, loading, ready or error.
    this.state = "idle";
    this.error = null;
    this.listeners = [];
  }

  changed() {
    for (const listener of this.listeners) listener();
  }

  async load() {
    this.state = "loading";
    this.error = null;
    this.changed();
    try {
      const [transactions, rules] = await Promise.all([
        this.fetchTransactions(),
        this.cloud.selectAll("fin_rules", { select: "merchant,category" }),
        this.loadLink(),
        this.loadSubscriptionSettings(),
        this.loadAccounts(),
      ]);
      this.transactions = transactions;
      this.rules = new Map(rules.map((rule) => [rule.merchant, rule.category]));
      // Anything stored by an older version is brought up to date, then
      // read again (pairing transfers changes categories on the server).
      if (await this.reread()) this.transactions = await this.fetchTransactions();
      this.state = "ready";
    } catch (error) {
      // A sign-in the server no longer accepts: back to signing in.
      if (error instanceof AuthError) this.cloud.forget();
      this.state = "error";
      this.error = error.message ?? String(error);
    }
    this.changed();
  }

  // The latest bank connection that isn't disconnected. Its table may not
  // exist yet on an older server; then there's simply no connection.
  async loadLink() {
    try {
      const rows = await this.cloud.selectAll("fin_bank_links", {
        select: "id,bank,status,valid_until,accounts,last_synced_at,last_error,created_at",
        status: "in.(active,expired)",
        order: "created_at.desc",
      });
      this.link = rows[0] ?? null;
    } catch {
      this.link = null;
    }
  }

  async loadAccounts() {
    try {
      const rows = await this.cloud.selectAll("fin_accounts", { select: "account,name,kind" });
      this.accounts = new Map(rows.map((row) => [row.account, { name: row.name, kind: row.kind }]));
    } catch {
      this.accounts = new Map();
    }
  }

  // "current" for "…5231" once you've named it; "…5231" until then.
  accountName(account) {
    return this.accounts.get(account)?.name || account;
  }

  accountKind(account) {
    return this.accounts.get(account)?.kind ?? "spending";
  }

  // Every account that has transactions, in the order first seen.
  accountList() {
    return [...new Set(this.transactions.map((t) => t.account))].sort();
  }

  async saveAccount(account, changes) {
    const next = { name: null, kind: "spending", ...this.accounts.get(account), ...changes };
    await this.cloud.upsert("fin_accounts", [{ account, ...next, updated_at: new Date().toISOString() }], "user_id,account");
    this.accounts.set(account, next);
    this.changed();
  }

  // Older servers may not have the table yet; then there are no choices.
  async loadSubscriptionSettings() {
    try {
      const rows = await this.cloud.selectAll("fin_subscriptions", { select: "merchant,kind,url,hidden" });
      this.subscriptionSettings = new Map(rows.map((row) => [row.merchant, { kind: row.kind, url: row.url, hidden: row.hidden }]));
    } catch {
      this.subscriptionSettings = new Map();
    }
  }

  // Changes your choices for one monthly payment: {kind}, {url} or {hidden}.
  async saveSubscription(merchant, changes) {
    const current = this.subscriptionSettings.get(merchant) ?? { kind: null, url: null, hidden: false };
    const next = { ...current, ...changes };
    await this.cloud.upsert("fin_subscriptions", [{ merchant, ...next, updated_at: new Date().toISOString() }], "user_id,merchant");
    this.subscriptionSettings.set(merchant, next);
    this.changed();
  }

  // Asks the server to fetch from the bank now; returns how many were new.
  async syncBank() {
    const { added } = await this.cloud.callFunction("bank", { action: "sync" });
    await this.load();
    return added;
  }

  async fetchTransactions() {
    const rows = await this.cloud.selectAll("fin_transactions", {
      select: "id,account,booked_on,amount,description,merchant,type,category,category_source,source,balance",
      booked_on: `gte.${windowStart()}`,
      order: "booked_on.desc,created_at.desc,id.asc",
    });
    return rows.map((t) => ({ ...t, amount: Number(t.amount) }));
  }

  // Brings stored transactions up to date with how statements are read now
  // (categories.js improves over time: RBS card lines ending "CD" were once
  // read as a merchant called "cd"). A transaction whose merchant now
  // reads differently, or whose guessed category would now be different,
  // is updated. Categories set by hand are kept, and so are transfers the
  // server paired up. Rules saved under a merchant name nothing uses any
  // more are dropped. Returns how many transactions changed.
  async reread() {
    const groups = new Map();
    const oldNames = new Set();
    let changed = 0;
    for (const t of this.transactions) {
      const merchant = merchantOf(t.description, t.type);
      const renamed = merchant !== t.merchant;
      let { category, category_source: source } = t;
      if (source !== "manual" && !(source === "auto" && category === "transfers")) {
        ({ category, source } = guessCategory({ ...t, merchant }, this.rules));
      }
      if (!renamed && category === t.category && source === t.category_source) continue;
      if (renamed) oldNames.add(t.merchant);
      const key = JSON.stringify([merchant, category, source]);
      if (!groups.has(key)) groups.set(key, { change: { merchant, category, category_source: source }, list: [] });
      groups.get(key).list.push(t);
      changed++;
    }
    if (!changed) return 0;
    for (const { change, list } of groups.values()) {
      for (let start = 0; start < list.length; start += 100) {
        const ids = list.slice(start, start + 100).map((t) => t.id);
        await this.cloud.update("fin_transactions", { id: `in.(${ids.join(",")})` }, change);
      }
      for (const t of list) Object.assign(t, change);
    }
    const inUse = new Set(this.transactions.map((t) => t.merchant));
    for (const name of oldNames) {
      if (this.rules.has(name) && !inUse.has(name)) {
        await this.cloud.remove("fin_rules", { merchant: `eq.${name}` });
        this.rules.delete(name);
      }
    }
    await this.cloud.rpc("fin_mark_transfers");
    return changed;
  }

  clear() {
    this.subscriptionSettings = new Map();
    this.accounts = new Map();
    this.transactions = [];
    this.rules = new Map();
    this.state = "idle";
    this.changed();
  }

  byId(id) {
    return this.transactions.find((t) => t.id === id) ?? null;
  }

  // Months with transactions, newest first ("2026-11").
  months() {
    return [...new Set(this.transactions.map((t) => t.booked_on.slice(0, 7)))].sort().reverse();
  }

  // Adds a read statement's transactions (js/csv.js). Ones from before
  // the 13-month window are left out, and ones already stored are left
  // as they are. Returns {added, already, tooOld}.
  async importStatement(transactions) {
    const start = windowStart();
    // Ones the bank connection already brought in (same account, date and
    // amount) are left out, so connecting and importing don't double up.
    const recent = notAlreadyThere(
      transactions.filter((t) => t.booked_on >= start),
      this.transactions.filter((t) => t.source === "bank"),
    );
    const rows = recent.map((t) => {
      const { category, source } = guessCategory(t, this.rules);
      return { ...t, category, category_source: source, source: "csv" };
    });
    const added = await this.cloud.insertNew("fin_transactions", rows, "user_id,id");
    if (added) await this.cloud.rpc("fin_mark_transfers");
    await this.load();
    const tooOld = transactions.filter((t) => t.booked_on < start).length;
    return { added, already: transactions.length - tooOld - added, tooOld };
  }

  // Puts one transaction in a category. With `remember`, every payment to
  // the same merchant goes there too, now and in future, except ones set
  // by hand on their own.
  async setCategory(id, category, remember) {
    const transaction = this.byId(id);
    if (!transaction) return;
    if (remember) {
      await this.cloud.upsert("fin_rules", [{ merchant: transaction.merchant, category, updated_at: new Date().toISOString() }], "user_id,merchant");
      await this.cloud.update(
        "fin_transactions",
        { merchant: `eq.${transaction.merchant}`, category_source: "neq.manual" },
        { category, category_source: "rule" },
      );
      this.rules.set(transaction.merchant, category);
      for (const other of this.transactions) {
        if (other.merchant === transaction.merchant && other.category_source !== "manual") {
          other.category = category;
          other.category_source = "rule";
        }
      }
    }
    await this.cloud.update("fin_transactions", { id: `eq.${id}` }, { category, category_source: remember ? "rule" : "manual" });
    transaction.category = category;
    transaction.category_source = remember ? "rule" : "manual";
    this.changed();
  }
}
