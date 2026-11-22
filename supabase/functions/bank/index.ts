// POST {action, ...} from the app, as the signed-in user:
//   start {redirect_url}  -> {url}: where to approve access at the bank
//   finish {code, state}  -> {added}: saves the connection and fetches history
//   sync                  -> {added}: fetches new transactions now
//   disconnect            -> {}: ends the connection; transactions stay
// Deployed with --no-verify-jwt so browsers' CORS preflights get through;
// the user's token is checked here instead.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { accountLast4 } from "../../../js/bank.js";
import { bank, BankError, findBank, psuHeaders } from "../_shared/enablebanking.ts";
import { type Link, syncLink } from "../_shared/sync.ts";

const ALLOWED_REDIRECTS = ["https://f1nanc3.kaylamc.uk/", "http://localhost:8765/"];
// Ask for access for this long, or less if the bank allows less.
const WANTED_DAYS = 180;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "use POST" }, 405);
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "sign in first" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return json({ error: "sign in again" }, 401);

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return json({ error: "send JSON" }, 400);
  }

  const latest = async (status: string) => {
    const { data } = await admin.from("fin_bank_links").select("*")
      .eq("user_id", user.id).eq("status", status).order("created_at", { ascending: false }).limit(1);
    return (data?.[0] ?? null) as (Link & { state: string; status: string }) | null;
  };

  try {
    switch (input.action) {
      case "start": {
        const redirect = String(input.redirect_url ?? "");
        if (!ALLOWED_REDIRECTS.includes(redirect)) return json({ error: "that return address isn't allowed" }, 400);
        const found = await findBank();
        const days = Math.min(WANTED_DAYS, Math.floor((found.maximum_consent_validity ?? WANTED_DAYS * 86400) / 86400));
        const validUntil = new Date(Date.now() + days * 86400 * 1000).toISOString();
        const state = crypto.randomUUID();
        const { url } = await bank("POST", "/auth", {
          access: { valid_until: validUntil },
          aspsp: { name: found.name, country: found.country },
          state,
          redirect_url: redirect,
          psu_type: "personal",
        }, psuHeaders(request));
        await admin.from("fin_bank_links").insert({ user_id: user.id, bank: found.name, status: "pending", state });
        return json({ url });
      }

      case "finish": {
        const pending = await latest("pending");
        if (!pending || pending.state !== input.state) return json({ error: "this approval doesn't match a connection you started; try connecting again" }, 400);
        const session = await bank("POST", "/sessions", { code: String(input.code ?? "") }, psuHeaders(request));
        const accounts = (session.accounts ?? []).map((account: any) => ({
          uid: account.uid, account: accountLast4(account), name: account.product ?? account.name ?? "",
        }));
        // A new connection replaces the old one.
        await admin.from("fin_bank_links").update({ status: "disconnected" })
          .eq("user_id", user.id).eq("status", "active");
        const { data: saved } = await admin.from("fin_bank_links").update({
          status: "active", state: null, session_id: session.session_id,
          valid_until: session.access?.valid_until ?? null, accounts,
        }).eq("id", pending.id).select("*").single();
        // Straight away: banks give full history only for a short while
        // after you approve.
        const added = await syncLink(admin, saved as Link, psuHeaders(request));
        return json({ added, accounts: accounts.map((a: { account: string }) => a.account) });
      }

      case "sync": {
        const link = await latest("active");
        if (!link) return json({ error: "no bank is connected" }, 400);
        return json({ added: await syncLink(admin, link, psuHeaders(request)) });
      }

      case "disconnect": {
        const link = await latest("active");
        if (link?.session_id) await bank("DELETE", `/sessions/${link.session_id}`).catch(() => {});
        await admin.from("fin_bank_links").update({ status: "disconnected" })
          .eq("user_id", user.id).in("status", ["active", "pending", "expired"]);
        return json({});
      }

      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (error) {
    const status = error instanceof BankError ? (error.status >= 400 && error.status < 600 ? error.status : 502) : 500;
    return json({ error: error instanceof Error ? error.message : String(error) }, status);
  }
});
