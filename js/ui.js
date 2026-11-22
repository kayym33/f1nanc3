// Small helpers for building the views' HTML (from t1ld3's phone/js/ui.js).

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// Everything from a statement or typed by the user goes through this
// before it's put in HTML.
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

export function heading(text) {
  return `<h2>${esc(text)}</h2>`;
}

// data-* attributes for a tappable element: action("tx-open", {id}).
export function action(name, data = {}) {
  const attributes = Object.entries(data).map(([key, value]) => ` data-${key}="${esc(value)}"`).join("");
  return `data-action="${esc(name)}"${attributes}`;
}

export function button(label, name, data = {}, { solid = false, small = false } = {}) {
  const classes = ["button", solid ? "solid" : "", small ? "small" : ""].filter(Boolean).join(" ");
  return `<button type="button" class="${classes}" ${action(name, data)}>${esc(label)}</button>`;
}

// A text bar like t1ld3's battery and progress meters: ████████░░░░
export function bar(fraction, width = 12) {
  const filled = Math.max(0, Math.min(width, Math.round(fraction * width)));
  return `<span class="bar-fill">${"█".repeat(filled)}</span><span class="bar-empty">${"░".repeat(width - filled)}</span>`;
}

// The loading and error states every data view shares; null when ready.
export function notReady(finance) {
  if (finance.state === "error") {
    return `<p class="error">${esc(finance.error)}</p><div class="row-buttons">${button("try again", "reload")}</div>`;
  }
  if (finance.state !== "ready") return `<p class="muted">loading...</p>`;
  return null;
}

// A laptop or desktop: the sidebar layout (style.css uses the same width).
export const WIDE = "(min-width: 900px)";
export const wide = () => matchMedia(WIDE).matches;
