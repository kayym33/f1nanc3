// The 6am fetch: run by supabase/cron.sql at 05:00 and 06:00 UTC, and only
// fetches when it's the 6 o'clock hour in the UK (so 6am all year). POST
// {"force": true} fetches whatever the time. Only answers requests that
// carry CRON_SECRET. Marks connections whose approval has run out as
// expired.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { type Link, syncLink } from "../_shared/sync.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function ukHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(now));
}

Deno.serve(async (request) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || request.headers.get("x-cron-secret") !== secret) return json({ error: "not allowed" }, 401);
  let force = false;
  try {
    force = Boolean((await request.json())?.force);
  } catch {
    // No body: a normal run.
  }
  const now = new Date();
  if (!force && ukHour(now) !== 6) return json({ skipped: "not 6am in the UK" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: links, error } = await admin.from("fin_bank_links").select("*").eq("status", "active");
  if (error) return json({ error: error.message }, 500);

  const results = [];
  for (const link of (links ?? []) as Link[]) {
    if (link.valid_until && Date.parse(link.valid_until) <= now.getTime()) {
      await admin.from("fin_bank_links").update({ status: "expired" }).eq("id", link.id);
      results.push({ link: link.id, expired: true });
      continue;
    }
    try {
      results.push({ link: link.id, added: await syncLink(admin, link) });
    } catch (problem) {
      results.push({ link: link.id, error: problem instanceof Error ? problem.message : String(problem) });
    }
  }
  return json({ results });
});
