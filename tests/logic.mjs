// Checks for the parts with no UI: reading statements, merchants,
// category guesses and the 13-month window. Run with: node tests/logic.mjs
import assert from "node:assert/strict";
import { guessCategory, merchantOf } from "../js/categories.js";
import { parseAmount, parseDate, parseRows, readStatement } from "../js/csv.js";
import { allocateRows, bandTop, riverBands, riverLayout } from "../js/flow.js";
import { addMonths, pounds, sum, windowMonths, windowStart } from "../js/money.js";
import { monthSummary } from "../js/summary.js";
import { longestWithout, regularPayments, yearStats } from "../js/wrapped.js";

let failures = 0;
async function check(name, test) {
  try {
    await test();
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}\n  ${error.message.split("\n").join("\n  ")}`);
  }
}

await check("csv rows with quotes, commas and CRLF", () => {
  assert.deepEqual(parseRows('a,"b, c","say ""hi"""\r\n1,2,3\r\n'), [["a", "b, c", 'say "hi"'], ["1", "2", "3"]]);
});

await check("dates in the formats banks use", () => {
  assert.equal(parseDate("01 Nov 2025"), "2025-11-01");
  assert.equal(parseDate("1-Nov-25"), "2025-11-01");
  assert.equal(parseDate("21/11/2026"), "2026-11-21");
  assert.equal(parseDate("21/11/26"), "2026-11-21");
  assert.equal(parseDate("2026-11-21"), "2026-11-21");
  assert.equal(parseDate("31/02/2026"), null);
  assert.equal(parseDate("Date"), null);
});

await check("amounts", () => {
  assert.equal(parseAmount("-1,234.50"), -1234.5);
  assert.equal(parseAmount("£12.00"), 12);
  assert.equal(parseAmount("(12.00)"), -12);
  assert.equal(parseAmount("12.00 DR"), -12);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("abc"), null);
});

const RBS = [
  "",
  "Date, Type, Description, Value, Balance, Account Name, Account Number",
  "",
  `21 Nov 2026,POS,"'4378 20NOV26 , TESCO STORES 3017 , EDINBURGH GB",-12.50,1000.00,"'MX K M","'832000-12345678",`,
  `21 Nov 2026,POS,"'4378 20NOV26 , TESCO STORES 3017 , EDINBURGH GB",-12.50,987.50,"'MX K M","'832000-12345678",`,
  `20 Nov 2026,D/D,"'OCTOPUS ENERGY , 0012345678",-85.00,1012.50,"'MX K M","'832000-12345678",`,
  `19 Nov 2026,BAC,"'EMPLOYER LTD , SALARY , FP 19/11/26 1034 , 600000000123456789",1850.00,1097.50,"'MX K M","'832000-12345678",`,
  `18 Nov 2026,C/L,"'RBS 18NOV ,HIGH ST",-20.00,-752.50,"'MX K M","'832000-12345678",`,
  "",
].join("\r\n");

await check("reads an RBS download", async () => {
  const { transactions, skipped, error } = await readStatement(RBS);
  assert.equal(error, null);
  assert.equal(skipped, 0);
  assert.equal(transactions.length, 5);
  const [first, second, energy, salary, cash] = transactions;
  assert.equal(first.booked_on, "2026-11-21");
  assert.equal(first.amount, -12.5);
  assert.equal(first.account, "…5678");
  assert.equal(first.merchant, "tesco stores");
  assert.equal(first.type, "POS");
  assert.equal(first.balance, 1000);
  // Two identical payments on one day are two transactions.
  assert.notEqual(first.id, second.id);
  assert.equal(energy.merchant, "octopus energy");
  assert.equal(salary.merchant, "employer ltd");
  assert.equal(salary.amount, 1850);
  assert.equal(cash.type, "C/L");
});

await check("the same statement gives the same ids", async () => {
  const once = (await readStatement(RBS)).transactions.map((t) => t.id);
  const again = (await readStatement(RBS)).transactions.map((t) => t.id);
  assert.deepEqual(once, again);
});

await check("paid in / paid out layouts", async () => {
  const text = "Date,Description,Paid out,Paid in\n01/11/2026,Coffee,3.20,\n02/11/2026,Refund,,5.00\n";
  const { transactions } = await readStatement(text);
  assert.deepEqual(transactions.map((t) => t.amount), [-3.2, 5]);
  assert.equal(transactions[0].account, "current");
});

await check("a file that isn't a statement", async () => {
  const { transactions, error } = await readStatement("hello,world\n1,2\n");
  assert.equal(transactions.length, 0);
  assert.ok(error);
});

await check("merchants", () => {
  assert.equal(merchantOf("'4378 20NOV26 , TESCO STORES 3017 , EDINBURGH GB"), "tesco stores");
  assert.equal(merchantOf("PAYPAL *NETFLIX.COM , 35314369001"), "paypal netflix.com");
  assert.equal(merchantOf("AMAZON* AB12CD34E"), "amazon");
  assert.equal(merchantOf("O2 MOBILE , 1234567"), "o2 mobile");
  assert.equal(merchantOf("JET2.COM , LEEDS GB"), "jet2.com");
});

await check("category guesses", () => {
  const guess = (merchant, amount = -10, type = "") => guessCategory({ merchant, amount, type }).category;
  assert.equal(guess("tesco stores"), "groceries");
  assert.equal(guess("sainsburys s/mkts"), "groceries");
  assert.equal(guess("octopus energy"), "bills");
  assert.equal(guess("o2 mobile"), "bills");
  assert.equal(guess("uber eats"), "eating out");
  assert.equal(guess("uber trip"), "transport");
  assert.equal(guess("barclays"), "other");
  assert.equal(guess("paypal netflix.com"), "entertainment");
  assert.equal(guessCategory({ merchant: "rbs", amount: -20, type: "C/L" }).category, "cash");
  assert.equal(guess("employer ltd", 1850), "income");
  const rules = new Map([["tesco stores", "shopping"]]);
  assert.deepEqual(guessCategory({ merchant: "tesco stores", amount: -5 }, rules), { category: "shopping", source: "rule" });
});

await check("the 13-month window", () => {
  const today = new Date(2026, 10, 22);
  assert.equal(windowStart(today), "2025-11-01");
  assert.equal(windowStart(new Date(2026, 11, 1)), "2025-12-01");
  const months = windowMonths(today);
  assert.equal(months.length, 13);
  assert.equal(months[0], "2026-11");
  assert.equal(months.at(-1), "2025-11");
  assert.equal(addMonths("2026-01", -1), "2025-12");
});

await check("money", () => {
  assert.equal(sum([0.1, 0.2]), 0.3);
  assert.equal(pounds(1234.5), "£1,234.50");
  assert.equal(pounds(-12.5, { sign: true }), "-£12.50");
  assert.equal(pounds(5, { sign: true }), "+£5.00");
});

await check("month summary leaves transfers out", () => {
  const t = (booked_on, amount, category) => ({ booked_on, amount, category });
  const summary = monthSummary([
    t("2026-11-01", 1000, "income"), t("2026-11-02", -40, "groceries"), t("2026-11-03", 5, "groceries"),
    t("2026-11-04", -300, "transfers"), t("2026-11-05", -20, "bills"), t("2026-10-30", -99, "bills"),
  ], "2026-11");
  assert.equal(summary.income, 1000);
  assert.equal(summary.spending, 55);
  assert.equal(summary.net, 945);
  assert.deepEqual(summary.categories.map((row) => [row.category, row.total]), [["groceries", 35], ["bills", 20]]);
});

await check("rows are shared out in proportion, at least 1 each", () => {
  assert.deepEqual(allocateRows([50, 30, 20], 10), [5, 3, 2]);
  const tiny = allocateRows([1000, 1, 1], 10);
  assert.equal(tiny.reduce((a, b) => a + b, 0), 10);
  assert.ok(tiny.every((rows) => rows >= 1));
  assert.deepEqual(allocateRows([5, 5], 1), [1, 1]);
});

await check("the river's two sides add up", () => {
  const under = riverBands({ income: 1000, spending: 600, categories: [{ category: "bills", total: 400, count: 2 }, { category: "groceries", total: 200, count: 9 }] });
  assert.deepEqual(under.sources.map((b) => b.key), ["in"]);
  // The same order every month (groceries before bills), the biggest marked.
  assert.deepEqual(under.sinks.map((b) => [b.key, b.amount, b.kind]), [["groceries", 200, "spend"], ["bills", 400, "top"], ["left", 400, "left"]]);
  const over = riverBands({ income: 100, spending: 250, categories: [{ category: "bills", total: 250, count: 1 }] });
  assert.deepEqual(over.sources.map((b) => [b.key, b.amount]), [["in", 100], ["balance", 150]]);
  assert.deepEqual(over.sinks.map((b) => b.key), ["bills"]);
  const layout = riverLayout(under, 30);
  const total = (bands) => bands.reduce((a, b) => a + b.rows, 0);
  assert.equal(total(layout.sources), layout.trunkRows);
  assert.equal(total(layout.sinks), layout.trunkRows);
  // Stacked without gaps in the trunk, fanned out with gaps at the ends.
  assert.equal(layout.sinks[1].trunk, layout.sinks[0].trunk + layout.sinks[0].rows);
  assert.ok(layout.sinks[1].slot > layout.sinks[0].slot + layout.sinks[0].rows);
  assert.ok(layout.sinks[0].slot >= 1);
  assert.ok(layout.trunkRows < 30 * 0.7);
  // Too little room: still everything at least a row, no gaps.
  const tight = riverLayout(under, 4);
  assert.ok(tight.sinks.every((band) => band.rows >= 1));
  assert.ok(layout.sinks.at(-1).slot + layout.sinks.at(-1).rows <= 30);
  // A sink starts in the trunk and ends at its slot.
  assert.equal(bandTop(layout.sinks[2], "sink", 0), layout.sinks[2].trunk);
  assert.equal(bandTop(layout.sinks[2], "sink", 1), layout.sinks[2].slot);
  assert.equal(riverLayout({ sources: [], sinks: [] }, 30), null);
});

await check("the year in review", () => {
  const t = (booked_on, amount, category, merchant) => ({ booked_on, amount, category, merchant });
  const list = [
    t("2026-08-01", 2000, "income", "employer"), t("2026-09-01", 2000, "income", "employer"), t("2026-10-01", 2000, "income", "employer"),
    t("2026-08-03", -10.99, "entertainment", "netflix"), t("2026-09-03", -10.99, "entertainment", "netflix"), t("2026-10-03", -10.99, "entertainment", "netflix"),
    t("2026-08-04", -40, "groceries", "tesco"), t("2026-08-11", -20, "groceries", "tesco"), t("2026-09-05", -30, "groceries", "tesco"),
    t("2026-08-06", -500, "shopping", "argos"),
    t("2026-08-08", -25, "eating out", "deliveroo"), t("2026-10-20", -35, "eating out", "deliveroo"),
    t("2026-09-10", -300, "transfers", "to savings"),
  ];
  const stats = yearStats(list, new Date(2026, 9, 31));
  assert.equal(stats.from, "2026-08-01");
  assert.equal(stats.income, 6000);
  assert.equal(stats.out, 682.97);
  assert.equal(stats.left, 5317.03);
  assert.equal(stats.topMerchant.merchant, "tesco");
  assert.equal(stats.topMerchant.visits, 3);
  assert.equal(stats.biggest.merchant, "argos");
  assert.equal(stats.byCategory[0].category, "shopping");
  assert.equal(stats.peak.month, "2026-08");
  // The first and current months are partial, so only September can be the quietest.
  assert.equal(stats.quietest.month, "2026-09");
  assert.equal(stats.streak.days, 72);
  assert.equal(stats.streak.from, "2026-08-09");
  assert.equal(stats.streak.to, "2026-10-19");
  // Eating out (£60) in average Tesco shops (£30).
  assert.equal(stats.eatingOutInShops, 2);
  assert.deepEqual(stats.regular.map((r) => r.merchant), ["netflix"]);
  assert.equal(stats.weekdays.length, 7);
  // Under four weeks of data: nothing to say.
  assert.equal(yearStats([t("2026-10-20", -5, "other", "x")], new Date(2026, 9, 31)), null);
});

await check("longest gap and regular payments", () => {
  const t = (booked_on, category = "eating out") => ({ booked_on, category });
  assert.deepEqual(longestWithout([t("2026-01-05"), t("2026-01-07")], "eating out", "2026-01-01", "2026-01-10"),
    { days: 4, from: "2026-01-01", to: "2026-01-04" });
  assert.equal(longestWithout([t("2026-01-05", "bills")], "eating out", "2026-01-01", "2026-01-10"), null);
  const pay = (booked_on, amount, merchant) => ({ booked_on, amount, merchant });
  const regular = regularPayments([
    pay("2026-01-01", -85, "octopus"), pay("2026-02-01", -90, "octopus"), pay("2026-03-01", -86, "octopus"),
    // A shop visited all the time isn't a regular payment.
    ...Array.from({ length: 12 }, (_, i) => pay(`2026-0${1 + (i % 3)}-1${i % 9}`, -30, "tesco")),
    // Nor is one whose amount jumps about.
    pay("2026-01-02", -5, "amazon"), pay("2026-02-02", -60, "amazon"), pay("2026-03-02", -12, "amazon"),
  ]);
  assert.deepEqual(regular.map((r) => r.merchant), ["octopus"]);
  assert.equal(regular[0].typical, 86);
});

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log("all passed");
