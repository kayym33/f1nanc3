// Privacy mode: every amount blurred until it's switched off, on this
// device. Amounts are found wherever they're drawn ("£1,234.56", "−£80",
// "£2k"): text in the page is wrapped in <span class="money">, chart text
// gets class="money", and style.css blurs or hides them while
// <body class="private">. A watcher catches what's drawn later (charts,
// tooltips). The river's canvas asks isPrivate() itself.

const KEY = "f1nanc3.private";
// £ followed by digits, with an optional sign and a k for thousands.
const MONEY = /[−+-]?£[\d,]+(?:\.\d+)?k?/g;

export function isPrivate() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setPrivate(on) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // Storage is off: it lasts until the page closes.
  }
  document.body.classList.toggle("private", on);
}

function wrapText(node) {
  const text = node.nodeValue;
  MONEY.lastIndex = 0;
  if (!MONEY.test(text)) return;
  const parent = node.parentNode;
  if (!parent || parent.closest?.(".money, script, style, textarea, input")) return;
  // Inside an SVG, mark the whole <text>: a span can't go there.
  if (parent.namespaceURI === "http://www.w3.org/2000/svg") {
    parent.classList.add("money");
    return;
  }
  const fragment = document.createDocumentFragment();
  let last = 0;
  MONEY.lastIndex = 0;
  for (const match of text.matchAll(MONEY)) {
    if (match.index > last) fragment.append(text.slice(last, match.index));
    const span = document.createElement("span");
    span.className = "money";
    span.textContent = match[0];
    fragment.append(span);
    last = match.index + match[0].length;
  }
  if (last < text.length) fragment.append(text.slice(last));
  parent.replaceChild(fragment, node);
}

export function markMoney(root) {
  if (root.nodeType === Node.TEXT_NODE) return wrapText(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node);
  texts.forEach(wrapText);
}

// Marks amounts now and whenever more are drawn.
export function watchMoney() {
  document.body.classList.toggle("private", isPrivate());
  markMoney(document.body);
  new MutationObserver((changes) => {
    for (const change of changes) {
      for (const node of change.addedNodes) markMoney(node);
      if (change.type === "characterData") markMoney(change.target);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
