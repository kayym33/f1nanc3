// Charts: in vs out by month, this month's pace against last month,
// each category over time (small multiples, so no rainbow of colours),
// and the whole thing as a spreadsheet with a CSV download. Two series
// colours only, ink and orange (validated for colour-blind separation and
// contrast in day and night); text stays in ink. Every chart answers a
// hover or tap with its numbers. Drawn once the page knows its width.
import { monthLabel, monthOf, pounds } from "../money.js";
import { categoryGrid, gridCsv, inOut, months, niceCeiling, pace } from "../trends.js";
import { action, button, esc, heading, notReady } from "../ui.js";

const short = (amount) => `£${Math.round(amount).toLocaleString("en-GB")}`;
const axis = (amount) => (amount >= 1000 ? `£${(amount / 1000).toFixed(amount % 1000 ? 1 : 0)}k` : `£${Math.round(amount)}`);
const abbreviation = (month) => monthLabel(month).slice(0, 3);

let active = null;

export function render(ctx) {
  const waiting = notReady(ctx.finance);
  if (waiting) return { crumbs: ["charts"], html: waiting };
  if (!ctx.finance.transactions.length) {
    return { crumbs: ["charts"], html: `<p class="muted">nothing to chart yet: import a statement from settings ⚙</p>` };
  }
  const list = months();
  const grid = categoryGrid(ctx.finance.transactions, list);
  return {
    crumbs: ["charts"],
    html: `
      <section class="chart-block">
        ${heading("in vs out")}
        <p class="legend"><span class="key in"></span>in <span class="key out"></span>out</p>
        <div class="chart" data-chart="in-out" aria-label="money in and out each month"></div>
      </section>
      <section class="chart-block">
        ${heading("this month's pace")}
        <p class="chart-line" data-part="pace-line"></p>
        <p class="legend"><span class="key out"></span>this month <span class="key in faded"></span>last month</p>
        <div class="chart" data-chart="pace" aria-label="spending so far this month against last month"></div>
      </section>
      <section class="chart-block">
        ${heading("categories over time")}
        <p class="hint">each on its own scale; the dot is this month</p>
        <div class="multiples">${grid.rows.map((row) => `
          <div class="multiple">
            <span class="name">${esc(row.category)}</span>
            <div class="chart spark" data-chart="spark" data-category="${esc(row.category)}"></div>
            <span class="now">${esc(short(row.values.at(-1)))}<small>avg ${esc(short(row.average))}</small></span>
          </div>`).join("")}</div>
      </section>
      <section class="chart-block">
        <div class="section-head">${heading("the spreadsheet")}${button("download CSV", "charts-csv", {}, { small: true })}</div>
        ${tableHtml(grid, list)}
        <p class="hint">tap a cell to see its transactions</p>
      </section>
      <div class="chart-tip" hidden></div>`,
    mounted: () => {
      active?.stop();
      active = new Charts(ctx, list, grid);
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
  constructor(ctx, list, grid) {
    this.ctx = ctx;
    this.list = list;
    this.grid = grid;
    this.io = inOut(ctx.finance.transactions, list);
    this.pace = pace(ctx.finance.transactions);
    this.tip = document.querySelector(".chart-tip");
    this.observer = new ResizeObserver(() => this.draw());
    this.observer.observe(document.querySelector("main"));
    this.hideTip = () => { if (this.tip) this.tip.hidden = true; };
    window.addEventListener("scroll", this.hideTip, { passive: true });
    this.draw();
    this.paceLine();
  }

  stop() {
    this.observer.disconnect();
    window.removeEventListener("scroll", this.hideTip);
  }

  draw() {
    if (!this.tip?.isConnected) return this.stop();
    for (const box of document.querySelectorAll("[data-chart]")) {
      const width = Math.floor(box.clientWidth);
      if (!width || Number(box.dataset.width) === width) continue;
      box.dataset.width = width;
      const kind = box.dataset.chart;
      if (kind === "in-out") box.innerHTML = this.inOutSvg(width);
      else if (kind === "pace") box.innerHTML = this.paceSvg(width);
      else box.innerHTML = this.sparkSvg(width, this.grid.rows.find((row) => row.category === box.dataset.category));
      this.hover(box);
    }
  }

  paceLine() {
    const part = document.querySelector('[data-part="pace-line"]');
    const { thisMonth, lastMonth, day } = this.pace;
    const now = thisMonth.at(-1) ?? 0;
    const then = lastMonth[Math.min(day, lastMonth.length) - 1] ?? 0;
    const gap = Math.round(now - then);
    part.textContent = !then ? `${short(now)} so far this month`
      : `${short(now)} so far: ${gap === 0 ? "the same as" : `${short(Math.abs(gap))} ${gap < 0 ? "less than" : "more than"}`} this time last month`;
  }

  // Grouped bars: in (ink) and out (orange) per month, 2px apart.
  inOutSvg(width) {
    const height = 200;
    const left = 44;
    const bottom = 22;
    const top = 8;
    const plot = height - bottom - top;
    const max = niceCeiling(Math.max(...this.io.flatMap((row) => [row.in, row.out]), 1));
    const slot = (width - left) / this.io.length;
    const bar = Math.max(2, Math.min(14, (slot - 6) / 2));
    const y = (value) => top + plot - (value / max) * plot;
    const grid = [0, max / 2, max].map((value) => `
      <line class="grid" x1="${left}" x2="${width}" y1="${y(value)}" y2="${y(value)}"/>
      <text class="tick" x="${left - 6}" y="${y(value) + 4}" text-anchor="end">${axis(value)}</text>`).join("");
    const everyOther = slot < 30;
    const bars = this.io.map((row, i) => {
      const middle = left + slot * i + slot / 2;
      const rect = (value, x, cls) => (value > 0 ? `<rect class="${cls}" x="${x}" y="${y(value)}" width="${bar}" height="${Math.max(1, plot + top - y(value))}" rx="1.5"/>` : "");
      // Narrow: every other month, counting back from this one.
      const label = !everyOther || (this.io.length - 1 - i) % 2 === 0
        ? `<text class="tick" x="${middle}" y="${height - 6}" text-anchor="middle">${esc(abbreviation(row.month))}</text>` : "";
      return `${rect(row.in, middle - bar - 1, "s-in")}${rect(row.out, middle + 1, "s-out")}${label}
        <rect class="hit" x="${left + slot * i}" y="0" width="${slot}" height="${height - bottom}" data-i="${i}"/>`;
    }).join("");
    return `<svg width="${width}" height="${height}" role="img">${grid}${bars}</svg>`;
  }

  // Running totals: this month (orange) against last month (ink), with the
  // end of each line labelled.
  paceSvg(width) {
    const height = 190;
    const left = 44;
    const right = 8;
    const bottom = 22;
    const top = 10;
    const plot = height - bottom - top;
    const { thisMonth, lastMonth } = this.pace;
    const days = Math.max(lastMonth.length, 31);
    const max = niceCeiling(Math.max(...thisMonth, ...lastMonth, 1));
    const x = (day) => left + ((day - 1) / (days - 1)) * (width - left - right);
    const y = (value) => top + plot - (value / max) * plot;
    const path = (values) => values.map((value, i) => `${i ? "L" : "M"}${x(i + 1).toFixed(1)},${y(value).toFixed(1)}`).join("");
    const grid = [0, max / 2, max].map((value) => `
      <line class="grid" x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/>
      <text class="tick" x="${left - 6}" y="${y(value) + 4}" text-anchor="end">${axis(value)}</text>`).join("");
    const ticks = [1, 8, 15, 22, 29].map((day) => `<text class="tick" x="${x(day)}" y="${height - 6}" text-anchor="middle">${day}</text>`).join("");
    const lastPoint = thisMonth.length ? `<circle class="s-out-dot" cx="${x(thisMonth.length)}" cy="${y(thisMonth.at(-1))}" r="4"/>` : "";
    return `<svg width="${width}" height="${height}" role="img">${grid}${ticks}
      <path class="l-in" d="${path(lastMonth)}"/>
      <path class="l-out" d="${path(thisMonth)}"/>${lastPoint}
      <line class="crosshair" x1="0" x2="0" y1="${top}" y2="${top + plot}" visibility="hidden"/>
      <rect class="hit" x="${left}" y="0" width="${width - left - right}" height="${height - bottom}" data-pace="1"/></svg>`;
  }

  // One category: a 2px ink line over the months, this month's dot in orange.
  sparkSvg(width, row) {
    if (!row) return "";
    const height = 36;
    const max = Math.max(...row.values, 1);
    const x = (i) => 3 + (i / (row.values.length - 1)) * (width - 6);
    const y = (value) => 4 + (height - 8) * (1 - value / max);
    const path = row.values.map((value, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(value).toFixed(1)}`).join("");
    return `<svg width="${width}" height="${height}" role="img" aria-label="${esc(row.category)} each month">
      <line class="grid" x1="0" x2="${width}" y1="${height - 4}" y2="${height - 4}"/>
      <path class="l-spark" d="${path}"/>
      <circle class="s-out-dot" cx="${x(row.values.length - 1)}" cy="${y(row.values.at(-1))}" r="3.5"/>
      <rect class="hit" x="0" y="0" width="${width}" height="${height}" data-spark="${esc(row.category)}"/></svg>`;
  }

  // The numbers under the pointer, or under a finger.
  hover(box) {
    const svg = box.querySelector("svg");
    if (!svg) return;
    const show = (event) => {
      const target = event.target;
      const svgBox = svg.getBoundingClientRect();
      const px = event.clientX - svgBox.left;
      let html = null;
      if (target.dataset.i !== undefined) {
        const row = this.io[Number(target.dataset.i)];
        html = `<strong>${esc(monthLabel(row.month))}</strong><span>in ${esc(pounds(row.in))}</span><span>out ${esc(pounds(row.out))}</span><span>left ${esc(pounds(row.left, { sign: true }))}</span>`;
      } else if (target.dataset.pace) {
        const days = Math.max(this.pace.lastMonth.length, 31);
        const rect = target.getBoundingClientRect();
        const day = Math.min(days, Math.max(1, Math.round(1 + ((event.clientX - rect.left) / rect.width) * (days - 1))));
        const now = this.pace.thisMonth[day - 1];
        const then = this.pace.lastMonth[day - 1];
        html = `<strong>day ${day}</strong>${now !== undefined ? `<span>this month ${esc(pounds(now))}</span>` : ""}${then !== undefined ? `<span>last month ${esc(pounds(then))}</span>` : ""}`;
        const cross = svg.querySelector(".crosshair");
        const cx = rect.left - svgBox.left + ((day - 1) / (days - 1)) * rect.width;
        cross.setAttribute("x1", cx);
        cross.setAttribute("x2", cx);
        cross.setAttribute("visibility", "visible");
      } else if (target.dataset.spark) {
        const row = this.grid.rows.find((r) => r.category === target.dataset.spark);
        const i = Math.min(row.values.length - 1, Math.max(0, Math.round((px / svgBox.width) * (row.values.length - 1))));
        html = `<strong>${esc(row.category)}</strong><span>${esc(monthLabel(this.list[i]))}: ${esc(pounds(row.values[i]))}</span>`;
      }
      if (!html) return hide();
      this.tip.innerHTML = html;
      this.tip.hidden = false;
      const tipBox = this.tip.getBoundingClientRect();
      const x = Math.min(window.innerWidth - tipBox.width - 8, Math.max(8, event.clientX + 12));
      const yPos = event.clientY - tipBox.height - 12 < 8 ? event.clientY + 16 : event.clientY - tipBox.height - 12;
      this.tip.style.left = `${x}px`;
      this.tip.style.top = `${yPos}px`;
    };
    const hide = () => {
      this.tip.hidden = true;
      svg.querySelector(".crosshair")?.setAttribute("visibility", "hidden");
    };
    svg.addEventListener("pointermove", show);
    svg.addEventListener("pointerdown", show);
    svg.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse") hide();
    });
  }
}

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

