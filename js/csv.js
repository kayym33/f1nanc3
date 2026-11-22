// Reading a bank statement CSV into transactions. Written for RBS's
// download (Date, Type, Description, Value, Balance, Account Name,
// Account Number), but finds the columns by name, so other layouts with
// a date, a description and an amount (or paid in / paid out) work too.
// No UI code.
import { merchantOf } from "./categories.js";

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Column names, lowercase, for each field.
const COLUMNS = {
  date: ["date", "transaction date", "posting date", "booking date"],
  type: ["type", "transaction type"],
  description: ["description", "transaction description", "details", "narrative", "memo", "name"],
  amount: ["value", "amount", "amount (gbp)"],
  paidOut: ["paid out", "debit", "debit amount", "money out", "out"],
  paidIn: ["paid in", "credit", "credit amount", "money in", "in"],
  balance: ["balance", "running balance"],
  accountName: ["account name"],
  accountNumber: ["account number", "account"],
};

// Splits CSV text into rows of fields: quoted fields may hold commas,
// doubled quotes and line breaks.
export function parseRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// RBS starts some fields with ' so spreadsheets keep them as text.
const clean = (value) => (value ?? "").replace(/^﻿/, "").trim().replace(/^'+/, "").trim();

// "01 Nov 2025", "1-Nov-25", "01/11/2025", "01/11/25" or "2025-11-01" -> "2025-11-01".
export function parseDate(value) {
  const text = clean(value);
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  let day, month, year;
  match = text.match(/^(\d{1,2})[\s/-]+([a-z]{3})[a-z]*[\s/-]+(\d{2,4})$/i);
  if (match) {
    [day, month, year] = [Number(match[1]), MONTHS[match[2].toLowerCase()], Number(match[3])];
  } else {
    match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (!match) return null;
    // UK order: day first.
    [day, month, year] = match.slice(1).map(Number);
  }
  if (year < 100) year += 2000;
  if (!month || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// "-1,234.50", "£12.00", "(12.00)" or "12.00 DR" -> a number, or null.
export function parseAmount(value) {
  let text = clean(value).replace(/[£,\s]/g, "");
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (/dr$/i.test(text)) {
    negative = true;
    text = text.slice(0, -2);
  } else if (/cr$/i.test(text)) {
    text = text.slice(0, -2);
  }
  if (!/^[-+]?\d+(\.\d+)?$/.test(text)) return null;
  const amount = Math.round(Number(text) * 100) / 100;
  return negative ? -Math.abs(amount) : amount;
}

function findColumns(header) {
  const names = header.map((name) => clean(name).toLowerCase());
  const columns = {};
  for (const [field, options] of Object.entries(COLUMNS)) {
    const index = names.findIndex((name) => options.includes(name));
    if (index >= 0) columns[field] = index;
  }
  return columns;
}

const usable = (columns) => "date" in columns && "description" in columns
  && ("amount" in columns || "paidOut" in columns || "paidIn" in columns);

// The account a row is from: the last 4 digits of its number ("…1234"),
// or its name, or "current" when the file doesn't say. Only the last 4
// digits are ever stored.
function accountOf(row, columns) {
  const number = clean(row[columns.accountNumber]).replace(/\D/g, "");
  if (number.length >= 4) return `…${number.slice(-4)}`;
  const name = clean(row[columns.accountName]).toLowerCase();
  return name || "current";
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// Reads a statement. Returns {transactions, skipped, error}: transactions
// have {id, account, booked_on, amount, description, merchant, type,
// balance}; skipped counts lines that weren't transactions (blank lines,
// totals). The id is a hash of the transaction's details, so the same
// statement read twice gives the same ids; two identical payments on the
// same day are told apart by their order in the file.
export async function readStatement(text) {
  const rows = parseRows(text);
  const headerIndex = rows.slice(0, 15).findIndex((row) => usable(findColumns(row)));
  if (headerIndex < 0) {
    return { transactions: [], skipped: 0, error: "couldn't find the date, description and amount columns" };
  }
  const columns = findColumns(rows[headerIndex]);
  const transactions = [];
  const seen = new Map();
  let skipped = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    if (row.every((field) => !clean(field))) continue;
    const date = parseDate(row[columns.date]);
    let amount = "amount" in columns ? parseAmount(row[columns.amount]) : null;
    if (amount === null && ("paidOut" in columns || "paidIn" in columns)) {
      const out = parseAmount(row[columns.paidOut]);
      const into = parseAmount(row[columns.paidIn]);
      if (out !== null || into !== null) amount = (into ?? 0) - Math.abs(out ?? 0);
    }
    const description = clean(row[columns.description]).replace(/\s+/g, " ");
    if (!date || amount === null || !description) {
      skipped++;
      continue;
    }
    const account = accountOf(row, columns);
    const key = `${account}|${date}|${amount.toFixed(2)}|${description}`;
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    transactions.push({
      id: await sha256(`${key}|${occurrence}`),
      account,
      booked_on: date,
      amount,
      description,
      merchant: merchantOf(description, clean(row[columns.type])),
      type: clean(row[columns.type]),
      balance: "balance" in columns ? parseAmount(row[columns.balance]) : null,
    });
  }
  return { transactions, skipped, error: null };
}
