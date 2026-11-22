// Each account's latest balance, from the balance the bank prints after
// every transaction. No UI code.

// [{account, balance, date}] for every account with balances, as of its
// latest transaction. Several transactions can share a date and the order
// they're stored in isn't reliable, so the day's last one is found by
// following the chain: it's the one whose balance no other transaction
// that day started from.
export function latestBalances(transactions) {
  const byAccount = new Map();
  for (const t of transactions) {
    if (t.balance === null || t.balance === undefined) continue;
    const latest = byAccount.get(t.account);
    if (!latest || t.booked_on > latest.date) byAccount.set(t.account, { date: t.booked_on, rows: [t] });
    else if (t.booked_on === latest.date) latest.rows.push(t);
  }
  const cents = (value) => Math.round(Number(value) * 100);
  return [...byAccount].map(([account, { date, rows }]) => {
    // The balance before each transaction: where its own chain started.
    const starts = new Set(rows.map((t) => cents(t.balance) - cents(t.amount)));
    const last = rows.find((t) => !starts.has(cents(t.balance)) || rows.length === 1) ?? rows[0];
    return { account, balance: cents(last.balance) / 100, date };
  });
}
