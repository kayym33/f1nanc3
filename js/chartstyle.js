// How the charts look, chosen in settings and kept on each device:
//   terminal     area lines, values on the right, price tags, a crosshair;
//                ink and orange (the default)
//   terminal-rg  the same in finance green and red (colour-blind-safe pair)
//   soft         rounded bars and thicker lines, like a banking app
// style.css colours each one from <html data-charts>.
export const CHART_STYLES = [["terminal", "terminal"], ["terminal-rg", "green/red"], ["soft", "soft"]];
const KEY = "f1nanc3.chartStyle";

export function chartStyle() {
  try {
    const saved = localStorage.getItem(KEY);
    return CHART_STYLES.some(([name]) => name === saved) ? saved : "terminal";
  } catch {
    return "terminal";
  }
}

export function applyChartStyle() {
  document.documentElement.dataset.charts = chartStyle();
}

export function setChartStyle(name) {
  try {
    if (name === "terminal") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, name);
  } catch {
    // Storage is off: the choice lasts until the page closes.
  }
  applyChartStyle();
}
