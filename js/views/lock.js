// The PIN lock screen, drawn as a terminal: a "$ unlock f1nanc3" prompt,
// the PIN as * and _ with an orange block cursor, boxed [1] keys (or the
// keyboard on a laptop), and a way out if the PIN's forgotten (sign out,
// then back in with your password).
import { attempts, checkPin, clearPin, pinLength, SIGN_OUT_AFTER, SLOW_AFTER } from "../pin.js";
import { esc } from "../ui.js";

const state = { typed: "", message: "", busy: false };

// "**__": typed digits as *, the rest as _.
function pinText() {
  return Array.from({ length: pinLength() }, (_, i) => (i < state.typed.length ? "*" : "_")).join("");
}

export function renderLock() {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
  return {
    crumbs: ["locked"],
    html: `
      <div class="lock">
        <div class="lock-screen">
          <p class="lock-command">$ unlock f1nanc3</p>
          <p class="lock-pin"><span>pin:</span> <span class="pin-text" aria-label="${state.typed.length} of ${pinLength()} digits">${pinText()}</span><span class="cursor" aria-hidden="true"></span></p>
          <p class="lock-message" aria-live="polite">${esc(state.message)}</p>
        </div>
        <div class="keypad">${keys.map((key) => (key === "" ? "<span></span>"
          : `<button type="button" class="key" data-action="${key === "del" ? "pin-back" : "pin-digit"}" data-digit="${key}" aria-label="${key === "del" ? "delete" : key}">[${key}]</button>`)).join("")}</div>
        <button type="button" class="forgot" data-action="pin-forgot">forgot your PIN? sign out</button>
      </div>`,
  };
}

function refresh() {
  const pin = document.querySelector(".lock .pin-text");
  if (pin) {
    pin.textContent = pinText();
    pin.setAttribute("aria-label", `${state.typed.length} of ${pinLength()} digits`);
  }
  const message = document.querySelector(".lock-message");
  if (message) message.textContent = state.message;
}

async function submit(ctx) {
  state.busy = true;
  const result = await checkPin(state.typed);
  state.busy = false;
  state.typed = "";
  if (result === "ok") {
    state.message = "";
    return ctx.unlocked();
  }
  if (result === "signout") {
    state.message = "";
    return ctx.signOutForPin();
  }
  const { fails } = attempts();
  state.message = result === "wait" ? "too many tries: wait a moment"
    : fails >= SLOW_AFTER ? `wrong PIN · ${SIGN_OUT_AFTER - fails} more tries before signing out`
      : "wrong PIN";
  refresh();
  document.querySelector(".lock .lock-pin")?.classList.add("shake");
  setTimeout(() => document.querySelector(".lock .lock-pin")?.classList.remove("shake"), 400);
}

function type(ctx, digit) {
  if (state.busy || state.typed.length >= pinLength()) return;
  state.typed += digit;
  refresh();
  if (state.typed.length === pinLength()) submit(ctx);
}

export const actions = {
  "pin-digit"(ctx, { digit }) {
    type(ctx, digit);
  },
  "pin-back"() {
    state.typed = state.typed.slice(0, -1);
    refresh();
  },
  "pin-forgot"(ctx) {
    if (!confirm("sign out of f1nanc3 on this device? you'll sign back in with your password and can set a new PIN")) return;
    ctx.signOutForPin();
  },
};

// Typing digits on a keyboard works too.
export function lockKeys(ctx, event) {
  if (!document.querySelector(".lock")) return false;
  if (/^\d$/.test(event.key)) type(ctx, event.key);
  else if (event.key === "Backspace") actions["pin-back"]();
  else return false;
  event.preventDefault();
  return true;
}

export { clearPin };
