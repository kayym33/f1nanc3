// Works out and sends f1nanc3's alerts (js/insights.js alertsFor): budget
// categories at 80% and over, and the nudge before payday. Each goes once
// a month (fin_alerts_sent).
//   - From the cron job (supabase/alerts-cron.sql, x-cron-secret): every
//     user with a device, only in the UK's 9 o'clock hour unless
//     {"force": true}.
//   - From the app after an import (the user's token): just that user, now.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { alertsFor } from "../../../js/insights.js";
import { windowStart } from "../../../js/money.js";
import { sameSecret } from "../_shared/secret.ts";
import { CORS_HEADERS, type Device, json, sendToDevices } from "../_shared/webpush.ts";

const PAGE = 1000;

// Today's date in the UK, as a local Date at midday (what insights.js expects).
function ukToday(now = new Date()): Date {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now).split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function ukHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(now));
}

async function all(admin: SupabaseClient, table: string, select: string, user: string, extra?: (q: any) => any) {
  const rows: any[] = [];
  for (;;) {
    let query = admin.from(table).select(select).eq("user_id", user).range(rows.length, rows.length + PAGE - 1);
    if (extra) query = extra(query);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return rows;
  }
}

// One user's data, in the shape insights.js takes.
async function dataFor(admin: SupabaseClient, user: string, today: Date) {
  const [transactions, settings, accounts, budgets] = await Promise.all([
    all(admin, "fin_transactions", "id,account,booked_on,amount,description,merchant,type,category,category_source,source,balance", user,
      (q) => q.gte("booked_on", windowStart(today)).order("booked_on", { ascending: false })),
    all(admin, "fin_subscriptions", "merchant,kind,url,hidden,cancelled_on", user),
    all(admin, "fin_accounts", "account,kind", user),
    all(admin, "fin_budget", "plan,amounts", user),
  ]);
  return {
    transactions: transactions.map((t) => ({ ...t, amount: Number(t.amount), balance: t.balance === null ? null : Number(t.balance) })),
    subscriptionSettings: new Map(settings.map((s) => [s.merchant, s])),
    accountKinds: new Map(accounts.map((a) => [a.account, a.kind])),
    budget: { plan: budgets[0]?.plan ?? null, amounts: budgets[0]?.amounts ?? {} },
  };
}

// Sends one user's new alerts; returns how many went.
async function alertUser(admin: SupabaseClient, user: string, devices: Device[], today: Date): Promise<number> {
  const alerts = alertsFor(await dataFor(admin, user, today), today);
  if (!alerts.length) return 0;
  const { data: sent } = await admin.from("fin_alerts_sent").select("key").eq("user_id", user).in("key", alerts.map((a) => a.key));
  const already = new Set((sent ?? []).map((row) => row.key));
  let count = 0;
  for (const alert of alerts.filter((a) => !already.has(a.key))) {
    // Claim it first, so two runs at once can't both send it.
    const { error } = await admin.from("fin_alerts_sent").insert({ user_id: user, key: alert.key });
    if (error) continue;
    await sendToDevices(admin, devices, { title: alert.title, body: alert.body, tag: alert.key, url: alert.url });
    count += 1;
  }
  return count;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const today = ukToday();
  let body: { force?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // No body.
  }

  try {
    const secret = Deno.env.get("CRON_SECRET");
    if (secret && sameSecret(request.headers.get("x-cron-secret"), secret)) {
      if (!body.force && ukHour() !== 9) return json({ skipped: "not 9am in the UK" });
      const { data: devices, error } = await admin.from("fin_push_subscriptions").select("user_id, endpoint, p256dh, auth");
      if (error) return json({ error: "couldn't read devices" }, 500);
      const byUser = new Map<string, Device[]>();
      for (const device of devices ?? []) byUser.set(device.user_id, [...(byUser.get(device.user_id) ?? []), device]);
      let sent = 0;
      for (const [user, list] of byUser) sent += await alertUser(admin, user, list, today).catch(() => 0);
      return json({ users: byUser.size, sent });
    }

    // The app asking for the signed-in user, after an import.
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "sign in first" }, 401);
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return json({ error: "sign in again" }, 401);
    const { data: devices } = await admin.from("fin_push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", user.id);
    if (!devices?.length) return json({ sent: 0 });
    return json({ sent: await alertUser(admin, user.id, devices, today) });
  } catch (problem) {
    console.error("alerts failed", problem instanceof Error ? problem.message : problem);
    return json({ error: "alerts failed" }, 500);
  }
});
