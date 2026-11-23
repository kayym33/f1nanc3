// The month as a river: money comes in on the left as a stream of
// glyphs, meets in the middle, and splits into a channel for each
// category, each as wide as what went there. The glyphs flow; the biggest
// channel wears the accent. Hover (or tap) a channel for its numbers;
// click one to see its transactions. Stepping between months morphs the
// channels into their new shape.
//
// It's drawn on one canvas, a grid of monospace cells, like t1ld3's noise
// band: cheap to redraw, and the same look as everything else.
import { bandTop, riverBands, riverLayout, SPLIT } from "../flow.js";
import { addMonths, monthLabel, monthOf, pounds, windowMonths } from "../money.js";
import { monthSummary } from "../summary.js";
import { isPrivate } from "../privacy.js";
import { action, esc, notReady, wide } from "../ui.js";

const WATER = "~~≈~-~=~≈~-~~";
const POOL = "· . ·  .";
const SHORTFALL = "-=-~-";
// Frames per second: the glyphs step like the noise band; morphs are smoother.
const FLOW_FPS = 10;
const MORPH_FPS = 40;
// How far each frame moves the drawn shape toward the new one.
const EASE = 0.14;
const SPECKS = 0.07;
// Columns for the labels either side: [left, right, longest name].
const LABELS = { wide: [8, 21, 13], narrow: [8, 16, 9] };

// The one river on screen, and the shape last drawn: kept between months
// so the next month's channels grow out of this one's.
let active = null;
const drawn = new Map();

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// Privacy mode hides the canvas's amounts too (the page's are blurred by CSS).
const short = (amount) => (isPrivate() ? "£xxx.xx" : `£${Math.round(amount).toLocaleString("en-GB")}`);

function hash(a, b) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function describe(band, month, totals) {
  const share = (part, whole) => (whole > 0 ? ` · ${Math.round((part / whole) * 100)}%` : "");
  switch (band.kind) {
    case "income": return { title: "money in", detail: `${pounds(band.amount)} came in`, link: `/tx?month=${month}&category=income` };
    case "balance": return { title: "from your balance", detail: `${pounds(band.amount)} more went out than came in`, link: null };
    case "left": return { title: "left over", detail: `${pounds(band.amount)}${share(band.amount, totals.income)} of what came in`, link: null };
    default: return {
      title: band.label,
      detail: `${pounds(band.amount)}${share(band.amount, totals.spending)} of spending · ${band.count} ${band.count === 1 ? "payment" : "payments"}`,
      link: `/tx?month=${month}&category=${encodeURIComponent(band.key)}`,
    };
  }
}

export function render(ctx, { month }) {
  const waiting = notReady(ctx.finance);
  if (waiting) return { crumbs: ["river"], html: waiting };
  const shown = month ?? monthOf(new Date());
  const months = windowMonths();
  const summary = monthSummary(ctx.finance.transactions, shown);
  const bands = riverBands(summary);
  const step = (target, label) => (months.includes(target)
    ? `<button type="button" class="step" ${action("go", { to: `/river/${target}` })}>${label}</button>`
    : `<span class="step off">${label}</span>`);
  const top = bands.sinks.find((band) => band.kind === "top");
  const sentence = !bands.sinks.length ? "nothing went out this month"
    : `${short(summary.spending)} went out${summary.income ? ` of ${short(summary.income)} in` : ""}. ${top ? `${top.label} took the most: ${short(top.amount)}.` : ""}`;
  const list = [...bands.sources.map((b) => [b, "in"]), ...bands.sinks.map((b) => [b, "out"])]
    .map(([band]) => `<li>${esc(describe(band, shown, summary).title)}: ${pounds(band.amount)}</li>`).join("");

  return {
    crumbs: ["river"],
    html: `
      <div class="month-bar">${step(addMonths(shown, -1), "‹")}<h1>${esc(monthLabel(shown))}</h1>${step(addMonths(shown, 1), "›")}</div>
      <p class="river-line">${esc(sentence)}</p>
      ${bands.sources.length && bands.sinks.length ? `
        <div class="river-wrap">
          <canvas class="river" aria-hidden="true"></canvas>
          <div class="river-tip" hidden></div>
        </div>
        <div class="river-card" hidden></div>
        <ul class="sr">${list}</ul>
        <p class="hint">${wide() ? "hover a channel for its numbers; click it to see its transactions" : "tap a channel for its numbers"}</p>`
        : `<pre class="art center">  ~ ~ ~  \n   ~ ~   </pre><p class="center muted">no money moved this month</p>`}`,
    mounted: () => start(ctx, shown, bands, summary),
  };
}

function start(ctx, month, bands, totals) {
  active?.stop();
  const canvas = document.querySelector("canvas.river");
  if (!canvas) return;
  active = new River(ctx, canvas, month, bands, totals);
}

class River {
  constructor(ctx, canvas, month, bands, totals) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.tip = canvas.parentElement.querySelector(".river-tip");
    // On a touch screen the numbers go under the river, not over it.
    this.card = document.querySelector(".river-card");
    this.month = month;
    this.bands = bands;
    this.totals = totals;
    this.hover = null;
    this.pinned = null;
    this.tick = 0;
    this.last = 0;
    this.lastStep = 0;
    this.running = true;
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement);
    canvas.addEventListener("pointermove", (event) => this.pointer(event));
    canvas.addEventListener("pointerleave", () => this.setHover(null));
    canvas.addEventListener("pointerdown", (event) => { this.touch = event.pointerType !== "mouse"; });
    canvas.addEventListener("click", (event) => this.click(event));
    this.frame = requestAnimationFrame((time) => this.loop(time));
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
  }

  // Measures the cells and works out the target shape for this size.
  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.width = box.width;
    this.height = box.height;
    this.canvas.width = Math.round(box.width * ratio);
    this.canvas.height = Math.round(box.height * ratio);
    this.canvas.style.width = `${box.width}px`;
    this.canvas.style.height = `${box.height}px`;
    const pen = this.canvas.getContext("2d");
    pen.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.fontSize = box.width < 600 ? 11 : 13;
    this.font = `${this.fontSize}px ${getComputedStyle(document.body).getPropertyValue("--mono")}`;
    pen.font = this.font;
    this.cellW = pen.measureText("M").width;
    this.cellH = Math.round(this.fontSize * 1.3);
    this.cols = Math.floor(box.width / this.cellW);
    this.rows = Math.floor(box.height / this.cellH);
    [this.leftCols, this.rightCols, this.nameChars] = LABELS[box.width < 600 ? "narrow" : "wide"];
    this.riverCols = Math.max(10, this.cols - this.leftCols - this.rightCols);
    const layout = riverLayout(this.bands, this.rows);
    this.target = new Map();
    for (const band of layout?.sources ?? []) this.target.set(`s:${band.key}`, { band, side: "source", rows: band.rows, trunk: band.trunk, slot: band.slot });
    for (const band of layout?.sinks ?? []) this.target.set(`k:${band.key}`, { band, side: "sink", rows: band.rows, trunk: band.trunk, slot: band.slot });
    // New channels grow out of the trunk; gone ones shrink into it.
    for (const [key, goal] of this.target) {
      if (!drawn.has(key) || still()) drawn.set(key, { ...goal, rows: still() ? goal.rows : 0 });
      drawn.get(key).band = goal.band;
    }
    this.morphing = true;
  }

  // Moves the drawn shape a step toward the target; false once it's there.
  ease() {
    let moving = false;
    for (const [key, shape] of drawn) {
      const goal = this.target.get(key) ?? { rows: 0, trunk: shape.trunk, slot: shape.slot };
      for (const field of ["rows", "trunk", "slot"]) {
        const gap = goal[field] - shape[field];
        if (Math.abs(gap) < 0.02) shape[field] = goal[field];
        else {
          shape[field] += gap * EASE;
          moving = true;
        }
      }
      if (!this.target.has(key) && shape.rows === 0) drawn.delete(key);
    }
    return moving;
  }

  loop(time) {
    if (!this.running) return;
    if (!this.canvas.isConnected) return this.stop();
    this.frame = requestAnimationFrame((next) => this.loop(next));
    if (document.visibilityState !== "visible") return;
    const fps = this.morphing ? MORPH_FPS : FLOW_FPS;
    if (time - this.last < 1000 / fps) return;
    this.last = time;
    if (!still() && time - this.lastStep >= 1000 / FLOW_FPS) {
      this.tick++;
      this.lastStep = time;
    }
    this.morphing = still() ? false : this.ease();
    this.draw();
  }

  // The band (and side) covering a cell, or null.
  bandAt(col, row) {
    const center = row + 0.5;
    if (col >= this.leftCols && col < this.leftCols + this.riverCols) {
      const u = (col - this.leftCols + 0.5) / this.riverCols;
      const side = u < SPLIT ? "source" : "sink";
      for (const shape of drawn.values()) {
        if (shape.side !== side || shape.rows < 0.5) continue;
        const top = bandTop(shape, side, u);
        if (center >= top && center < top + shape.rows) return shape;
      }
      return null;
    }
    // Over the labels: the band whose end is on that row, or the nearest.
    const side = col < this.leftCols ? "source" : "sink";
    let best = null;
    let distance = Infinity;
    for (const shape of drawn.values()) {
      if (shape.side !== side || !this.target.has(`${side === "source" ? "s" : "k"}:${shape.band.key}`)) continue;
      const away = center < shape.slot ? shape.slot - center : Math.max(0, center - (shape.slot + shape.rows));
      if (away < distance) [best, distance] = [shape, away];
    }
    return distance <= 1 ? best : null;
  }

  cellOf(event) {
    const box = this.canvas.getBoundingClientRect();
    return [Math.floor((event.clientX - box.left) / this.cellW), Math.floor((event.clientY - box.top) / this.cellH)];
  }

  pointer(event) {
    if (event.pointerType !== "mouse") return;
    const shape = this.bandAt(...this.cellOf(event));
    this.setHover(shape, event);
    this.canvas.style.cursor = shape && describe(shape.band, this.month, this.totals).link ? "pointer" : "default";
  }

  setHover(shape, event = null) {
    const changed = shape !== this.hover;
    this.hover = shape;
    if (!shape) {
      this.tip.hidden = true;
      if (this.card) this.card.hidden = true;
      if (changed) this.draw();
      return;
    }
    const { title, detail, link } = describe(shape.band, this.month, this.totals);
    const html = `<strong>${esc(title)}</strong><span>${esc(detail)}</span>`;
    if (this.touch && this.card) {
      this.card.innerHTML = html + (link ? `<a href="#${esc(link)}">see transactions ›</a>` : "");
      this.card.hidden = false;
      this.tip.hidden = true;
      if (changed) this.draw();
      return;
    }
    this.tip.innerHTML = html;
    this.tip.hidden = false;
    // Beside the pointer, kept inside the river.
    const box = this.canvas.getBoundingClientRect();
    const x = event ? event.clientX - box.left : this.width / 2;
    const y = event ? event.clientY - box.top : this.height / 2;
    const tipBox = this.tip.getBoundingClientRect();
    this.tip.style.left = `${Math.min(Math.max(8, x + 14), this.width - tipBox.width - 8)}px`;
    this.tip.style.top = `${Math.min(Math.max(8, y + 14), this.height - tipBox.height - 8)}px`;
    if (changed) this.draw();
  }

  click(event) {
    const shape = this.bandAt(...this.cellOf(event));
    if (!shape) return this.setHover(null);
    const { link } = describe(shape.band, this.month, this.totals);
    // A touch shows the numbers first (with a link); a mouse goes straight there.
    if (this.touch) return this.setHover(shape, event);
    if (link) this.ctx.go(link);
  }

  draw() {
    const pen = this.canvas.getContext("2d");
    const style = getComputedStyle(document.documentElement);
    const colour = (name) => style.getPropertyValue(name).trim();
    const ink = colour("--ink");
    const soft = colour("--ink-soft");
    const muted = colour("--muted");
    const faint = colour("--faint");
    const accent = colour("--accent");
    pen.clearRect(0, 0, this.width, this.height);
    pen.font = this.font;
    pen.textBaseline = "middle";
    const lit = this.hover;
    const tick = this.tick;

    for (let col = 0; col < this.riverCols; col++) {
      const u = (col + 0.5) / this.riverCols;
      const side = u < SPLIT ? "source" : "sink";
      const x = (this.leftCols + col) * this.cellW;
      for (const shape of drawn.values()) {
        if (shape.side !== side || shape.rows < 0.05) continue;
        const top = bandTop(shape, side, u);
        const first = Math.max(0, Math.ceil(top - 0.5));
        const end = Math.min(this.rows, Math.ceil(top + shape.rows - 0.5));
        const kind = shape.band.kind;
        for (let row = first; row < end; row++) {
          const noise = hash(row * 131 + (kind === "left" ? 7 : 0), col - (kind === "left" ? Math.floor(tick / 3) : tick));
          let glyph;
          let fill;
          if (kind === "left") {
            glyph = POOL[Math.floor(noise * POOL.length)];
            fill = faint;
          } else if (kind === "balance") {
            glyph = SHORTFALL[Math.floor(noise * SHORTFALL.length)];
            fill = muted;
          } else {
            if (noise < 0.05) continue;
            glyph = WATER[Math.floor(noise * WATER.length)];
            const edge = row === first || row === end - 1;
            fill = kind === "top" ? accent : edge ? soft : ink;
            if (kind === "spend" && hash(row, col * 7 + tick) < SPECKS) fill = accent;
          }
          if (lit) fill = shape === lit ? accent : faint;
          pen.fillStyle = fill;
          pen.fillText(glyph, x, (row + 0.5) * this.cellH);
        }
      }
    }

    // Labels at each band's end: amounts on the left, names and amounts on
    // the right.
    for (const shape of drawn.values()) {
      const goal = this.target.get(`${shape.side === "source" ? "s" : "k"}:${shape.band.key}`);
      // Labels wait until their band has settled, so they never collide mid-morph.
      if (!goal || Math.abs(shape.slot - goal.slot) > 0.4 || Math.abs(shape.rows - goal.rows) > 0.6) continue;
      const { band } = shape;
      const middle = shape.slot + shape.rows / 2;
      const isLit = lit === shape;
      const dim = lit && !isLit;
      if (shape.side === "source") {
        const two = shape.rows >= 2;
        pen.textAlign = "right";
        const right = (this.leftCols - 1) * this.cellW;
        pen.fillStyle = dim ? faint : isLit ? accent : muted;
        if (two) pen.fillText(band.label, right, (middle - 0.5) * this.cellH);
        pen.fillStyle = dim ? faint : isLit ? accent : band.kind === "balance" ? muted : ink;
        pen.fillText(short(band.amount), right, (two ? middle + 0.5 : middle) * this.cellH);
      } else {
        const left = (this.leftCols + this.riverCols + 1) * this.cellW;
        pen.textAlign = "left";
        pen.fillStyle = dim ? faint : isLit ? accent : band.kind === "left" ? muted : ink;
        const name = band.label.length > this.nameChars ? `${band.label.slice(0, this.nameChars - 1)}…` : band.label;
        pen.fillText(name, left, middle * this.cellH);
        pen.textAlign = "right";
        pen.fillStyle = dim ? faint : isLit || band.kind === "top" ? accent : band.kind === "left" ? muted : ink;
        pen.fillText(short(band.amount), this.cols * this.cellW, middle * this.cellH);
      }
    }
    pen.textAlign = "left";
  }
}
