// The signed-in user's transactions and category rules, loaded from
// Supabase and kept in memory while the app is open. Nothing is stored on
// the device itself: bank data stays on the server, behind the sign-in.
import { guessCategory } from "./categories.js";
import { windowStart } from "./money.js";

export class Finance {
  constructor(cloud) {
    this.cloud = cloud;
    this.transactions = [];
    this.rules = new Map();
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
        this.cloud.selectAll("fin_transactions", {
          select: "id,account,booked_on,amount,description,merchant,type,category,category_source,source,balance",
          booked_on: `gte.${windowStart()}`,
          order: "booked_on.desc,created_at.desc,id.asc",
        }),
        this.cloud.selectAll("fin_rules", { select: "merchant,category" }),
      ]);
      this.transactions = transactions.map((t) => ({ ...t, amount: Number(t.amount) }));
      this.rules = new Map(rules.map((rule) => [rule.merchant, rule.category]));
      this.state = "ready";
    } catch (error) {
      this.state = "error";
      this.error = error.message ?? String(error);
    }
    this.changed();
  }

  clear() {
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
    const recent = transactions.filter((t) => t.booked_on >= start);
    const rows = recent.map((t) => {
      const { category, source } = guessCategory(t, this.rules);
      return { ...t, category, category_source: source, source: "csv" };
    });
    const added = await this.cloud.insertNew("fin_transactions", rows, "user_id,id");
    if (added) await this.cloud.rpc("fin_mark_transfers");
    await this.load();
    return { added, already: rows.length - added, tooOld: transactions.length - recent.length };
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
