// Checks for the parts with no UI: reading statements, merchants,
// category guesses and the 13-month window. Run with: node tests/logic.mjs
import assert from "node:assert/strict";
import { accountLast4, bankRow, describe, notAlreadyThere, signedAmount } from "../js/bank.js";
import { guessCategory, merchantOf } from "../js/categories.js";
import { knownService } from "../js/services.js";
import { billDays, findSubscriptions, nextMonth, priceChange, projection } from "../js/subscriptions.js";
import { parseAmount, parseDate, parseRows, readStatement } from "../js/csv.js";
import { allocateRows, bandTop, riverBands, riverLayout } from "../js/flow.js";
import { addMonths, pounds, sum, windowMonths, windowStart } from "../js/money.js";
import { monthSummary } from "../js/summary.js";
import { latestBalances } from "../js/balances.js";
import { biggestNonEssentials, budgetsFor, dailyAllowance, fullMonths, monthProgress, outlook, typicalSpending } from "../js/budget.js";
import { expectedIncome, monthlyIncome, regularIncome } from "../js/income.js";
import { categoryGrid, gridCsv, inOut, months as trendMonths, niceCeiling, pace } from "../js/trends.js";
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
  // RBS card payments can have C, D or CD after the date.
  assert.equal(merchantOf("4378 20NOV26 CD , MCDONALDS 1234 , EDINBURGH GB"), "mcdonalds");
  assert.equal(merchantOf("4378 20NOV26 C , GREGGS 1234 , EDINBURGH GB"), "greggs");
  assert.equal(merchantOf("4378 20NOV26 D , TRAINLINE , LONDON GB"), "trainline");
  // Online payments are told apart by the account they went to or came from.
  assert.equal(merchantOf("To A/C 12345678 , SOME NAME , Via Mobile Xfer", "DPC"), "to a/c …5678");
  assert.equal(merchantOf("From A/C 87654321 , REF1 , Via Mobile Xfer", "DPC"), "from a/c …4321");
  assert.equal(merchantOf("30NOV GRS 12345678", "INT"), "interest");
  assert.equal(merchantOf("ROUND UP FROM 12345678", "TFR"), "round up from");
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
  assert.equal(guess("round up to", -0.4, "TFR"), "transfers");
  assert.equal(guess("round up from", 0.4, "TFR"), "transfers");
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

await check("bank transactions", async () => {
  const card = {
    entry_reference: "ref-1", status: "BOOK", credit_debit_indicator: "DBIT", booking_date: "2026-11-20",
    transaction_amount: { amount: "4.50", currency: "GBP" }, creditor: { name: "MCDONALDS 123" },
    remittance_information: ["MCDONALDS 123", "EDINBURGH GB"],
  };
  assert.equal(signedAmount(card), -4.5);
  assert.equal(signedAmount({ ...card, credit_debit_indicator: "CRDT" }), 4.5);
  // Some banks send a sign anyway; direction still comes from the indicator.
  assert.equal(signedAmount({ ...card, transaction_amount: { amount: "-4.50" } }), -4.5);
  assert.equal(describe(card), "MCDONALDS 123 , EDINBURGH GB");
  const row = await bankRow(card, "…5231");
  assert.equal(row.amount, -4.5);
  assert.equal(row.merchant, "mcdonalds");
  assert.equal(row.category, "eating out");
  assert.equal(row.source, "bank");
  assert.equal(row.booked_on, "2026-11-20");
  // The same bank reference always gives the same id.
  assert.equal((await bankRow(card, "…5231")).id, row.id);
  assert.notEqual((await bankRow(card, "…9999")).id, row.id);
  assert.equal(await bankRow({ ...card, status: "PDNG" }, "…5231"), null);
  assert.equal(await bankRow({ ...card, transaction_amount: { amount: "4.50", currency: "EUR" } }, "…5231"), null);
  assert.equal(accountLast4({ account_id: { iban: "GB33NWBK83200012345231" } }), "…5231");
  assert.equal(accountLast4({ account_id: { other: { identification: "83200012345231", scheme_name: "BBAN" } } }), "…5231");
  assert.equal(accountLast4({ all_account_ids: [{ identification: "832000-12345231" }] }), "…5231");
});

await check("bank and CSV transactions don't double up", () => {
  const row = (booked_on, amount, account = "…5231") => ({ account, booked_on, amount });
  const stored = [row("2026-11-20", -1.67), row("2026-11-20", -1.67), row("2026-11-21", -30)];
  const incoming = [row("2026-11-20", -1.67), row("2026-11-20", -1.67), row("2026-11-20", -1.67), row("2026-11-21", -30), row("2026-11-21", -30, "…9999")];
  // Two coffees were already there, a third is new; the other account's £30 is new.
  assert.deepEqual(notAlreadyThere(incoming, stored), [row("2026-11-20", -1.67), row("2026-11-21", -30, "…9999")]);
});

await check("known services", () => {
  assert.equal(knownService("netflix.com")?.name, "Netflix");
  assert.equal(knownService("paypal netflix.com")?.name, "Netflix");
  assert.equal(knownService("claude.ai subscription")?.name, "Claude");
  assert.equal(knownService("apple.com bill")?.name, "Apple");
  assert.equal(knownService("octopus energy")?.kind, "bill");
  assert.equal(knownService("ee limited")?.name, "EE");
  // Whole words only for short names.
  assert.equal(knownService("seeds of change"), null);
  assert.equal(knownService("btec centre"), null);
  assert.equal(knownService("tesco stores"), null);
});

await check("finding subscriptions", () => {
  const pay = (merchant, booked_on, amount, category = "entertainment") => ({ merchant, booked_on, amount, category });
  const list = [
    // Netflix every month, with a price rise in September.
    ...["2026-06-03", "2026-07-03", "2026-08-03"].map((d) => pay("netflix.com", d, -10.99)),
    ...["2026-09-03", "2026-10-03", "2026-11-03"].map((d) => pay("netflix.com", d, -12.99)),
    // Energy varies a bit; it's a bill.
    pay("octopus energy", "2026-08-15", -80, "bills"), pay("octopus energy", "2026-09-15", -92, "bills"), pay("octopus energy", "2026-10-15", -85, "bills"), pay("octopus energy", "2026-11-15", -85, "bills"),
    // Rent to a person: unknown, so you decide; monthly.
    pay("to a/c …1234", "2026-09-01", -600, "other"), pay("to a/c …1234", "2026-10-01", -600, "other"), pay("to a/c …1234", "2026-11-01", -600, "other"),
    // Weekly shopping isn't a subscription.
    ...Array.from({ length: 16 }, (_, i) => pay("tesco stores", `2026-${String(8 + Math.floor(i / 4)).padStart(2, "0")}-${String(1 + (i % 4) * 7).padStart(2, "0")}`, -30, "groceries")),
    // A gym that stopped in August.
    pay("puregym", "2026-05-02", -24.99), pay("puregym", "2026-06-02", -24.99), pay("puregym", "2026-07-02", -24.99), pay("puregym", "2026-08-02", -24.99),
    // Monthly but wildly different amounts: not one thing.
    pay("amazon", "2026-08-05", -5), pay("amazon", "2026-09-05", -60), pay("amazon", "2026-10-05", -12),
    // Transfers never count.
    ...["2026-08-26", "2026-09-26", "2026-10-26"].map((d) => pay("to savings", d, -300, "transfers")),
  ];
  const settings = new Map([["to a/c …1234", { kind: "bill", url: "https://landlord.example" }]]);
  const found = findSubscriptions(list, settings, new Date(2026, 10, 22));
  const by = Object.fromEntries(found.map((s) => [s.merchant, s]));
  assert.deepEqual(Object.keys(by).sort(), ["netflix.com", "octopus energy", "puregym", "to a/c …1234"]);
  assert.equal(by["netflix.com"].name, "Netflix");
  assert.equal(by["netflix.com"].kind, "subscription");
  assert.equal(by["netflix.com"].monthly, 12.99);
  assert.equal(by["netflix.com"].yearly, 155.88);
  assert.equal(by["netflix.com"].next, "2026-12-03");
  assert.deepEqual(by["netflix.com"].change, { from: 10.99, to: 12.99, on: "2026-09-03" });
  assert.equal(by["octopus energy"].kind, "bill");
  assert.equal(by["to a/c …1234"].kind, "bill");
  assert.equal(by["to a/c …1234"].url, "https://landlord.example");
  assert.equal(by["to a/c …1234"].linkKnown, false);
  assert.equal(by.puregym.ended, true);
  assert.equal(by["netflix.com"].ended, false);
  // Most expensive first.
  assert.equal(found[0].merchant, "to a/c …1234");
  // Cancelled: ended straight away, unless it charges you again.
  const cancelled = findSubscriptions(list, new Map([["netflix.com", { cancelled_on: "2026-11-10" }]]), new Date(2026, 10, 22));
  const netflix = cancelled.find((s) => s.merchant === "netflix.com");
  assert.equal(netflix.ended, true);
  assert.equal(netflix.cancelled, "2026-11-10");
  assert.equal(netflix.chargedAfterCancel, false);
  const again = findSubscriptions(list, new Map([["netflix.com", { cancelled_on: "2026-11-01" }]]), new Date(2026, 10, 22));
  assert.equal(again.find((s) => s.merchant === "netflix.com").chargedAfterCancel, true);
  assert.equal(again.find((s) => s.merchant === "netflix.com").ended, false);
  assert.equal(nextMonth("2026-01-31"), "2026-02-28");
  assert.equal(nextMonth("2026-12-15"), "2027-01-15");
  assert.equal(priceChange([pay("x", "2026-01-01", -5), pay("x", "2026-02-01", -5)]), null);
});

await check("the charts' numbers", () => {
  const t = (booked_on, amount, category) => ({ booked_on, amount, category });
  const list = [
    t("2026-10-01", 2000, "income"), t("2026-10-03", -50, "groceries"), t("2026-10-20", -30, "eating out"),
    t("2026-10-21", -500, "transfers"), t("2026-11-01", 2000, "income"), t("2026-11-02", -40, "groceries"),
    t("2026-11-05", 10, "groceries"), t("2026-11-20", -25, "eating out"),
  ];
  const ms = trendMonths(new Date(2026, 10, 22));
  assert.equal(ms.length, 13);
  assert.equal(ms[0], "2025-11");
  assert.equal(ms.at(-1), "2026-11");
  const io = inOut(list, ["2026-10", "2026-11"]);
  assert.deepEqual(io[0], { month: "2026-10", in: 2000, out: 80, left: 1920 });
  assert.equal(io[1].out, 55);
  const grid = categoryGrid(list, ["2026-10", "2026-11"]);
  assert.deepEqual(grid.rows.map((r) => [r.category, r.values]), [["groceries", [50, 30]], ["eating out", [30, 25]]]);
  assert.deepEqual(grid.totals, [80, 55]);
  assert.equal(grid.total, 135);
  assert.equal(grid.rows[0].average, 40);
  const csv = gridCsv(grid, ["2026-10", "2026-11"]).split("\r\n");
  assert.equal(csv[0], "category,october 2026,november 2026,total");
  assert.equal(csv[1], "groceries,50.00,30.00,80.00");
  assert.equal(csv[3], "total,80.00,55.00,135.00");
  const p = pace(list, new Date(2026, 10, 22));
  assert.equal(p.thisMonth.length, 22);
  assert.equal(p.thisMonth[1], 40);
  assert.equal(p.thisMonth[4], 30);
  assert.equal(p.thisMonth.at(-1), 55);
  assert.equal(p.lastMonth.length, 31);
  assert.equal(p.lastMonth.at(-1), 80);
  assert.equal(niceCeiling(180), 200);
  assert.equal(niceCeiling(1234), 2000);
  assert.equal(niceCeiling(4.2), 5);
});

await check("bill days and the month's projection", () => {
  const sub = (name, last, next, monthly, extra = {}) => ({ name, kind: "bill", last, next, monthly, ended: false, hidden: false, ...extra });
  const marks = billDays([
    sub("energy", "2026-11-05", "2026-12-05", 88),
    sub("rent", "2026-10-28", "2026-11-28", 650),
    sub("sky", "2026-10-30", "2026-11-30", 96.95),
    sub("gym", "2026-08-02", "2026-09-02", 25, { ended: true }),
    sub("hidden", "2026-10-25", "2026-11-25", 9, { hidden: true }),
    sub("late", "2026-10-20", "2026-11-20", 10),
  ], new Date(2026, 10, 22));
  assert.deepEqual(marks.map((m) => [m.name, m.day, m.gone]), [["energy", 5, true], ["late", 20, false], ["rent", 28, false], ["sky", 30, false]]);
  const steps = projection(700, marks, 22, 30);
  // The late one comes out "today"; then rent on the 28th, Sky on the 30th.
  assert.deepEqual(steps, [[22, 700], [22, 700], [22, 710], [28, 710], [28, 1360], [30, 1360], [30, 1456.95], [30, 1456.95]]);
});

await check("pay that's still to come", () => {
  const t = (booked_on, amount, merchant, category = "income") => ({ booked_on, amount, merchant, category });
  const list = [
    t("2026-08-28", 1850, "employer ltd"), t("2026-09-26", 1850, "employer ltd"), t("2026-10-28", 1900, "employer ltd"),
    // Mum's £41 every month on the 3rd: regular income too, already in.
    t("2026-09-03", 41, "from a/c …7777"), t("2026-10-03", 41, "from a/c …7777"), t("2026-11-03", 41, "from a/c …7777"),
    // A one-off refund isn't regular.
    t("2026-11-10", 20, "argos"),
    // Transfers never count.
    t("2026-09-01", 300, "from a/c …1111", "transfers"), t("2026-10-01", 300, "from a/c …1111", "transfers"), t("2026-11-01", 300, "from a/c …1111", "transfers"),
  ];
  assert.deepEqual(regularIncome(list).map((s) => s.name), ["Employer Ltd", "From A/c …7777"]);
  // The typical recent amount: the middle of the last three (1850, 1850, 1900).
  assert.deepEqual(expectedIncome(list, new Date(2026, 10, 22)), [{ name: "Employer Ltd", amount: 1850, day: 28 }]);
  // Once it's in, nothing's expected.
  assert.deepEqual(expectedIncome([...list, t("2026-11-27", 1900, "employer ltd")], new Date(2026, 10, 28)), []);
  // Late: due the 28th but it's the 30th and nothing yet: due "today".
  assert.deepEqual(expectedIncome(list, new Date(2026, 10, 30)), [{ name: "Employer Ltd", amount: 1850, day: 30 }]);
});

await check("all the money you can count on", () => {
  const t = (booked_on, amount, merchant) => ({ booked_on, amount, merchant, category: "income" });
  const list = [];
  for (let m = 1; m <= 12; m++) {
    const month = `2026-${String(m).padStart(2, "0")}`;
    list.push(t(`${month}-26`, 2400 + (m % 3) * 50, "employer"));
    // The side income misses two months a year.
    if (m !== 6 && m !== 12) list.push(t(`${month}-07`, 700, "saas co"));
  }
  const income = monthlyIncome(list, new Date(2027, 0, 15));
  assert.equal(income.main, 2450);
  const saas = income.sources.find((s) => s.merchant === "saas co");
  assert.equal(saas.months, 10);
  assert.equal(saas.outOf, 12);
  assert.equal(saas.monthly, 583.33);
  assert.equal(income.total, 3033.33);
});

await check("latest balances", () => {
  const t = (account, booked_on, amount, balance) => ({ account, booked_on, amount, balance });
  // Stored out of order on the last day; the chain says 470 is last.
  const balances = latestBalances([
    t("…5231", "2026-11-19", -10, 520), t("…5231", "2026-11-20", -20, 470), t("…5231", "2026-11-20", -30, 490),
    t("…9999", "2026-11-18", 300, 3500), t("…0000", "2026-11-18", -5, null),
  ]);
  assert.deepEqual(balances, [{ account: "…5231", balance: 470, date: "2026-11-20" }, { account: "…9999", balance: 3500, date: "2026-11-18" }]);
});

await check("the budget", () => {
  const t = (booked_on, amount, category, merchant = category) => ({ booked_on, amount, category, merchant });
  const today = new Date(2026, 10, 22);
  assert.deepEqual(fullMonths(today), ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
  const list = [];
  for (const [i, month] of ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"].entries()) {
    list.push(t(`${month}-03`, -200 - i * 10, "groceries", "tesco"));
    list.push(t(`${month}-10`, -100, "eating out", "deliveroo"));
    list.push(t(`${month}-12`, -12.99, "entertainment", "netflix"));
    list.push(t(`${month}-28`, -650, "other", "to a/c …5555"));
  }
  // One huge month doesn't move the typical one (the middle of six).
  list.push(t("2026-07-20", -900, "eating out", "wedding"));
  const fixed = new Set(["netflix", "to a/c …5555"]);
  const typical = typicalSpending(list, fixed, today);
  assert.equal(typical.groceries, 225);
  assert.equal(typical["eating out"], 100);
  // Subscriptions and rent are fixed, so not in the flexible categories.
  assert.equal(typical.entertainment, 0);
  assert.equal(typical.other, 0);
  const steady = budgetsFor(typical, "steady");
  assert.deepEqual(steady, { groceries: 225, "eating out": 90 });
  const hard = budgetsFor(typical, "hard");
  assert.deepEqual(hard, { groceries: 205, "eating out": 55 });
  // Your own change wins.
  assert.equal(budgetsFor(typical, "hard", { "eating out": 70 })["eating out"], 70);
  const plan = outlook({ pay: 1850, fixed: 662.99, budgets: steady, saved: 1000, goal: 2775 });
  assert.equal(plan.saving, 872.01);
  assert.equal(plan.monthsToGoal, 3);
  assert.equal(outlook({ pay: 900, fixed: 800, budgets: steady, saved: 0, goal: 1000 }).monthsToGoal, null);
  assert.equal(outlook({ pay: 1850, fixed: 0, budgets: {}, saved: 3000, goal: 2775 }).monthsToGoal, 0);
  // This month: 22 days into 30.
  const now = [t("2026-11-04", -150, "groceries", "tesco"), t("2026-11-10", -80, "eating out", "deliveroo"), t("2026-11-12", -12.99, "entertainment", "netflix")];
  const progress = monthProgress(now, steady, fixed, today);
  const eating = progress.find((row) => row.category === "eating out");
  assert.equal(eating.left, 10);
  assert.ok(eating.pace > 1);
  assert.ok(progress.find((row) => row.category === "groceries").pace < 1);
  // £75 + £10 left over 9 days (the 22nd to the 30th).
  assert.equal(dailyAllowance(progress, today), 9.44);
  assert.deepEqual(biggestNonEssentials(list, fixed, today).map((row) => row.merchant), ["wedding", "deliveroo"]);
});

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log("all passed");
