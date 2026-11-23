// Sends web pushes to a user's devices, and forgets devices that are gone.
// The same approach as t1ld3's (resonance/supabase/functions/_shared),
// but f1nanc3's own list of devices (fin_push_subscriptions). The VAPID
// keys are the project's, shared with t1ld3.
import webpush from "npm:web-push@3.6.7";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export interface Device {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface Message {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

let configured = false;

function configure(): void {
  if (configured) return;
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) throw new Error("the push keys aren't set on the server");
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "https://f1nanc3.kaylamc.uk", publicKey, privateKey);
  configured = true;
}

// Returns how many devices took the message. Ones the push service says
// are gone (the app was removed, or notifications turned off) are deleted.
export async function sendToDevices(client: SupabaseClient, devices: Device[], message: Message): Promise<number> {
  configure();
  const payload = JSON.stringify(message);
  let sent = 0;
  await Promise.all(devices.map(async (device) => {
    try {
      await webpush.sendNotification(
        { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        payload,
        { TTL: 12 * 60 * 60 },
      );
      sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await client.from("fin_push_subscriptions").delete().eq("endpoint", device.endpoint);
      } else {
        console.error("push failed", status);
      }
    }
  }));
  return sent;
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}
