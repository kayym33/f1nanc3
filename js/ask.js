// The command line (#/ask): questions typed in plain-ish English, read
// with a fixed vocabulary and answered from the transactions in memory.
// No UI code, and nothing leaves the device: there's no AI here, only
// these words. Anything it doesn't know is taken as a shop's name.
//
//   how much did i spend on coffee since june
//   biggest spend this year · top 10 shopping · most expensive last month
//   where do i spend the most · top places this year
//   spending by category last month · breakdown this year
//   tesco vs aldi · uber compared to bolt this year
//   income this year · what came in last month
//   help
//
// Filler ("how much did i spend on") is skipped, everyday words
// (coffee, takeaway, rent, phone...) mean the usual places, and other
// names for categories (food shop, restaurants, travel, fun...) mean the
// category. Transfers between your own accounts are left out unless you
// ask for "transfers".
import { CATEGORIES } from "./categories.js";
import { addMonths, isoDate, monthOf, sum } from "./money.js";

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december"];

// Everyday words that mean a few places: matched like the category
// keywords, at the start of a word in the merchant. A trailing space
// means the whole word only.
const PLACES = {
  coffee: ["costa", "starbucks", "pret ", "caffe nero", "nero", "coffee", "cafe", "tim hortons", "black sheep", "joe & the juice"],
  takeaway: ["deliveroo", "just eat", "uber eats", "ubereats", "dominos", "domino", "pizza hut", "papa john"],
  "fast food": ["mcdonald", "kfc", "burger king", "greggs", "subway", "five guys", "taco bell", "wendy"],
  fuel: ["shell ", "bp ", "esso", "texaco", "gulf ", "petrol"],
  taxi: ["uber ", "bolt ", "taxi", "cab ", "free now"],
  train: ["trainline", "scotrail", "lner", "avanti", "national rail", "gwr", "northern", "crosscountry"],
  bus: ["lothian", "first bus", "stagecoach", "citylink", "megabus", "arriva", "national express"],
  flight: ["easyjet", "ryanair", "jet2", "british airways", "loganair", "wizz", "tui "],
  parking: ["parking", "ringgo", "paybyphone", "ncp "],
  streaming: ["netflix", "spotify", "disney", "prime video", "now tv", "crunchyroll", "youtube", "apple tv", "paramount"],
  music: ["spotify", "apple music", "tidal", "deezer", "bandcamp"],
  games: ["steam ", "playstation", "xbox", "nintendo", "epic games", "riot ", "blizzard"],
  cinema: ["odeon", "vue ", "cineworld", "picturehouse", "everyman", "cinema"],
  gym: ["gym ", "puregym", "pure gym", "the gym", "david lloyd", "nuffield", "anytime fitness"],
  phone: ["ee ", "vodafone", "o2 ", "three ", "giffgaff", "lebara", "smarty", "voxi", "tesco mobile", "id mobile"],
  internet: ["virgin media", "bt ", "sky ", "plusnet", "talktalk", "hyperoptic", "community fibre", "vodafone broadband"],
  energy: ["octopus", "edf ", "british gas", "scottish power", "sse ", "ovo ", "e.on", "eon ", "bulb"],
  water: ["scottish water", "thames water", "anglian water", "severn trent", "united utilities", "yorkshire water"],
  "council tax": ["council tax", "council"],
  rent: ["rent ", "letting", "lettings", "landlord", "estate agent"],
  insurance: ["insurance", "aviva", "admiral", "direct line", "churchill", "lv ", "vitality"],
  amazon: ["amazon", "amzn"],
  clothes: ["primark", "h&m", "zara", "uniqlo", "next ", "asos", "tk maxx", "shein", "vinted", "new look", "river island", "jd sports"],
  pharmacy: ["boots ", "superdrug", "pharmacy", "chemist", "lloyds pharmacy"],
  booze: ["off licence", "majestic", "bargain booze", "brewdog", "pub ", "bar "],
  pets: ["pets at home", "jollyes", "vets", "vet "],
};
// Other spellings of those words.
const PLACE_WORDS = {
  coffees: "coffee", cafe: "coffee", cafes: "coffee", "coffee shops": "coffee",
  takeaways: "takeaway", "take away": "takeaway", "take aways": "takeaway", delivery: "takeaway", deliveries: "takeaway",
  mcdonalds: "fast food", "junk food": "fast food",
  petrol: "fuel", diesel: "fuel", gas: "energy",
  taxis: "taxi", cabs: "taxi", ubers: "taxi",
  trains: "train", rail: "train", railway: "train",
  buses: "bus",
  flights: "flight", flying: "flight", planes: "flight", airlines: "flight",
  films: "cinema", movies: "cinema", "the cinema": "cinema",
  gaming: "games", "video games": "games",
  gyms: "gym", fitness: "gym",
  mobile: "phone", phones: "phone", "phone bill": "phone",
  broadband: "internet", wifi: "internet",
  electric: "energy", electricity: "energy", heating: "energy",
  clothing: "clothes",
  alcohol: "booze", drinks: "booze", drinking: "booze",
  pet: "pets", vet: "pets",
};

// Other names for the categories.
const CATEGORY_WORDS = {
  groceries: "groceries", grocery: "groceries", "food shop": "groceries", "food shopping": "groceries",
  "food shops": "groceries", supermarket: "groceries", supermarkets: "groceries", "big shop": "groceries",
  "eating out": "eating out", "eat out": "eating out", "dining out": "eating out", "meals out": "eating out",
  restaurant: "eating out", restaurants: "eating out", "food out": "eating out", "eating": "eating out",
  transport: "transport", travel: "transport", travelling: "transport", "getting around": "transport", commute: "transport", commuting: "transport",
  bills: "bills", bill: "bills", utilities: "bills", "direct debits": "bills",
  shopping: "shopping",
  entertainment: "entertainment", fun: "entertainment", leisure: "entertainment", hobbies: "entertainment",
  health: "health", medical: "health", healthcare: "health", doctor: "health", dentist: "health",
  cash: "cash", atm: "cash", cashpoint: "cash", withdrawals: "cash", "cash machine": "cash",
  other: "other", misc: "other", miscellaneous: "other", uncategorised: "other", uncategorized: "other",
  income: "income", earnings: "income", earned: "income", wages: "income", salary: "income", "paid in": "income",
  "money in": "income", "came in": "income", earn: "income", earnt: "income", "make": "income", made: "income", "paid me": "income", "comes in": "income", "got paid": "income", payday: "income",
  transfers: "transfers", transfer: "transfers", "between accounts": "transfers",
};

// Ways of asking for the biggest payments, the top places, or a split by category.
const BIGGEST = ["biggest", "largest", "highest", "priciest", "dearest", "most expensive", "most costly", "big", "large", "expensive", "top"];
const PLACES_ASKS = ["where", "places", "shops", "stores", "merchants", "who", "most at", "most places", "favourite", "favorite"];
const CATEGORIES_ASKS = ["by category", "by categories", "categories", "breakdown", "split", "per category", "each category", "every category"];
const VS = ["vs", "versus", "compared to", "compared with", "against", "vs."];
const HELP_ASKS = ["help", "?", "commands", "what can i ask", "what can i say", "examples"];

// Words that say nothing about what to look for.
const FILLER = new Set(("i i've ive im i'm my me mine we our us you your did do does done how much many what what's whats " +
  "which was were is are am be been being the a an on at for to of in into from by with and or all any so far total totals " +
  "spend spent spending spends spender pay paid paying payment payments purchase purchases transaction transactions money " +
  "cost costs costed buy bought buying get got show list give tell see have has had ever things stuff thing item items " +
  "please can could would there out go went gone now just only about overall altogether every each per sum amount " +
  "number count average avg times often usually lot lots most more than that this those these it its ones one " +
  "find look search tally whole entire up till until so far yet okay ok hey hi everything anything overall").split(" "));

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20 };

export const HELP = [
  ["how much on coffee since june", "a thing, from a month"],
  ["biggest spend this year", "the largest payments out"],
  ["top 10 shopping last month", "the largest in one category"],
  ["where do i spend the most", "your top places"],
  ["by category last month", "the split across categories"],
  ["tesco vs aldi this year", "two side by side"],
  ["income this year", "what came in"],
  ["takeaway last 3 months", "also weeks, days, years"],
  ["rent in october", "one month (or: in 2026, yesterday, last week)"],
];
// The everyday words, for help.
export const PLACE_NAMES = Object.keys(PLACES);

const round = (value) => Math.round(value * 100) / 100;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function monthIndex(word) {
  if (!word || word.length < 3) return -1;
  return MONTH_NAMES.findIndex((name) => name.startsWith(word));
}

// The most recent month with this name that isn't in the future
// ("june" in November 2026 is 2026-06; in March 2026 it's 2025-06),
// unless a year is given.
function namedMonth(index, year, today) {
  if (year) return `${year}-${String(index + 1).padStart(2, "0")}`;
  const current = monthOf(today);
  let month = `${today.getFullYear()}-${String(index + 1).padStart(2, "0")}`;
  if (month > current) month = addMonths(month, -12);
  return month;
}

const lastDay = (month) => {
  const [year, number] = month.split("-").map(Number);
  return `${month}-${String(new Date(year, number, 0).getDate()).padStart(2, "0")}`;
};

const mondayOf = (date) => {
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return monday;
};

// Finds a time phrase in the words: {from, to, label, rest} (dates are
// ISO, inclusive; null means open), or the words unchanged with no limits.
export function parseTime(words, today = new Date()) {
  const take = (start, length, range) => ({ ...range, rest: [...words.slice(0, start), ...words.slice(start + length)] });
  const yearAt = (i) => (/^20\d\d$/.test(words[i] ?? "") ? words[i] : null);
  const year = today.getFullYear();
  for (let i = 0; i < words.length; i++) {
    const [a, b, c] = [words[i], words[i + 1], words[i + 2]];
    const recent = a === "last" || a === "past" || a === "previous";
    if ((a === "this" || recent) && b === "month") {
      const month = a === "this" ? monthOf(today) : addMonths(monthOf(today), -1);
      return take(i, 2, { from: `${month}-01`, to: a === "this" ? null : lastDay(month), label: a === "this" ? "this month" : "last month" });
    }
    if (a === "this" && b === "week") return take(i, 2, { from: isoDate(mondayOf(today)), to: null, label: "this week" });
    if (recent && b === "week") {
      const monday = mondayOf(today);
      monday.setDate(monday.getDate() - 7);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return take(i, 2, { from: isoDate(monday), to: isoDate(sunday), label: "last week" });
    }
    if (a === "this" && b === "year") return take(i, 2, { from: `${year}-01-01`, to: null, label: "this year" });
    if (a === "ytd") return take(i, 1, { from: `${year}-01-01`, to: null, label: "this year" });
    if (recent && b === "year") return take(i, 2, { from: `${year - 1}-01-01`, to: `${year - 1}-12-31`, label: "last year" });
    if (a === "today") return take(i, 1, { from: isoDate(today), to: null, label: "today" });
    if (a === "yesterday") {
      const day = new Date(today);
      day.setDate(today.getDate() - 1);
      return take(i, 1, { from: isoDate(day), to: isoDate(day), label: "yesterday" });
    }
    const count = /^\d+$/.test(b ?? "") ? Number(b) : NUMBER_WORDS[b];
    if (recent && count && /^(days?|weeks?|months?|years?)$/.test(c ?? "")) {
      const from = new Date(today);
      if (c.startsWith("day")) from.setDate(today.getDate() - count + 1);
      else if (c.startsWith("week")) from.setDate(today.getDate() - count * 7 + 1);
      else if (c.startsWith("month")) from.setMonth(today.getMonth() - count);
      else from.setFullYear(today.getFullYear() - count);
      return take(i, 3, { from: isoDate(from), to: null, label: `last ${count} ${c}` });
    }
    if ((a === "since" || a === "in" || a === "from" || a === "during") && monthIndex(b) >= 0) {
      const given = yearAt(i + 2);
      const month = namedMonth(monthIndex(b), given, today);
      const name = MONTH_NAMES[monthIndex(b)];
      const length = given ? 3 : 2;
      if (a === "since" || a === "from") return take(i, length, { from: `${month}-01`, to: null, label: `since ${name}${given ? ` ${given}` : ""}` });
      return take(i, length, { from: `${month}-01`, to: lastDay(month), label: `in ${name}${given ? ` ${given}` : ""}` });
    }
    if ((a === "since" || a === "from") && /^20\d\d$/.test(b ?? "")) return take(i, 2, { from: `${b}-01-01`, to: null, label: `since ${b}` });
    if ((a === "in" || a === "during") && /^20\d\d$/.test(b ?? "")) return take(i, 2, { from: `${b}-01-01`, to: `${b}-12-31`, label: `in ${b}` });
    if (/^20\d\d$/.test(a)) return take(i, 1, { from: `${a}-01-01`, to: `${a}-12-31`, label: `in ${a}` });
    // A month named on its own: "coffee june".
    if (monthIndex(a) >= 0 && a.length >= 3 && MONTH_NAMES[monthIndex(a)].startsWith(a) && (a.length >= 4 || ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec"].includes(a))) {
      const given = yearAt(i + 1);
      const month = namedMonth(monthIndex(a), given, today);
      return take(i, given ? 2 : 1, { from: `${month}-01`, to: lastDay(month), label: `in ${MONTH_NAMES[monthIndex(a)]}${given ? ` ${given}` : ""}` });
    }
  }
  return { from: null, to: null, label: null, rest: words };
}

function hasWord(merchant, keyword) {
  const end = keyword.endsWith(" ") ? "($|[^a-z])" : "";
  return new RegExp(`(^|[^a-z])${escapeRegex(keyword.trim())}${end}`).test(merchant);
}

// What a search term matches: a category's name, an everyday word from
// PLACES, or else every word somewhere in the merchant, the bank's
// description or the category. Nothing typed matches everything.
export function matcher(term) {
  const text = term.trim();
  if (!text) return () => true;
  if (CATEGORIES.includes(text)) return (t) => t.category === text;
  if (PLACES[text]) return (t) => PLACES[text].some((keyword) => hasWord(t.merchant, keyword));
  const words = text.split(/\s+/);
  return (t) => {
    const haystack = `${t.merchant} ${t.description ?? ""} ${t.category}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  };
}

function within(range) {
  return (t) => (!range.from || t.booked_on >= range.from) && (!range.to || t.booked_on <= range.to);
}

// The transactions a term and a range pick out; transfers only when asked.
function pick(transactions, term, range) {
  const matches = matcher(term);
  const inRange = within(range);
  const wantsTransfers = term.trim() === "transfers";
  return transactions.filter((t) => inRange(t) && (wantsTransfers || t.category !== "transfers") && matches(t));
}

const spent = (list) => round(-sum(list.filter((t) => t.amount < 0).map((t) => t.amount)));
const received = (list) => round(sum(list.filter((t) => t.amount > 0).map((t) => t.amount)));

// Month by month, oldest first, from the range's start (or the first
// match) to its end (or this month): at most 13.
function perMonth(list, range, today) {
  if (!list.length) return [];
  const first = range.from ? range.from.slice(0, 7) : list.map((t) => t.booked_on).sort()[0].slice(0, 7);
  const last = range.to ? range.to.slice(0, 7) : monthOf(today);
  const months = [];
  for (let month = first; month <= last && months.length < 13; month = addMonths(month, 1)) months.push(month);
  return months.map((month) => ({ month, out: spent(list.filter((t) => t.booked_on.startsWith(month))) }));
}

function topMerchants(list, count = 3) {
  const totals = new Map();
  for (const t of list) {
    if (t.amount >= 0) continue;
    const entry = totals.get(t.merchant) ?? { merchant: t.merchant, total: 0, count: 0 };
    entry.total = round(entry.total - t.amount);
    entry.count++;
    totals.set(t.merchant, entry);
  }
  return [...totals.values()].sort((a, b) => b.total - a.total).slice(0, count);
}

const newestFirst = (a, b) => (a.booked_on < b.booked_on ? 1 : a.booked_on > b.booked_on ? -1 : 0);

// Phrases first (longest first), so "eating out" or "most expensive"
// become one token before single words are looked at.
const PHRASES = [
  ...Object.keys(CATEGORY_WORDS).map((phrase) => [phrase, `@cat:${CATEGORY_WORDS[phrase].replace(/ /g, "_")}`]),
  ...Object.keys(PLACE_WORDS).map((phrase) => [phrase, `@place:${PLACE_WORDS[phrase].replace(/ /g, "_")}`]),
  ...Object.keys(PLACES).map((phrase) => [phrase, `@place:${phrase.replace(/ /g, "_")}`]),
  ...BIGGEST.map((phrase) => [phrase, "@biggest"]),
  ...PLACES_ASKS.map((phrase) => [phrase, "@places"]),
  ...CATEGORIES_ASKS.map((phrase) => [phrase, "@cats"]),
  ...VS.map((phrase) => [phrase, "@vs"]),
].sort((a, b) => b[0].length - a[0].length);
const PHRASE_PATTERN = new RegExp(`(^|\\s)(${PHRASES.map(([phrase]) => escapeRegex(phrase)).join("|")})(?=\\s|$)`, "g");
const PHRASE_TOKEN = new Map(PHRASES);

// The words of a question, phrases joined into @tokens.
export function tokens(text) {
  const clean = String(text).toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9&'.\s-]/g, " ")
    .split(/\s+/).map((word) => word.replace(/^['.-]+|['.-]+$/g, "")).filter(Boolean).join(" ");
  return clean.replace(PHRASE_PATTERN, (_, space, phrase) => `${space}${PHRASE_TOKEN.get(phrase)}`).split(" ").filter(Boolean);
}

// What's left to look for: categories and everyday words by name, other
// words as typed, filler dropped.
function termOf(words) {
  const kept = words.filter((word) => !FILLER.has(word) && !word.startsWith("@biggest") && word !== "@places" && word !== "@cats");
  const category = kept.find((word) => word.startsWith("@cat:"));
  const place = kept.find((word) => word.startsWith("@place:"));
  const plain = kept.filter((word) => !word.startsWith("@"));
  // A shop's name with a category ("tesco groceries"): the name decides.
  if (plain.length) return plain.join(" ");
  if (place) return place.slice(7).replace(/_/g, " ");
  if (category) return category.slice(5).replace(/_/g, " ");
  return "";
}

// The answer to one line: {kind: "help" | "search" | "vs" | "biggest" |
// "places" | "categories" | "empty", ...}. Never throws on odd input.
export function ask(text, transactions, today = new Date()) {
  const raw = String(text).toLowerCase().trim();
  if (!raw) return { kind: "empty" };
  if (HELP_ASKS.some((phrase) => raw === phrase || raw.startsWith(`${phrase} `) || raw === `${phrase}?`)) return { kind: "help" };
  const words = tokens(raw);
  if (!words.length) return { kind: "empty" };
  const { rest, ...range } = parseTime(words, today);
  const when = range.label;

  const vs = rest.indexOf("@vs");
  if (vs > 0 && vs < rest.length - 1) {
    const sides = [termOf(rest.slice(0, vs)), termOf(rest.slice(vs + 1))].map((term) => {
      const list = pick(transactions, term, range);
      return { term: term || "everything", out: spent(list), count: list.filter((t) => t.amount < 0).length };
    });
    return { kind: "vs", when, sides };
  }

  const number = rest.map((word) => (/^\d+$/.test(word) ? Number(word) : NUMBER_WORDS[word])).find(Boolean);
  const withoutNumber = rest.filter((word) => !/^\d+$/.test(word) && !NUMBER_WORDS[word]);
  const term = termOf(withoutNumber);

  if (rest.includes("@cats")) {
    const list = pick(transactions, term, range).filter((t) => t.amount < 0);
    const rows = CATEGORIES.filter((category) => category !== "income" && category !== "transfers")
      .map((category) => ({ category, total: spent(list.filter((t) => t.category === category)) }))
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total);
    return { kind: "categories", when, term, rows, total: spent(list) };
  }

  if (rest.includes("@places")) {
    const count = Math.min(20, Math.max(1, number ?? 10));
    const list = pick(transactions, term, range).filter((t) => t.category !== "income");
    return { kind: "places", when, term, count, rows: topMerchants(list, count) };
  }

  if (rest.includes("@biggest")) {
    const count = Math.min(20, Math.max(1, number ?? 5));
    const rows = pick(transactions, term, range)
      .filter((t) => t.amount < 0 && t.category !== "transfers")
      .sort((a, b) => a.amount - b.amount || newestFirst(a, b))
      .slice(0, count);
    return { kind: "biggest", count, term, when, rows };
  }

  const list = pick(transactions, term, range);
  const outgoing = list.filter((t) => t.amount < 0);
  return {
    kind: "search",
    term,
    when,
    count: list.length,
    out: spent(list),
    in: received(list),
    average: outgoing.length ? round(spent(list) / outgoing.length) : 0,
    months: perMonth(list, range, today),
    top: topMerchants(list),
    recent: [...list].sort(newestFirst).slice(0, 5),
  };
}
