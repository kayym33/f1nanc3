// Money you've moved between your own accounts and added by hand, before
// a statement shows it. No UI code.
//
// A move is two rows, out of one account and into the other, both
// transfers (so neither counts as spending or income), each carrying the
// balance it leaves so the overview and the savings goal update at once.
// When a statement arrives with the bank's own record of it (the same
// account and amount within a few days), the hand-added rows give way.
import { merchantOf } from "./categories.js";

// How many days apart the bank's record and yours can be and still match.
const MATCH_DAYS = 4;

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// The two rows for moving `amount` from one account to another on `date`
// ("2026-11-22"). `balances` maps account -> its latest balance, or is
// missing for one with none. `names` maps account -> the name to show.
export function moveRows({ from, to, amount, date, balances = new Map(), names = new Map() }) {
  const pair = randomId();
  const pounds = Math.round(Number(amount) * 100) / 100;
  const leg = (account, signed, description, suffix) => ({
    id: `mn${pair}${suffix}`,
    account,
    booked_on: date,
    amount: signed,
    description,
    merchant: merchantOf(description, "TFR"),
    type: "TFR",
    category: "transfers",
    category_source: "manual",
    source: "manual",
    balance: balances.has(account) ? Math.round((balances.get(account) + signed) * 100) / 100 : null,
  });
  return [
    leg(from, -pounds, `Moved to ${names.get(to) ?? to} (added by hand)`, "o"),
    leg(to, pounds, `Moved from ${names.get(from) ?? from} (added by hand)`, "i"),
  ];
}

// The other half of a hand-added move: "mn…o" <-> "mn…i".
export function partnerId(id) {
  if (!id.startsWith("mn")) return null;
  return id.endsWith("o") ? `${id.slice(0, -1)}i` : `${id.slice(0, -1)}o`;
}

const daysApart = (a, b) => Math.abs(Date.parse(`${a}T12:00:00`) - Date.parse(`${b}T12:00:00`)) / 86400000;

// The hand-added rows that a statement's rows now cover: the same account
// and amount within a few days. Each statement row covers at most one.
// Returns their ids.
export function coveredByStatement(incoming, manual) {
  const left = [...manual];
  const covered = [];
  for (const row of incoming) {
    const index = left.findIndex((m) => m.account === row.account && Math.abs(Number(m.amount) - Number(row.amount)) < 0.005
      && daysApart(m.booked_on, row.booked_on) <= MATCH_DAYS);
    if (index >= 0) covered.push(left.splice(index, 1)[0].id);
  }
  return covered;
}
