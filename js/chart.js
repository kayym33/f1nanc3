// A small column chart in block glyphs, like wrapped's: one column per
// value, the highlighted one in the accent, a letter under each.
import { esc } from "./ui.js";

export function columnsChart(values, labels, highlight = -1, height = 5) {
  if (!values.length) return "";
  const most = Math.max(...values, 0.01);
  const rows = [];
  for (let level = height; level >= 1; level--) {
    rows.push(values.map((value, index) => {
      // Every value shows at least a sliver.
      const filled = Math.max(1, Math.round((value / most) * height)) >= level;
      const glyph = filled ? "██" : "  ";
      return index === highlight && filled ? `<b class="a">${glyph}</b>` : glyph;
    }).join(" "));
  }
  rows.push(labels.map((label, index) => (index === highlight ? `<b class="a">${esc(String(label).padEnd(2))}</b>` : esc(String(label).padEnd(2)))).join(" "));
  return `<pre class="mini-chart" aria-hidden="true">${rows.join("\n")}</pre>`;
}
