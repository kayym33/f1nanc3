// The river's shape: which streams come in, which channels they split
// into, and how many rows of glyphs each one gets. No UI code; the view
// (views/river.js) draws it.
import { CATEGORIES } from "./categories.js";

// {sources, sinks} for a month's summary (summary.js). Sources: money in,
// plus "balance" when more went out than came in. Sinks: each spending
// category, plus "left" when money was left over. Categories keep the
// same order every month (CATEGORIES), so stepping between months shows
// each channel grow or shrink rather than swap places; the biggest is
// marked "top". Each side adds up to the same total.
export function riverBands(summary) {
  const { income, spending } = summary;
  const sources = [];
  if (income > 0) sources.push({ key: "in", label: "in", amount: income, kind: "income" });
  if (spending > income) sources.push({ key: "balance", label: "balance", amount: spending - income, kind: "balance" });
  const spent = summary.categories.filter((row) => row.total > 0);
  const biggest = Math.max(...spent.map((row) => row.total));
  const sinks = spent
    .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category))
    .map((row) => ({
      key: row.category, label: row.category, amount: row.total, count: row.count,
      kind: row.total === biggest ? "top" : "spend",
    }));
  if (income > spending) sinks.push({ key: "left", label: "left over", amount: income - spending, kind: "left" });
  return { sources, sinks };
}

// Splits `total` rows between amounts in proportion, every one getting at
// least 1 (so a £3 category is still visible), adding up exactly.
export function allocateRows(amounts, total) {
  const count = amounts.length;
  if (!count) return [];
  if (total <= count) return amounts.map(() => 1);
  const sum = amounts.reduce((a, b) => a + b, 0) || 1;
  const spare = total - count;
  const exact = amounts.map((amount) => (amount / sum) * spare);
  const rows = exact.map((value) => 1 + Math.floor(value));
  let left = total - rows.reduce((a, b) => a + b, 0);
  // Largest remainders get the rows left over.
  const order = exact.map((value, index) => [value - Math.floor(value), index]).sort((a, b) => b[0] - a[0]);
  for (let i = 0; left > 0; i = (i + 1) % count, left--) rows[order[i][1]]++;
  return rows;
}

// Where every band sits on a grid `rows` high. The streams meet in a
// trunk about half the height, then fan out to their ends with gaps
// between them, so the river visibly forks. Each band gets:
//   rows: its thickness,
//   trunk: its top row in the trunk (bands stacked there with no gaps),
//   slot: its top row at its own end (sources on the left, sinks on the
//     right).
// Returns {sources, sinks, trunkTop, trunkRows}, or null for nothing.
export const TRUNK_SHARE = 0.55;
const MAX_GAP = 4;

export function riverLayout({ sources, sinks }, rows) {
  if (!sources.length || !sinks.length) return null;
  const most = Math.max(sources.length, sinks.length);
  const usable = rows - 2;
  // Room for a gap of at least a row between neighbours, if there's any.
  const trunkRows = Math.max(most, Math.min(usable - (most - 1), Math.round(usable * TRUNK_SHARE)));
  const trunkTop = Math.floor((rows - trunkRows) / 2);
  const place = (bands) => {
    const thickness = allocateRows(bands.map((band) => band.amount), trunkRows);
    const gaps = bands.length - 1;
    const gap = gaps ? Math.max(0, Math.min(MAX_GAP, Math.floor((usable - trunkRows) / gaps))) : 0;
    let trunk = trunkTop;
    let slot = Math.floor((rows - (trunkRows + gap * gaps)) / 2);
    return bands.map((band, index) => {
      const placed = { ...band, rows: thickness[index], trunk, slot };
      trunk += thickness[index];
      slot += thickness[index] + gap;
      return placed;
    });
  };
  return { sources: place(sources), sinks: place(sinks), trunkTop, trunkRows };
}

// 0 to 1 and back, eased at both ends, for the channels' curves.
export function smooth(value) {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

// A band's top row at horizontal position u (0 at the river's left edge,
// 1 at its right). Sources run from their slot (u < 0.06) to the trunk
// (u = 0.4); sinks from the trunk (u = 0.45) to their slot (u > 0.86).
export function bandTop(band, side, u) {
  if (side === "source") return band.slot + (band.trunk - band.slot) * smooth((u - 0.06) / 0.34);
  return band.trunk + (band.slot - band.trunk) * smooth((u - 0.45) / 0.41);
}

// Sources are drawn left of the middle, sinks right of it.
export const SPLIT = 0.42;
