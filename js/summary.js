// A month's totals. No UI code.
import { CATEGORIES, NOT_SPENDING } from "./categories.js";
import { sum } from "./money.js";

// {income, spending, net, categories: [{category, total, count}]} for the
// transactions in `month` ("2026-11"). Spending is a positive number; a
// category's total is what went out less refunds into it. Transfers
// count for nothing.
export function monthSummary(transactions, month) {
  const inMonth = transactions.filter((t) => t.booked_on.startsWith(month) && t.category !== "transfers");
  const income = sum(inMonth.filter((t) => t.category === "income").map((t) => t.amount));
  const spent = inMonth.filter((t) => !NOT_SPENDING.has(t.category));
  const spending = -sum(spent.map((t) => t.amount));
  const categories = CATEGORIES.filter((category) => !NOT_SPENDING.has(category))
    .map((category) => {
      const own = spent.filter((t) => t.category === category);
      return { category, total: -sum(own.map((t) => t.amount)), count: own.length };
    })
    .filter((row) => row.count)
    .sort((a, b) => b.total - a.total);
  return { income, spending, net: sum([income, -spending]), categories };
}
