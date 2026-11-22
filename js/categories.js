// The categories, working out who a payment was to (the merchant), and
// guessing a category for it. No UI code.

// In display order. `income` and `transfers` aren't spending: transfers
// (money between your own accounts) are left out of every total.
export const CATEGORIES = [
  "groceries", "eating out", "transport", "bills", "shopping",
  "entertainment", "health", "cash", "other", "income", "transfers",
];
export const NOT_SPENDING = new Set(["income", "transfers"]);

// Words in a merchant's name that place it, matched at the start of a
// word ("sainsbury" finds "sainsburys"). A trailing space means the whole
// word only, so "bt " doesn't find "btec" and "bar " doesn't find
// "barclays". First match wins.
const KEYWORDS = [
  ["groceries", ["tesco", "sainsbury", "asda", "aldi", "lidl", "morrisons", "co-op", "coop ", "co op ",
    "waitrose", "iceland", "m&s food", "marks spencer simply food", "ocado", "farmfoods", "spar ", "scotmid",
    "costcutter", "nisa ", "premier ", "one stop", "budgens", "londis"]],
  ["eating out", ["deliveroo", "just eat", "uber eats", "ubereats", "mcdonalds", "mcdonald's", "greggs", "costa",
    "starbucks", "pret ", "nando", "kfc", "burger king", "subway", "domino", "pizza hut", "wagamama", "five guys",
    "caffe nero", "cafe ", "coffee", "restaurant", "bar ", "pub ", "taco bell", "leon ", "itsu", "wasabi", "tim hortons"]],
  ["transport", ["tfl ", "trainline", "scotrail", "lner ", "avanti", "lothian", "first bus", "stagecoach",
    "uber ", "bolt ", "shell ", "bp ", "esso", "texaco", "gulf ", "parking", "ringgo", "paybyphone", "national rail",
    "citylink", "megabus", "easyjet", "ryanair", "jet2", "british airways", "loganair", "petrol"]],
  ["bills", ["council tax", "octopus", "edf ", "british gas", "scottish power", "sse ", "ovo ", "e.on", "eon ",
    "bulb", "scottish water", "thames water", "ee ", "vodafone", "o2 ", "three ", "giffgaff", "virgin media",
    "bt ", "sky ", "talktalk", "plusnet", "tv licen", "insurance", "rent ", "mortgage", "lebara", "smarty", "voxi"]],
  ["entertainment", ["netflix", "spotify", "disney", "prime video", "apple.com", "steam ", "playstation",
    "xbox ", "nintendo", "cinema", "odeon", "vue ", "cineworld", "ticketmaster", "see tickets", "youtube",
    "twitch", "patreon", "audible", "now tv", "crunchyroll"]],
  ["health", ["boots ", "superdrug", "pharmacy", "chemist", "dentist", "dental", "optician", "specsavers",
    "vision express", "gym ", "puregym", "pure gym", "the gym", "nhs ", "lloyds pharmacy"]],
  ["shopping", ["amazon", "amzn", "argos", "ebay", "ikea", "primark", "h&m", "zara", "uniqlo", "next ",
    "john lewis", "currys", "asos", "etsy", "tk maxx", "b&m", "home bargains", "poundland", "wilko",
    "the range", "shein", "vinted", "apple store"]],
];

// Card payment prefixes RBS puts before the merchant: the card's last 4
// digits and the date, sometimes followed by C, D or CD ("4378 31OCT25 CD").
const CARD_PREFIX = /^\d{4}\s+\d{1,2}[A-Z]{3}\d{2}(\s+[A-Z]{1,2})?$/i;
// RBS online payments between accounts: "To A/C 12345678 , ... , Via Mobile Xfer".
const ACCOUNT_PAYMENT = /^(to|from)\s+a\/c\s*(\d{4,})/i;

function isReference(word) {
  const digits = word.replace(/\D/g, "").length;
  return /^[\d.:/-]+$/.test(word) || digits >= 3 || (digits >= 2 && word.length >= 5);
}

// Who a payment was to, as a short lowercase key: "tesco stores",
// "octopus energy", "paypal netflix", "to a/c …5678". Corrections are
// remembered by this, so it has to come out the same for every payment to
// the same place. `type` is RBS's payment type (POS, DPC, INT...).
export function merchantOf(description, type = "") {
  const text = description.replace(/^'+/, "").trim();
  if (type.replace(/^'+/, "").trim().toUpperCase() === "INT") return "interest";
  // Payments to and from an account are told apart by its number.
  const account = text.match(ACCOUNT_PAYMENT);
  if (account) return `${account[1].toLowerCase()} a/c …${account[2].slice(-4)}`;
  const parts = text.split(/\s*,\s*/).map((part) => part.trim()).filter(Boolean);
  const named = parts.find((part) => !CARD_PREFIX.test(part) && /[a-z]{2}/i.test(part)) ?? text;
  const words = named
    .toLowerCase()
    .replace(/[*_/\\|#]+/g, " ")
    .split(/\s+/)
    // Store numbers, references and dates say nothing about who it was,
    // but names like "o2" and "jet2" have a digit too.
    .filter((word) => word && !isReference(word))
    .map((word) => word.replace(/^[^a-z0-9&]+|[^a-z0-9&'.]+$/g, ""))
    .filter(Boolean);
  // A trailing country code ("edinburgh gb") is the card network's.
  while (words.length > 1 && ["gb", "gbr", "uk", "ie", "irl"].includes(words.at(-1))) words.pop();
  const merchant = words.slice(0, 3).join(" ");
  return merchant || text.toLowerCase().slice(0, 30) || "unknown";
}

function matches(merchant, keyword) {
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const end = keyword.endsWith(" ") ? "($|[^a-z])" : "";
  return new RegExp(`(^|[^a-z])${escaped}${end}`).test(merchant);
}

// {category, source}: a remembered rule first, then RBS transfers between
// your own accounts (TFR: round-ups and the like), then cash machines,
// then the keyword list, then income for money in, then "other".
export function guessCategory({ merchant, type = "", amount }, rules = new Map()) {
  if (rules.has(merchant)) return { category: rules.get(merchant), source: "rule" };
  const kind = type.replace(/^'+/, "").trim().toUpperCase();
  if (kind === "TFR") return { category: "transfers", source: "auto" };
  if (kind === "C/L" || kind === "ATM" || /^(cash|atm)\b/.test(merchant)) return { category: "cash", source: "auto" };
  if (amount > 0) return { category: "income", source: "auto" };
  for (const [category, keywords] of KEYWORDS) {
    if (keywords.some((keyword) => matches(merchant, keyword))) return { category, source: "auto" };
  }
  return { category: "other", source: "auto" };
}

// "tesco stores" -> "Tesco Stores", for lists.
export function displayName(merchant) {
  return merchant.replace(/(^|\s)([a-z])/g, (_, space, letter) => space + letter.toUpperCase());
}
