// f1nanc3's notifications, for the signed-in user:
//   GET              -> {vapid_public_key}: what a device subscribes with
//   POST {"test": 1} -> {sent}: a test notification to their devices
// Deployed with --no-verify-jwt so browsers' CORS preflights get through;
// the user's token is checked here. Queries run as the user, so row-level
// security limits them to their own devices.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { CORS_HEADERS, json, sendToDevices } from "../_shared/webpush.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "sign in first" }, 401);
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return json({ error: "sign in again" }, 401);

  if (request.method === "GET") return json({ vapid_public_key: Deno.env.get("VAPID_PUBLIC_KEY") ?? null });
  if (request.method !== "POST") return json({ error: "use GET or POST" }, 405);

  const { data: devices } = await client.from("fin_push_subscriptions").select("endpoint, p256dh, auth");
  const sent = await sendToDevices(client, devices ?? [], {
    title: "f1nanc3",
    body: "notifications work :D you'll hear about budgets and payday here (never with amounts)",
    tag: "test",
    url: "./#/settings",
  });
  return json({ sent });
});
