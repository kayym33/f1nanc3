// The PIN lock, on this device. No UI code.
//
// The PIN is never stored: only a salted PBKDF2 hash of it (200,000 rounds
// of SHA-256), so reading this browser's storage doesn't give it away
// easily. While a PIN is set, the app shows nothing and loads nothing
// until it's entered; it locks again after LOCK_AFTER_MS in the
// background. Wrong guesses are counted across reloads: after
// SLOW_AFTER, each one waits WAIT_MS; after SIGN_OUT_AFTER, the app signs
// out (and forgets the PIN), so only your password gets back in.
//
// This keeps out someone holding your unlocked phone or laptop. It isn't
// a vault: the sign-in itself lives in this browser, and your password
// (and Supabase's row-level security) is what protects the data.

const KEY = "f1nanc3.pin";
const FAILS_KEY = "f1nanc3.pinFails";
const UNLOCKED_KEY = "f1nanc3.unlockedAt";
const ITERATIONS = 200000;
export const LOCK_AFTER_MS = 5 * 60 * 1000;
export const SLOW_AFTER = 5;
export const SIGN_OUT_AFTER = 10;
export const WAIT_MS = 30 * 1000;

const read = (store, key) => {
  try {
    return JSON.parse(store.getItem(key));
  } catch {
    return null;
  }
};
const write = (store, key, value) => {
  try {
    if (value === null) store.removeItem(key);
    else store.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is off: the lock lasts until the page closes.
  }
};

const hex = (bytes) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");

export async function hashPin(pin, salt, iterations = ITERATIONS) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations }, material, 256);
  return hex(bits);
}

export const validPin = (pin) => /^\d{4,6}$/.test(pin);

export function hasPin() {
  return Boolean(read(localStorage, KEY)?.hash);
}

export async function setPin(pin) {
  if (!validPin(pin)) throw new Error("a PIN is 4 to 6 digits");
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  write(localStorage, KEY, { salt, hash: await hashPin(pin, salt), iterations: ITERATIONS, length: pin.length });
  write(localStorage, FAILS_KEY, null);
  markUnlocked();
}

export function clearPin() {
  write(localStorage, KEY, null);
  write(localStorage, FAILS_KEY, null);
  write(sessionStorage, UNLOCKED_KEY, null);
}

// How many digits the PIN has, so the dots match.
export function pinLength() {
  return read(localStorage, KEY)?.length ?? 4;
}

// {fails, waitUntil}: how many wrong guesses so far, and when the next is allowed.
export function attempts() {
  return read(localStorage, FAILS_KEY) ?? { fails: 0, waitUntil: 0 };
}

// "ok", "wrong", "wait" (too soon after too many) or "signout" (too many).
export async function checkPin(pin, now = Date.now()) {
  const stored = read(localStorage, KEY);
  if (!stored) return "ok";
  const tries = attempts();
  if (tries.waitUntil > now) return "wait";
  if (await hashPin(pin, stored.salt, stored.iterations) === stored.hash) {
    write(localStorage, FAILS_KEY, null);
    markUnlocked(now);
    return "ok";
  }
  const fails = tries.fails + 1;
  if (fails >= SIGN_OUT_AFTER) return "signout";
  write(localStorage, FAILS_KEY, { fails, waitUntil: fails >= SLOW_AFTER ? now + WAIT_MS : 0 });
  return "wrong";
}

// Unlocked "as of now" for this tab: a reload within LOCK_AFTER_MS
// doesn't ask again.
export function markUnlocked(now = Date.now()) {
  write(sessionStorage, UNLOCKED_KEY, now);
}

export function isLocked(now = Date.now()) {
  if (!hasPin()) return false;
  const at = read(sessionStorage, UNLOCKED_KEY);
  return !at || now - at > LOCK_AFTER_MS;
}

export function lockNow() {
  write(sessionStorage, UNLOCKED_KEY, null);
}
