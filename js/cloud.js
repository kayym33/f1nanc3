// A small Supabase client: email/password sign-in (the t1ld3 account)
// and the fin_* tables. Based on t1ld3's phone/js/cloud.js.
import { API_URL, SUPABASE_KEY, SUPABASE_URL } from "./config.js";

// Its own key, so signing in or out here doesn't touch t1ld3's phone app
// (they're on different addresses anyway, so storage is separate).
// A copy pointed at a stand-in server (?api=, localhost only) keeps its
// sign-in apart, so a pretend sign-in is never sent to the real server.
const SESSION_KEY = API_URL === SUPABASE_URL ? "f1nanc3.session" : `f1nanc3.session@${new URL(API_URL).host}`;
// Refresh this long (seconds) before the access token actually expires.
const REFRESH_MARGIN = 60;
const PAGE_SIZE = 1000;
// Rows per upload request.
const BATCH = 500;

export class CloudError extends Error {}
export class AuthError extends CloudError {}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Private browsing: signed in until the page closes.
  }
}

function sessionFrom(data) {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() / 1000 + Number(data.expires_in ?? 3600),
    user_id: data.user.id,
    email: data.user.email ?? "",
  };
}

function errorMessage(data, fallback) {
  if (data && typeof data === "object") {
    for (const key of ["msg", "message", "error_description", "error"]) {
      if (typeof data[key] === "string") return data[key];
    }
  }
  return fallback;
}

export class Cloud {
  constructor() {
    this.session = loadSession();
    this.refreshing = null;
  }

  // Forgets a sign-in the server has rejected, so the app asks again.
  forget() {
    this.session = null;
    saveSession(null);
  }

  get signedIn() {
    return this.session !== null;
  }

  async request(method, path, body, { headers = {}, authorized = true } = {}) {
    const requestHeaders = { apikey: SUPABASE_KEY, "Content-Type": "application/json", ...headers };
    if (authorized) requestHeaders.Authorization = `Bearer ${await this.accessToken()}`;
    let response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new CloudError("can't reach the server");
    }
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      const message = errorMessage(data, `server error ${response.status}`);
      if (response.status === 401 || ([400, 403].includes(response.status) && path.includes("/auth/"))) {
        throw new AuthError(message);
      }
      if (response.status === 404 && path.startsWith("/functions/")) {
        throw new CloudError("the bank connection isn't set up on the server yet");
      }
      if (response.status === 404 && path.includes("fin_")) {
        throw new CloudError("f1nanc3's tables aren't set up on the server yet (supabase/schema.sql)");
      }
      throw new CloudError(message);
    }
    return data;
  }

  // Auth

  async signIn(email, password) {
    const data = await this.request(
      "POST",
      "/auth/v1/token?grant_type=password",
      { email, password },
      { authorized: false },
    );
    this.session = sessionFrom(data);
    saveSession(this.session);
    return this.session;
  }

  async signOut() {
    const session = this.session;
    this.session = null;
    saveSession(null);
    if (!session) return;
    try {
      await this.request("POST", "/auth/v1/logout", undefined, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        authorized: false,
      });
    } catch {
      // Signed out here either way.
    }
  }

  async accessToken() {
    if (!this.session) throw new AuthError("not signed in");
    if (this.session.expires_at - REFRESH_MARGIN < Date.now() / 1000) {
      // Several requests can notice at once; refresh only once.
      this.refreshing ??= this.refresh().finally(() => {
        this.refreshing = null;
      });
      await this.refreshing;
    }
    return this.session.access_token;
  }

  async refresh() {
    try {
      const data = await this.request(
        "POST",
        "/auth/v1/token?grant_type=refresh_token",
        { refresh_token: this.session.refresh_token },
        { authorized: false },
      );
      this.session = sessionFrom(data);
      saveSession(this.session);
    } catch (error) {
      if (error instanceof AuthError) {
        // The refresh token was revoked or expired.
        this.session = null;
        saveSession(null);
      }
      throw error;
    }
  }

  // Tables

  // Every row of a table matching the query, in pages.
  async selectAll(table, query) {
    const rows = [];
    for (;;) {
      const params = new URLSearchParams(query);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(rows.length));
      const page = (await this.request("GET", `/rest/v1/${table}?${params}`)) ?? [];
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows;
    }
  }

  // Adds rows, skipping any whose key already exists (so re-uploading a
  // statement keeps categories you've changed). Returns how many were new.
  async insertNew(table, rows, conflict) {
    let added = 0;
    for (let start = 0; start < rows.length; start += BATCH) {
      const batch = rows.slice(start, start + BATCH);
      const inserted = await this.request(
        "POST",
        `/rest/v1/${table}?on_conflict=${conflict}&select=id`,
        batch,
        { headers: { Prefer: "resolution=ignore-duplicates,return=representation" } },
      );
      added += inserted?.length ?? 0;
    }
    return added;
  }

  async upsert(table, rows, conflict) {
    if (!rows.length) return;
    await this.request("POST", `/rest/v1/${table}?on_conflict=${conflict}`, rows, {
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    });
  }

  // PATCH rows matching filters ({column: "eq.value"}).
  async update(table, filters, changes) {
    const params = new URLSearchParams(filters);
    await this.request("PATCH", `/rest/v1/${table}?${params}`, changes, {
      headers: { Prefer: "return=minimal" },
    });
  }

  // DELETE rows matching filters ({column: "eq.value"}).
  async remove(table, filters) {
    const params = new URLSearchParams(filters);
    await this.request("DELETE", `/rest/v1/${table}?${params}`, undefined, {
      headers: { Prefer: "return=minimal" },
    });
  }

  // Notifications (supabase/functions/fin-push, fin_push_subscriptions).

  async vapidKey() {
    const data = await this.request("GET", "/functions/v1/fin-push");
    return data?.vapid_public_key ?? null;
  }

  async saveDevice(subscription) {
    const json = subscription.toJSON();
    await this.upsert("fin_push_subscriptions", [{ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }], "user_id,endpoint");
  }

  async deleteDevice(endpoint) {
    await this.remove("fin_push_subscriptions", { endpoint: `eq.${endpoint}` });
  }

  // Returns how many devices it reached.
  async sendTestPush() {
    const data = await this.request("POST", "/functions/v1/fin-push", { test: 1 });
    return Number(data?.sent ?? 0);
  }

  // Asks the server to send any alerts that are due now (after an import).
  async checkAlerts() {
    return this.request("POST", "/functions/v1/fin-alerts", {});
  }

  // POST to one of f1nanc3's server functions (supabase/functions).
  async callFunction(name, body) {
    return this.request("POST", `/functions/v1/${name}`, body);
  }

  async rpc(name, args = {}) {
    return this.request("POST", `/rest/v1/rpc/${name}`, args);
  }
}
