// Turning Enable Banking's transactions into f1nanc3's, and keeping them
// from doubling up with CSV imports. No UI or network code: the server's
// daily fetch (supabase/functions) and the app's CSV import both use it.
import { guessCategory, merchantOf } from "./categories.js";

// "…1234" for an Enable Banking account: the last 4 digits of its
// account number (from an IBAN or a UK sort code and account number),
// the same as CSV imports use, so the two line up.
export function accountLast4(account) {
  const ids = [account?.account_id?.iban, account?.account_id?.other?.identification,
    ...(account?.all_account_ids ?? []).map((id) => id.identification)];
  for (const id of ids) {
    const digits = String(id ?? "").replace(/\D/g, "");
    if (digits.length >= 4) return `…${digits.slice(-4)}`;
  }
  return "bank";
}

// A statement-style description: who it was with, then the bank's notes,
// joined with " , " as RBS's CSV does, so merchantOf reads both alike.
export function describe(tx) {
  const party = tx.credit_debit_indicator === "DBIT" ? tx.creditor?.name : tx.debtor?.name;
  const parts = [party, ...(tx.remittance_information ?? [])]
    .map((part) => String(part ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return [...new Set(parts)].join(" , ") || tx.bank_transaction_code?.description || "bank transaction";
}

// Pounds, negative for money out. The amount's direction comes from
// credit_debit_indicator; the amount itself is treated as unsigned.
export function signedAmount(tx) {
  const amount = Math.abs(Number(tx.transaction_amount?.amount ?? 0));
  return Math.round((tx.credit_debit_indicator === "DBIT" ? -amount : amount) * 100) / 100;
}

async function sha256(text) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// A fin_transactions row for a booked bank transaction, or null for one
// that isn't booked yet (pending ones change, so they wait until they've
// settled) or isn't in pounds. The id comes from the bank's own
// reference, which stays the same every time it's fetched.
export async function bankRow(tx, account, rules = new Map()) {
  if (tx.status && tx.status !== "BOOK") return null;
  if (tx.transaction_amount?.currency && tx.transaction_amount.currency !== "GBP") return null;
  const booked = tx.booking_date ?? tx.value_date ?? tx.transaction_date;
  if (!booked) return null;
  const amount = signedAmount(tx);
  const description = describe(tx);
  const type = tx.bank_transaction_code?.code ?? "";
  const merchant = merchantOf(description, type);
  const { category, source } = guessCategory({ merchant, type, amount }, rules);
  const reference = tx.entry_reference ?? `${booked}|${amount}|${description}`;
  return {
    id: `eb${await sha256(`${account}|${reference}`)}`,
    account,
    booked_on: booked.slice(0, 10),
    amount,
    description,
    merchant,
    type,
    category,
    category_source: source,
    source: "bank",
    balance: tx.balance_after_transaction?.amount != null ? Number(tx.balance_after_transaction.amount) : null,
  };
}

const key = (t) => `${t.account}|${t.booked_on}|${Number(t.amount).toFixed(2)}`;

// The incoming rows that aren't already there from the other source: each
// stored row (same account, date and amount) cancels one incoming row, so
// two identical coffees match two, not one.
export function notAlreadyThere(incoming, stored) {
  const counts = new Map();
  for (const row of stored) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return incoming.filter((row) => {
    const left = counts.get(key(row)) ?? 0;
    if (!left) return true;
    counts.set(key(row), left - 1);
    return false;
  });
}
