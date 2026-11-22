// Your year, wrapped: a full-screen deck of cards made from the last 365
// days (js/wrapped.js), one stat each, with a picture in glyphs that
// draws itself in and numbers that count up. Tap the right of the screen
// (or →, or swipe left) for the next card, the left for the one before;
// cards also move on by themselves. Esc or × leaves.
import { displayName } from "../categories.js";
import { addMonths, dayLabel, monthLabel, monthOf, pounds } from "../money.js";
import { bar, esc, notReady } from "../ui.js";
import { WEEKDAYS, yearStats } from "../wrapped.js";

const AUTO_MS = 8000;
const COUNT_MS = 1100;
// t1ld3's figure holding up a coin, as on the icon.
const FIGURE = [
  "......ccc",
  "..oo..c.c",
  "..oo..ccc",
  ".OooOo...",
  "o.oo.....",
  "..oo.....",
  ".o..o....",
  ".o..o....",
];

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const round = (amount) => `£${Math.round(amount).toLocaleString("en-GB")}`;
const date = (iso) => `${dayLabel(iso).split(" ").slice(1).join(" ")} ${iso.slice(0, 4)}`;

// A number that counts up when its card shows: pounds, or a plain count.
function count(value, kind = "pounds") {
  const text = kind === "pounds" ? pounds(value) : kind === "round" ? round(value) : String(value);
  return `<span class="count" data-to="${value}" data-kind="${kind}">${esc(text)}</span>`;
}

// Rows of a picture that draw in one after another.
function art(rows, className = "") {
  return `<pre class="w-art ${className}" aria-hidden="true">${rows.map((row, index) => `<span class="w-row" style="--i:${index}">${row}</span>`).join("\n")}</pre>`;
}

function figureArt() {
  return art(FIGURE.map((row) => [...row].map((cell) => (
    cell === "o" || cell === "c" ? `<b class="a">██</b>` : cell === "O" ? `<b class="d">██</b>` : "  ")).join("")));
}

function visitsArt(visits) {
  const shown = Math.min(visits, 160);
  const perRow = 20;
  const rows = [];
  for (let start = 0; start < shown; start += perRow) {
    rows.push(`<b class="a">${"■ ".repeat(Math.min(perRow, shown - start)).trimEnd()}</b>`);
  }
  if (visits > shown) rows.push(`<i>+ ${visits - shown} more</i>`);
  return art(rows, "small");
}

function categoryArt(byCategory) {
  const top = byCategory.slice(0, 5);
  const most = top[0]?.total ?? 1;
  const width = Math.max(...top.map((row) => row.category.length));
  return art(top.map((row, index) => `${esc(row.category.padEnd(width))}  ${index === 0 ? bar(row.total / most, 14) : bar(row.total / most, 14).replace("bar-fill", "bar-ink")}  ${esc(round(row.total))}`));
}

function receiptArt(t) {
  const inner = 22;
  const line = (text = "") => `| ${esc(text.padEnd(inner))} |`;
  return art([
    ` .${"-".repeat(inner + 2)}. `,
    line(displayName(t.merchant).toUpperCase().slice(0, inner)),
    line(date(t.booked_on).toUpperCase()),
    line("-".repeat(inner)),
    `| <b class="a">${esc(pounds(-t.amount).padEnd(inner))}</b> |`,
    line(),
    line(t.category),
    ` '${"-".repeat(inner + 2)}' `,
  ]);
}

// Columns rows high, one per entry; the highlighted one in the accent.
function columnsArt(values, labels, highlight, height = 8) {
  const most = Math.max(...values, 1);
  const rows = [];
  for (let level = height; level >= 1; level--) {
    rows.push(values.map((value, index) => {
      const filled = Math.round((value / most) * height) >= level;
      const glyph = filled ? "██" : "  ";
      return index === highlight ? `<b class="a">${glyph}</b>` : filled ? `<b class="k">${glyph}</b>` : glyph;
    }).join(" "));
  }
  rows.push(labels.map((label, index) => (index === highlight ? `<b class="a">${esc(label.padEnd(2))}</b>` : esc(label.padEnd(2)))).join(" "));
  return art(rows);
}

// A row per regular payment, a block for every month of the last 12 it
// went out in.
function clockworkArt(regular, to) {
  const months = Array.from({ length: 12 }, (_, index) => addMonths(monthOf(to), index - 11));
  const width = Math.min(14, Math.max(...regular.map((row) => displayName(row.merchant).length)));
  const rows = regular.slice(0, 6).map((row) => {
    const name = displayName(row.merchant).slice(0, width).padEnd(width);
    return `<b class="k">${esc(name)}</b>  ${months.map((month) => (row.paid.includes(month) ? `<b class="a">■</b>` : "·")).join(" ")}`;
  });
  rows.push(`${" ".repeat(width)}  ${months.map((month) => esc(monthLabel(month)[0])).join(" ")}`);
  return art(rows, "small");
}

function streakArt(days) {
  const shown = Math.min(days, 120);
  const rows = [];
  for (let start = 0; start < shown; start += 30) rows.push(`<b class="a">${"·".repeat(Math.min(30, shown - start))}</b>`);
  return art(rows, "small");
}

function waveArt() {
  const wave = "~≈~-~~≈~-=~≈~~-~≈~";
  return art(Array.from({ length: 5 }, (_, row) => {
    const shift = row * 3;
    const line = (wave.slice(shift) + wave + wave).slice(0, 36);
    return row === 2 ? `<b class="a">${esc(line)}</b>` : esc(line);
  }), "wave");
}

function card(kicker, body, picture = "") {
  return `<section class="w-card"><p class="w-kicker">${esc(kicker)}</p>${body}${picture}</section>`;
}

function cards(stats) {
  const list = [];
  list.push(card("your year in money", `
    <h1 class="w-title">${esc(date(stats.from))} to ${esc(date(stats.to))}</h1>
    <p class="w-big">${count(stats.income, "round")} <small>came in</small></p>
    <p class="w-big">${count(stats.out, "round")} <small>went out</small></p>`, figureArt()));

  const top = stats.topMerchant;
  if (top && top.visits >= 3) {
    list.push(card("where you went most", `
      <p class="w-big">${count(top.visits, "plain")} <small>times to</small></p>
      <h1 class="w-title">${esc(displayName(top.merchant))}</h1>
      <p class="w-sub">${esc(round(top.total))} altogether, about ${esc(pounds(top.total / top.visits))} a visit</p>`, visitsArt(top.visits)));
  }

  if (stats.byCategory.length) {
    const first = stats.byCategory[0];
    list.push(card("where it went", `
      <h1 class="w-title">${esc(first.category)} took the most</h1>
      <p class="w-big">${count(first.total, "round")} <small>${Math.round((first.total / stats.out) * 100)}% of everything</small></p>`,
    categoryArt(stats.byCategory)));
  }

  if (stats.biggest) {
    list.push(card("your biggest single spend", `
      <p class="w-big">${count(-stats.biggest.amount)}</p>
      <h1 class="w-title">${esc(displayName(stats.biggest.merchant))}</h1>
      <p class="w-sub">on ${esc(dayLabel(stats.biggest.booked_on))}</p>`, receiptArt(stats.biggest)));
  }

  if (stats.months.length >= 3) {
    const peakIndex = stats.months.findIndex((row) => row.month === stats.peak.month);
    list.push(card("month by month", `
      <h1 class="w-title">${esc(monthLabel(stats.peak.month).split(" ")[0])} cost the most</h1>
      <p class="w-big">${count(stats.peak.total, "round")}</p>
      ${stats.quietest ? `<p class="w-sub">${esc(monthLabel(stats.quietest.month).split(" ")[0])} was the quietest: ${esc(round(stats.quietest.total))}</p>` : ""}`,
    columnsArt(stats.months.map((row) => row.total), stats.months.map((row) => monthLabel(row.month)[0]), peakIndex)));
  }

  const day = WEEKDAYS[stats.priciestDay];
  list.push(card("the priciest day of the week", `
    <h1 class="w-title">${esc(day)}s</h1>
    <p class="w-big">${count(stats.weekdays[stats.priciestDay])} <small>on an average ${esc(day)}</small></p>`,
  columnsArt(stats.weekdays, WEEKDAYS.map((name) => name.slice(0, 2)), stats.priciestDay)));

  if (stats.streak && stats.streak.days >= 3) {
    list.push(card("your longest run without eating out", `
      <p class="w-big">${count(stats.streak.days, "plain")} <small>days</small></p>
      <p class="w-sub">${esc(date(stats.streak.from))} to ${esc(date(stats.streak.to))}</p>
      ${stats.eatingOutInShops ? `<p class="w-sub">eating out cost ${esc(round(stats.eatingOut))} all year: about ${stats.eatingOutInShops} of your food shops</p>` : ""}`,
    streakArt(stats.streak.days)));
  }

  if (stats.regular.length) {
    const yearly = stats.regular.reduce((total, row) => total + row.typical * 12, 0);
    list.push(card("every month, like clockwork", `
      <h1 class="w-title">${stats.regular.length} regular ${stats.regular.length === 1 ? "payment" : "payments"}</h1>
      <ul class="w-list">${stats.regular.slice(0, 6).map((row) => `<li><span>${esc(displayName(row.merchant))}</span><span>${esc(pounds(row.typical))} a month</span></li>`).join("")}</ul>
      <p class="w-sub">about ${esc(round(yearly))} a year</p>`, clockworkArt(stats.regular, stats.to)));
  }

  list.push(card("and what was left", `
    <p class="w-big ${stats.left < 0 ? "" : "w-accent"}">${stats.left < 0 ? "-" : ""}${count(Math.abs(stats.left), "round")}</p>
    <p class="w-sub">${stats.left < 0 ? "more went out than came in" : "came in and didn't go out"} across ${stats.payments} payments</p>
    <div class="w-end"><button type="button" class="button" data-w="again">again</button><button type="button" class="button solid" data-w="done">done</button></div>`,
  waveArt()));
  return list;
}

export function render(ctx) {
  const waiting = notReady(ctx.finance);
  if (waiting) return { crumbs: ["wrapped"], html: waiting };
  const stats = yearStats(ctx.finance.transactions);
  if (!stats) {
    return { crumbs: ["wrapped"], html: `<p class="muted">there isn't a month of transactions yet: import a statement first</p>` };
  }
  const deck = cards(stats);
  return {
    crumbs: ["wrapped"],
    html: `
      <div class="wrapped" role="dialog" aria-label="your year, wrapped">
        <div class="w-progress">${deck.map(() => `<span><i></i></span>`).join("")}</div>
        <button type="button" class="w-close" data-w="done" aria-label="close">×</button>
        <div class="w-deck">${deck.join("")}</div>
      </div>`,
    mounted: () => new Deck(ctx, document.querySelector(".wrapped")),
  };
}

class Deck {
  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    this.cards = [...root.querySelectorAll(".w-card")];
    this.bars = [...root.querySelectorAll(".w-progress span")];
    this.index = -1;
    this.timer = null;
    this.onKey = (event) => this.key(event);
    document.addEventListener("keydown", this.onKey);
    document.body.classList.add("wrapped-open");
    root.addEventListener("pointerdown", (event) => this.down(event));
    root.addEventListener("pointerup", (event) => this.up(event));
    root.addEventListener("click", (event) => {
      const choice = event.target.closest("[data-w]")?.dataset.w;
      if (choice === "done") this.leave();
      if (choice === "again") this.show(0);
    });
    this.show(0);
  }

  alive() {
    if (this.root.isConnected) return true;
    clearTimeout(this.timer);
    document.removeEventListener("keydown", this.onKey);
    document.body.classList.remove("wrapped-open");
    return false;
  }

  leave() {
    clearTimeout(this.timer);
    document.removeEventListener("keydown", this.onKey);
    document.body.classList.remove("wrapped-open");
    this.ctx.go("/");
  }

  show(index) {
    if (!this.alive()) return;
    const next = Math.max(0, Math.min(this.cards.length - 1, index));
    this.index = next;
    this.cards.forEach((card, i) => card.classList.toggle("on", i === next));
    this.bars.forEach((bar, i) => {
      bar.className = i < next ? "done" : i === next ? "now" : "";
      // Restart the fill animation on the current one.
      const fill = bar.querySelector("i");
      fill.style.animation = "none";
      void fill.offsetWidth;
      fill.style.animation = "";
    });
    this.root.classList.toggle("last", next === this.cards.length - 1);
    this.countUp(this.cards[next]);
    clearTimeout(this.timer);
    if (!still() && next < this.cards.length - 1) {
      this.root.style.setProperty("--auto", `${AUTO_MS}ms`);
      this.timer = setTimeout(() => this.show(this.index + 1), AUTO_MS);
    }
  }

  countUp(card) {
    for (const element of card.querySelectorAll(".count")) {
      const target = Number(element.dataset.to);
      const kind = element.dataset.kind;
      const format = (value) => (kind === "pounds" ? pounds(value) : kind === "round" ? round(value) : String(Math.round(value)));
      if (still()) {
        element.textContent = format(target);
        continue;
      }
      const started = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - started) / COUNT_MS);
        const eased = 1 - (1 - t) ** 3;
        element.textContent = format(t === 1 ? target : target * eased);
        if (t < 1 && element.isConnected) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }

  key(event) {
    if (!this.alive()) return;
    if (event.key === "ArrowRight" || event.key === " ") this.show(this.index + 1);
    else if (event.key === "ArrowLeft") this.show(this.index - 1);
    else if (event.key === "Escape") this.leave();
    else return;
    event.preventDefault();
  }

  // Holding a finger (or the mouse) down pauses; a swipe or a tap moves.
  down(event) {
    if (event.target.closest("button")) return;
    this.start = { x: event.clientX, y: event.clientY, time: Date.now() };
    clearTimeout(this.timer);
    this.root.classList.add("paused");
  }

  up(event) {
    this.root.classList.remove("paused");
    const start = this.start;
    this.start = null;
    if (!start || event.target.closest("button")) return;
    const dx = event.clientX - start.x;
    const held = Date.now() - start.time > 400;
    if (Math.abs(dx) > 50) return this.show(this.index + (dx < 0 ? 1 : -1));
    if (held) return this.show(this.index);
    const back = event.clientX < this.root.getBoundingClientRect().width * 0.3;
    this.show(this.index + (back ? -1 : 1));
  }
}
