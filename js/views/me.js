// The account, and the sign-in screen.
import { button, esc, heading } from "../ui.js";

export function render(ctx) {
  const count = ctx.finance.transactions.length;
  return {
    crumbs: ["me"],
    html: `
      ${heading("account")}
      <p>${esc(ctx.cloud.session?.email ?? "")}</p>
      <p class="hint">your t1ld3 account</p>
      <div class="row-buttons">${button("reload", "reload")}${button("sign out", "me-sign-out")}</div>
      ${heading("data")}
      <p>${count} transactions, kept for the current month and the 12 before it.</p>
      <p class="hint">day and night follow your device's light and dark mode</p>`,
  };
}

export const actions = {
  async "me-sign-out"(ctx) {
    if (!confirm("sign out of f1nanc3 here?")) return;
    await ctx.cloud.signOut();
    ctx.finance.clear();
    ctx.go("/");
  },
};

export function renderSignIn() {
  return {
    crumbs: ["sign in"],
    html: `
      <pre class="art center">  .---------.  \n  | f1nanc3 |  \n  '---------'  </pre>
      <p class="center muted">sign in with your t1ld3 account</p>
      <form class="editor" data-form="sign-in">
        <label>email<input name="email" type="email" autocomplete="username" required></label>
        <label>password<input name="password" type="password" autocomplete="current-password" required></label>
        <p class="error" hidden></p>
        <button type="submit" class="button solid wide">sign in</button>
      </form>`,
  };
}

export const forms = {
  async "sign-in"(ctx, form) {
    const error = form.querySelector(".error");
    error.hidden = true;
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    submit.textContent = "signing in...";
    try {
      await ctx.cloud.signIn(form.elements.email.value.trim(), form.elements.password.value);
      ctx.go("/");
      await ctx.finance.load();
    } catch (problem) {
      error.textContent = problem.message;
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = "sign in";
    }
  },
};
