// A year of made-up transactions for the stand-in server, so a local copy
// is ready for screenshots without anyone's real data. Dated back from
// today, in RBS's formats, across three accounts with running balances.
// Nothing here is real: names, amounts and account numbers are invented.
import { guessCategory, merchantOf } from "../js/categories.js";

// The same numbers every time for the same day.
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n) => String(n).padStart(2, "0");
const iso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const card = (date) => `${["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][date.getMonth()]}${String(date.getFullYear()).slice(2)}`;

const ACCOUNTS = { current: "…1111", student: "…2222", savings: "…3333" };
export const ACCOUNT_NAMES = [
  { account: ACCOUNTS.current, name: "current", kind: "spending" },
  { account: ACCOUNTS.student, name: "student", kind: "spending" },
  { account: ACCOUNTS.savings, name: "savings", kind: "savings" },
];

// Everyday card spending: [merchant line, low, high, chance on a day, account].
const EVERYDAY = [
  ["TESCO STORES 3017 , EDINBURGH GB", 6, 48, 0.32, "current"],
  ["SAINSBURYS S/MKTS , EDINBURGH GB", 8, 40, 0.08, "current"],
  ["GREGGS PLC , EDINBURGH GB", 2.1, 6.5, 0.22, "current"],
  ["COSTA COFFEE 41023 , EDINBURGH GB", 3.1, 4.9, 0.12, "student"],
  ["DELIVEROO , LONDON GB", 14, 32, 0.07, "current"],
  ["MCDONALDS 1234 , EDINBURGH GB", 4, 11, 0.07, "student"],
  ["LOTHIAN BUSES , EDINBURGH GB", 2, 2.4, 0.28, "current"],
  ["TRAINLINE , LONDON GB", 12, 46, 0.03, "current"],
  ["AMAZON* MK2ABC , AMAZON.CO.UK GB", 6, 55, 0.07, "current"],
  ["BOOTS 1092 , EDINBURGH GB", 3, 18, 0.04, "current"],
  ["PRIMARK , EDINBURGH GB", 8, 40, 0.025, "student"],
  ["SHELL 2201 , EDINBURGH GB", 35, 62, 0.04, "current"],
  ["ODEON CINEMAS , EDINBURGH GB", 9, 24, 0.02, "student"],
];

// Regular payments: [day, line, amount or [from, to] by month, type, account].
const REGULAR = [
  [2, "CLAUDE.AI SUBSCRIPTION , SAN FRANCISCO US", 18, "POS", "current"],
  [3, "NETFLIX.COM , 0800 123 4567 GB", (m) => (m < 6 ? 10.99 : 12.99), "POS", "current"],
  [5, "E.ON NEXT , 0012345678", (m) => [92, 98, 104, 101, 88, 74, 66, 62, 60, 64, 70, 81, 88][m % 13], "D/D", "current"],
  [9, "SPOTIFY , STOCKHOLM SE", 11.99, "POS", "student"],
  [12, "DISCORD* NITRO , SAN FRANCISCO US", 2.49, "POS", "student"],
  [15, "VWFS UK LIMITED , CAR FINANCE 88812", 189, "D/D", "current"],
  [18, "VIRGIN MEDIA , 7712345", 44.99, "D/D", "current"],
  [24, "HASTINGS DIRECT , 9912345", (m) => (m < 5 ? 75.18 : 65.57), "D/D", "current"],
  [30, "SKY DIGITAL , 6012345", 96.95, "D/D", "current"],
];

export function pretendTransactions(today = new Date()) {
  const rand = random(Number(iso(today).replace(/-/g, "")));
  const between = (low, high) => Math.round((low + rand() * (high - low)) * 100) / 100;
  const start = new Date(today.getFullYear(), today.getMonth() - 12, 1);
  const rows = [];
  const add = (date, account, amount, description, type) => {
    if (date > today || date < start) return;
    rows.push({ date: new Date(date), account: ACCOUNTS[account], amount, description, type });
  };

  for (let month = 0; month <= 12; month++) {
    const first = new Date(start.getFullYear(), start.getMonth() + month, 1);
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const on = (day) => new Date(first.getFullYear(), first.getMonth(), Math.min(day, days));
    // Pay, varying with hours, around the 26th.
    add(on(25 + Math.floor(rand() * 3)), "current", between(2350, 2700), "NORTHLIGHT STUDIOS LTD , SALARY , FP 26/10/26 1034", "BAC");
    // Rent, by bank transfer to the landlord.
    add(on(28), "current", -650, "To A/C 44445555 , J MORRISON RENT , Via Mobile Xfer", "DPC");
    // Bills and subscriptions.
    for (const [day, line, amount, type, account] of REGULAR) {
      const value = typeof amount === "function" ? amount(month) : amount;
      add(on(day), account, -value, type === "POS" ? `4321 ${pad(Math.min(day, days))}${card(first)} CD , ${line}` : line, type);
    }
    // Money to savings after payday, and some back to the student account.
    add(on(27), "current", -300, "To A/C 77773333 , SAVINGS , Via Mobile Xfer", "DPC");
    add(on(27), "savings", 300, "From A/C 66661111 , SAVINGS , Via Mobile Xfer", "DPC");
    add(on(8), "current", -120, "To A/C 88882222 , STUDENT , Via Mobile Xfer", "DPC");
    add(on(8), "student", 120, "From A/C 66661111 , STUDENT , Via Mobile Xfer", "DPC");
    add(on(days), "savings", between(4, 9), `${pad(days)}${card(first).slice(0, 3)} GRS 77773333`, "INT");
    // Everyday spending, and the round-ups it makes.
    for (let day = 1; day <= days; day++) {
      const date = on(day);
      for (const [line, low, high, chance, account] of EVERYDAY) {
        if (rand() >= chance) continue;
        const amount = between(low, high);
        add(date, account, -amount, `4321 ${pad(day)}${card(first)} CD , ${line}`, "POS");
        const up = Math.round((Math.ceil(amount) - amount) * 100) / 100;
        if (account === "current" && up > 0) {
          add(date, "current", -up, "ROUND UP TO 77773333", "TFR");
          add(date, "savings", up, "ROUND UP FROM 66661111", "TFR");
        }
      }
    }
  }

  // Oldest first for the running balances; then newest first, as RBS lists them.
  rows.sort((a, b) => a.date - b.date);
  const balances = { [ACCOUNTS.current]: 820, [ACCOUNTS.student]: 160, [ACCOUNTS.savings]: 2400 };
  const seen = new Map();
  return rows.map((row, index) => {
    balances[row.account] = Math.round((balances[row.account] + row.amount) * 100) / 100;
    const booked_on = iso(row.date);
    const key = `${row.account}|${booked_on}|${row.amount}|${row.description}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    const merchant = merchantOf(row.description, row.type);
    const { category, source } = guessCategory({ merchant, type: row.type, amount: row.amount });
    return {
      id: `pretend${index}`, account: row.account, booked_on, amount: row.amount, description: row.description,
      merchant, type: row.type, category, category_source: source, source: "csv",
      balance: balances[row.account], created_at: index,
    };
  }).reverse();
}
