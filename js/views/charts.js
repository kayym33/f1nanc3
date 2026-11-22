// Charts: in vs out by month, this month's pace against last month,
// each category over time (small multiples, so no rainbow of colours),
// and the whole thing as a spreadsheet with a CSV download.
//
// Three looks (js/chartstyle.js, picked in settings): terminal (area
// lines, values on the right, price tags, a crosshair), the same in
// green and red, and soft (rounded bars). Two series colours at most,
// checked for colour-blind separation and contrast in day and night; text
// stays in ink. Every chart shows its numbers on hover or tap, and
// dragging across one highlights that stretch with its totals.
import { chartStyle } from "../chartstyle.js";
import { monthLabel, monthOf, pounds } from "../money.js";
import { categoryGrid, gridCsv, inOut, months, niceCeiling, pace } from "../trends.js";
import { action, button, esc, heading, notReady } from "../ui.js";

const short = (amount) => `£${Math.round(amount).toLocaleString("en-GB")}`;
const axis = (amount) => (amount >= 1000 ? `£${(amount / 1000).toFixed(amount % 1000 ? 1 : 0)}k` : `£${Math.round(amount)}`);
const abbreviation = (month) => monthLabel(month).slice(0, 3);
const total = (list) => Math.round(list.reduce((a, b) => a + b, 0) * 100) / 100;

let active = null;

// "▲ £496 (+115%)": `good` says whether going up is good news.
function delta(now, before, { good = false, label = "" } = {}) {
  if (!before) return "";
  const change = now - before;
  const up = change > 0;
  const tone = change === 0 ? "" : up === good ? "good" : "bad";
  const pct = Math.round((change / before) * 100);
  return `<span class="delta ${tone}">${up ? "▲" : "▼"} ${esc(short(Math.abs(change)))} (${pct > 0 ? "+" : ""}${pct}%)${label ? ` ${esc(label)}` : ""}</span>`;
}

export function render(ctx) {
  const waiting = notReady(ctx.finance);
  if (waiting) return { crumbs: ["charts"], html: waiting };
  if (!ctx.finance.transactions.length) {
    return { crumbs: ["charts"], html: `<p class="muted">nothing to chart yet: import a statement from settings ⚙</p>` };
  }
  const list = months();
  const grid = categoryGrid(ctx.finance.transactions, list);
  const io = inOut(ctx.finance.transactions, list);
  // The last whole month against the one before (this month isn't over).
  const [before, last] = io.slice(-3, -1);
  const drag = (what) => `<p class="readout" data-readout><span class="hint">drag across the ${what} to add them up</span></p>`;
  return {
    crumbs: ["charts"],
    html: `
      <section class="chart-block">
        ${heading("in vs out")}
        ${last ? `<p class="headline"><span class="big">${esc(short(last.out))}</span> out in ${esc(monthLabel(last.month).split(" ")[0])} ${delta(last.out, before?.out, { label: `vs ${abbreviation(before?.month ?? last.month)}` })}</p>` : ""}
        <p class="legend"><span class="key in"></span>in <span class="key out"></span>out</p>
        <div class="chart" data-chart="in-out" aria-label="money in and out each month"></div>
        ${drag("months")}
      </section>
      <section class="chart-block">
        ${heading("this month's pace")}
        <p class="headline" data-part="pace-line"></p>
        <p class="legend"><span class="key out"></span>this month <span class="key last"></span>last month</p>
        <div class="chart" data-chart="pace" aria-label="spending so far this month against last month"></div>
        ${drag("days")}
      </section>
      <section class="chart-block">
        ${heading("categories over time")}
        <p class="hint">each on its own scale; the dot is this month; drag along one to add up its months</p>
        <div class="multiples">${grid.rows.map((row) => `
          <div class="multiple">
            <span class="name">${esc(row.category)}</span>
            <div class="chart spark" data-chart="spark" data-category="${esc(row.category)}"></div>
            <span class="now">${esc(short(row.values.at(-1)))}<small>avg ${esc(short(row.average))}</small></span>
          </div>`).join("")}</div>
        ${drag("months of a category")}
      </section>
      <section class="chart-block">
        <div class="section-head">${heading("the spreadsheet")}${button("download CSV", "charts-csv", {}, { small: true })}</div>
        ${tableHtml(grid, list)}
        <p class="hint">tap a cell to see its transactions</p>
      </section>
      <div class="chart-tip" hidden></div>`,
    mounted: () => {
      active?.stop();
      active = new Charts(ctx, list, grid, io);
    },
  };
}

function tableHtml(grid, list) {
  const most = Math.max(...grid.rows.flatMap((row) => row.values), 1);
  const shade = (value) => (value > 0 ? ` style="--shade:${(0.08 + 0.55 * (value / most)).toFixed(2)}"` : "");
  return `
    <div class="sheet-wrap"><table class="sheet">
      <thead><tr><th>category</th>${list.map((month) => `<th class="num">${esc(abbreviation(month))}<small>${month.slice(2, 4)}</small></th>`).join("")}<th class="num">total</th></tr></thead>
      <tbody>${grid.rows.map((row) => `
        <tr><th>${esc(row.category)}</th>${row.values.map((value, i) => `<td class="num cell"${shade(value)} ${action("go", { to: `/tx?month=${list[i]}&category=${encodeURIComponent(row.category)}` })}>${value ? esc(short(value)) : ""}</td>`).join("")}<td class="num total">${esc(short(row.total))}</td></tr>`).join("")}
      </tbody>
      <tfoot><tr><th>total</th>${grid.totals.map((value) => `<td class="num">${esc(short(value))}</td>`).join("")}<td class="num total">${esc(short(grid.total))}</td></tr></tfoot>
    </table></div>`;
}

class Charts {
  constructor(ctx, list, grid, io) {
    this.ctx = ctx;
    this.list = list;
    this.grid = grid;
    this.io = io;
    this.pace = pace(ctx.finance.transactions);
    this.tip = document.querySelector(".chart-tip");
    this.observer = new ResizeObserver(() => this.draw());
    this.observer.observe(document.querySelector("main"));
    this.hideTip = () => {
      if (this.tip) this.tip.hidden = true;
    };
    window.addEventListener("scroll", this.hideTip, { passive: true });
    this.draw();
    this.paceLine();
  }

  stop() {
    this.observer.disconnect();
    window.removeEventListener("scroll", this.hideTip);
  }

  // (Re)draws every chart whose width or style changed.
  draw() {
    if (!this.tip?.isConnected) return this.stop();
    const style = chartStyle();
    for (const box of document.querySelectorAll("[data-chart]")) {
      const width = Math.floor(box.clientWidth);
      const key = `${width}:${style}`;
      if (!width || box.dataset.drawn === key) continue;
      box.dataset.drawn = key;
      const spec = this.spec(box);
      if (!spec) continue;
      box.innerHTML = this.svg(spec, width, style);
      this.interact(box, spec, width, style);
    }
  }

  paceLine() {
    const part = document.querySelector('[data-part="pace-line"]');
    const { thisMonth, lastMonth, day } = this.pace;
    const now = thisMonth.at(-1) ?? 0;
    const then = lastMonth[Math.min(day, lastMonth.length) - 1] ?? 0;
    const gap = Math.round(now - then);
    const tone = gap === 0 ? "" : gap < 0 ? "good" : "bad";
    part.innerHTML = `<span class="big">${esc(short(now))}</span> so far ${then ? `<span class="delta ${tone}">${gap < 0 ? "▼" : gap > 0 ? "▲" : "="} ${esc(short(Math.abs(gap)))} ${gap < 0 ? "less than" : gap > 0 ? "more than" : "the same as"} this time last month</span>` : ""}`;
  }

  // What a chart shows: its points, series, labels and what a highlighted
  // stretch adds up to.
  spec(box) {
    const kind = box.dataset.chart;
    if (kind === "in-out") {
      return {
        kind, height: 210, months: true, labels: this.list.map(abbreviation),
        series: [
          { name: "in", cls: "in", values: this.io.map((row) => row.in) },
          { name: "out", cls: "out", values: this.io.map((row) => row.out) },
        ],
        // The current month isn't over: its stretch of line is dashed.
        partialLast: true,
        tip: (i) => `<strong>${esc(monthLabel(this.io[i].month))}</strong><span>in ${esc(pounds(this.io[i].in))}</span><span>out ${esc(pounds(this.io[i].out))}</span><span>left ${esc(pounds(this.io[i].left, { sign: true }))}</span>`,
        range: (a, b) => {
          const rows = this.io.slice(a, b + 1);
          const ins = total(rows.map((row) => row.in));
          const outs = total(rows.map((row) => row.out));
          const left = Math.round((ins - outs) * 100) / 100;
          const span = a === b ? esc(monthLabel(rows[0].month)) : `${esc(abbreviation(rows[0].month))} → ${esc(abbreviation(rows.at(-1).month))}`;
          return `<b>${span}</b> (${rows.length} ${rows.length === 1 ? "month" : "months"}) · in ${esc(short(ins))} · out ${esc(short(outs))} · <b class="${left >= 0 ? "good" : "bad"}">left ${left >= 0 ? "+" : "−"}${esc(short(Math.abs(left)))}</b> · avg out ${esc(short(outs / rows.length))}/mo`;
        },
      };
    }
    if (kind === "pace") {
      const { thisMonth, lastMonth } = this.pace;
      const days = Math.max(lastMonth.length, thisMonth.length, 28);
      return {
        kind, height: 190, months: false, labels: Array.from({ length: days }, (_, i) => String(i + 1)), count: days,
        series: [
          { name: "last month", cls: "last", values: lastMonth },
          { name: "this month", cls: "out", values: thisMonth },
        ],
        tip: (i) => `<strong>day ${i + 1}</strong>${thisMonth[i] !== undefined ? `<span>this month ${esc(pounds(thisMonth[i]))}</span>` : ""}${lastMonth[i] !== undefined ? `<span>last month ${esc(pounds(lastMonth[i]))}</span>` : ""}`,
        range: (a, b) => {
          const spent = (values) => {
            if (a >= values.length) return null;
            const to = Math.min(b, values.length - 1);
            return values[to] - (a ? values[a - 1] : 0);
          };
          const now = spent(thisMonth);
          const then = spent(lastMonth);
          return `<b>day ${a + 1}${a === b ? "" : ` → ${b + 1}`}</b> · this month ${now === null ? "—" : esc(short(now))} · last month ${then === null ? "—" : esc(short(then))}`;
        },
      };
    }
    const row = this.grid.rows.find((r) => r.category === box.dataset.category);
    if (!row) return null;
    return {
      kind, height: 36, months: true, spark: true, labels: this.list.map(abbreviation),
      series: [{ name: row.category, cls: "spark", values: row.values }],
      tip: (i) => `<strong>${esc(row.category)}</strong><span>${esc(monthLabel(this.list[i]))}: ${esc(pounds(row.values[i]))}</span>`,
      range: (a, b) => {
        const sum = total(row.values.slice(a, b + 1));
        const count = b - a + 1;
        return `<b>${esc(row.category)}</b> · ${esc(abbreviation(this.list[a]))}${a === b ? "" : ` → ${esc(abbreviation(this.list[b]))}`} · ${esc(short(sum))} · avg ${esc(short(sum / count))}/mo`;
      },
    };
  }

  // Where things go for a chart at this width and style.
  layout(spec, width, style) {
    const terminal = style !== "soft";
    const bars = spec.months && !spec.spark && !terminal;
    const pad = spec.spark ? { l: 3, r: 3, t: 4, b: 4 } : terminal ? { l: 4, r: 56, t: 10, b: 22 } : { l: 44, r: 8, t: 10, b: 22 };
    const n = spec.count ?? spec.labels.length;
    const plotW = Math.max(10, width - pad.l - pad.r);
    const plotH = spec.height - pad.t - pad.b;
    const max = spec.spark ? Math.max(...spec.series[0].values, 1) : niceCeiling(Math.max(...spec.series.flatMap((s) => s.values), 1));
    const x = (i) => pad.l + (bars ? (i + 0.5) / n : i / Math.max(1, n - 1)) * plotW;
    const y = (value) => pad.t + plotH - (value / max) * plotH;
    // A highlighted stretch runs from half a step before its first point
    // to half a step after its last.
    const step = bars ? plotW / n : plotW / Math.max(1, n - 1);
    const edge = (i, side) => Math.min(pad.l + plotW, Math.max(pad.l, x(i) + (side * step) / 2));
    const index = (px) => {
      const raw = bars ? ((px - pad.l) / plotW) * n - 0.5 : ((px - pad.l) / plotW) * (n - 1);
      return Math.max(0, Math.min(n - 1, Math.round(raw)));
    };
    return { terminal, bars, pad, n, plotW, plotH, max, x, y, edge, index };
  }

  svg(spec, width, style) {
    const L = this.layout(spec, width, style);
    const { pad, plotW, plotH, x, y, max } = L;
    const height = spec.height;
    let out = "";
    if (spec.spark) {
      const values = spec.series[0].values;
      const path = values.map((value, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(value).toFixed(1)}`).join("");
      out += `<line class="grid" x1="0" x2="${width}" y1="${height - 4}" y2="${height - 4}"/>`;
      if (L.terminal) out += `<path class="fill spark" d="${path}L${x(values.length - 1)},${height - 4}L${x(0)},${height - 4}Z"/>`;
      out += `<path class="line spark${style === "soft" ? " thick" : ""}" d="${path}"/>`;
      out += `<circle class="dot out" cx="${x(values.length - 1)}" cy="${y(values.at(-1))}" r="3.5"/>`;
    } else {
      // Gridlines and the value axis (on the right for terminal, where a
      // price tag hides any label it would cover).
      const tagged = L.terminal ? spec.series.filter((s) => s.values.length).map((s) => y(s.values.at(-1))) : [];
      for (const value of [0, max / 2, max]) {
        out += `<line class="grid${L.terminal && value ? " dotted" : ""}" x1="${pad.l}" x2="${pad.l + plotW}" y1="${y(value)}" y2="${y(value)}"/>`;
        if (tagged.some((at) => Math.abs(at - y(value)) < 14)) continue;
        out += L.terminal
          ? `<text class="tick" x="${pad.l + plotW + 6}" y="${y(value) + 4}">${axis(value)}</text>`
          : `<text class="tick" x="${pad.l - 6}" y="${y(value) + 4}" text-anchor="end">${axis(value)}</text>`;
      }
      // Labels along the bottom, thinned to fit.
      const every = spec.months ? (plotW / L.n < 34 ? 2 : 1) : 7;
      spec.labels.forEach((label, i) => {
        const show = spec.months ? (L.n - 1 - i) % every === 0 : i % every === 0;
        if (show) out += `<text class="tick" x="${x(i)}" y="${height - 6}" text-anchor="middle">${esc(label)}</text>`;
      });
      if (L.bars) {
        const slot = plotW / L.n;
        const bar = Math.max(2, Math.min(16, slot / 2 - 3));
        const radius = Math.min(6, bar / 2);
        spec.series[0].values.forEach((_, i) => {
          spec.series.forEach((series, k) => {
            const value = series.values[i];
            if (value > 0) out += `<rect class="bar ${series.cls}" x="${x(i) + (k ? 1 : -bar - 1)}" y="${y(value)}" width="${bar}" height="${Math.max(1, y(0) - y(value))}" rx="${radius}"/>`;
          });
        });
      } else {
        for (const series of spec.series) {
          const values = series.values;
          if (!values.length) continue;
          const partial = spec.partialLast && values.length > 1;
          const solid = partial ? values.slice(0, -1) : values;
          const path = (list, from = 0) => list.map((value, i) => `${i ? "L" : "M"}${x(i + from).toFixed(1)},${y(value).toFixed(1)}`).join("");
          if (L.terminal) out += `<path class="fill ${series.cls}" d="${path(values)}L${x(values.length - 1)},${y(0)}L${x(0)},${y(0)}Z"/>`;
          out += `<path class="line ${series.cls}${style === "soft" ? " thick" : ""}" d="${path(solid)}"/>`;
          if (partial) out += `<path class="line ${series.cls} partial" d="${path(values.slice(-2), values.length - 2)}"/>`;
          if (L.terminal) out += `<line class="last-level ${series.cls}" x1="${pad.l}" x2="${pad.l + plotW}" y1="${y(values.at(-1))}" y2="${y(values.at(-1))}"/>`;
          out += `<circle class="dot ${series.cls}" cx="${x(values.length - 1)}" cy="${y(values.at(-1))}" r="${style === "soft" ? 5 : 3.5}"/>`;
        }
        // Price tags: each line's latest value on the right edge, nudged
        // apart when they'd overlap.
        if (L.terminal) {
          const tags = spec.series.filter((s) => s.values.length).map((s) => ({ cls: s.cls, value: s.values.at(-1), at: y(s.values.at(-1)) }))
            .sort((a, b) => a.at - b.at);
          for (let i = 1; i < tags.length; i++) if (tags[i].at - tags[i - 1].at < 19) tags[i].at = tags[i - 1].at + 19;
          for (const tag of tags) {
            out += `<rect class="tag ${tag.cls}" x="${pad.l + plotW + 2}" y="${tag.at - 9}" width="${pad.r - 4}" height="18" rx="2"/>
              <text class="tag-text" x="${pad.l + plotW + 6}" y="${tag.at + 4}">${esc(short(tag.value))}</text>`;
          }
        }
      }
    }
    out += `<rect class="brush" x="0" y="${pad.t}" width="0" height="${plotH}" visibility="hidden"/>`;
    if (!spec.spark) {
      out += `<g class="cross" visibility="hidden"><line class="v" y1="${pad.t}" y2="${pad.t + plotH}"/><line class="h" x1="${pad.l}" x2="${pad.l + plotW}"/>
        ${L.terminal ? `<rect class="tag cursor" x="${pad.l + plotW + 2}" width="${pad.r - 4}" height="18" rx="2"/><text class="tag-text cursor" x="${pad.l + plotW + 6}"></text>` : ""}</g>`;
    }
    out += `<rect class="hit" x="${pad.l}" y="0" width="${plotW}" height="${height - (spec.spark ? 0 : pad.b)}"/>`;
    return `<svg width="${width}" height="${height}" role="img">${out}</svg>`;
  }

  // Hover and tap show a point's numbers; dragging highlights a stretch.
  interact(box, spec, width, style) {
    const svg = box.querySelector("svg");
    const L = this.layout(spec, width, style);
    const brush = svg.querySelector(".brush");
    const cross = svg.querySelector(".cross");
    const readout = box.closest(".chart-block").querySelector("[data-readout]");
    const resting = readout.dataset.resting ?? (readout.dataset.resting = readout.innerHTML);
    let start = null;
    const indexOf = (event) => {
      const rect = svg.getBoundingClientRect();
      return L.index(((event.clientX - rect.left) / rect.width) * width);
    };
    const point = (i) => {
      if (!cross) return;
      const primary = spec.series.at(-1).values[i] ?? spec.series[0].values[i] ?? 0;
      cross.setAttribute("visibility", "visible");
      cross.querySelector(".v").setAttribute("x1", L.x(i));
      cross.querySelector(".v").setAttribute("x2", L.x(i));
      cross.querySelector(".h").setAttribute("y1", L.y(primary));
      cross.querySelector(".h").setAttribute("y2", L.y(primary));
      const tag = cross.querySelector("rect.cursor");
      if (tag) {
        tag.setAttribute("y", L.y(primary) - 9);
        const text = cross.querySelector("text.cursor");
        text.setAttribute("y", L.y(primary) + 4);
        text.textContent = short(primary);
      }
    };
    const showTip = (event, i) => {
      this.tip.innerHTML = spec.tip(i);
      this.tip.hidden = false;
      const tipBox = this.tip.getBoundingClientRect();
      const left = Math.min(window.innerWidth - tipBox.width - 8, Math.max(8, event.clientX + 12));
      const top = event.clientY - tipBox.height - 12 < 8 ? event.clientY + 16 : event.clientY - tipBox.height - 12;
      this.tip.style.left = `${left}px`;
      this.tip.style.top = `${top}px`;
    };
    const mark = (a, b) => {
      const [from, to] = a <= b ? [a, b] : [b, a];
      brush.setAttribute("x", L.edge(from, -1));
      brush.setAttribute("width", Math.max(3, L.edge(to, 1) - L.edge(from, -1)));
      brush.setAttribute("visibility", "visible");
      readout.innerHTML = spec.range(from, to);
      readout.classList.add("on");
    };
    const clear = () => {
      brush.setAttribute("visibility", "hidden");
      readout.innerHTML = resting;
      readout.classList.remove("on");
    };
    box.clearHighlight = clear;
    svg.addEventListener("pointerdown", (event) => {
      // Starting a highlight clears the others.
      for (const other of document.querySelectorAll("[data-chart]")) if (other !== box) other.clearHighlight?.();
      start = indexOf(event);
      svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener("pointermove", (event) => {
      const i = indexOf(event);
      point(i);
      showTip(event, i);
      if (start !== null && i !== start) mark(start, i);
    });
    svg.addEventListener("pointerup", (event) => {
      const i = indexOf(event);
      // A tap clears the highlight and shows that point.
      if (start === i) {
        clear();
        point(i);
        showTip(event, i);
      }
      start = null;
    });
    svg.addEventListener("pointerleave", (event) => {
      if (start !== null || event.pointerType !== "mouse") return;
      cross?.setAttribute("visibility", "hidden");
      this.tip.hidden = true;
    });
  }
}

// Esc clears any highlight.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  for (const box of document.querySelectorAll("[data-chart]")) box.clearHighlight?.();
});

export const actions = {
  "charts-csv"(ctx) {
    const list = months();
    const csv = gridCsv(categoryGrid(ctx.finance.transactions, list), list);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `f1nanc3-${monthOf(new Date())}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
