// Day, night, or auto (follow the device). Kept on each device, not
// synced. index.html applies it before the page draws, so it doesn't
// flash the other theme; this keeps it applied after a change.
export const THEMES = ["auto", "day", "night"];
const KEY = "f1nanc3.theme";
const COLOURS = { day: "#E7E7DD", night: "#121311" };

export function theme() {
  try {
    const saved = localStorage.getItem(KEY);
    return THEMES.includes(saved) ? saved : "auto";
  } catch {
    return "auto";
  }
}

export function isNight() {
  const chosen = theme();
  return chosen === "night" || (chosen === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
}

export function applyTheme() {
  const chosen = theme();
  const root = document.documentElement;
  if (chosen === "auto") delete root.dataset.theme;
  else root.dataset.theme = chosen;
  const colour = COLOURS[isNight() ? "night" : "day"];
  root.style.background = colour;
  // The browser's and iPhone's bar colour.
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.content = colour;
}

export function setTheme(choice) {
  try {
    if (choice === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Storage is off: the choice lasts until the page closes.
  }
  applyTheme();
}
