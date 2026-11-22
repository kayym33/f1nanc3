// Talking to Enable Banking (https://enablebanking.com/docs/api/reference/).
// Every request carries a short-lived JWT signed with the app's private
// key, which lives only in this project's secrets:
//   ENABLE_BANKING_APP_ID   the application id (the JWT's "kid")
//   ENABLE_BANKING_KEY      the private key, PEM, as downloaded
//   ENABLE_BANKING_BANK     optional: the bank's name (default Royal Bank of Scotland)
//   ENABLE_BANKING_COUNTRY  optional: its country (default GB)

const API = "https://api.enablebanking.com";

export class BankError extends Error {
  constructor(message: string, readonly status = 500, readonly code = "") {
    super(message);
  }
}

function base64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let text = "";
  for (const byte of raw) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function derLength(length: number): number[] {
  if (length < 0x80) return [length];
  const bytes: number[] = [];
  for (let rest = length; rest > 0; rest >>= 8) bytes.unshift(rest & 0xff);
  return [0x80 | bytes.length, ...bytes];
}

// "BEGIN RSA PRIVATE KEY" (PKCS#1) wrapped as PKCS#8, which WebCrypto reads.
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const algorithm = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const octets = [0x04, ...derLength(pkcs1.length), ...pkcs1];
  const body = [0x02, 0x01, 0x00, ...algorithm, ...octets];
  return new Uint8Array([0x30, ...derLength(body.length), ...body]);
}

let signingKey: CryptoKey | null = null;

async function key(): Promise<CryptoKey> {
  if (signingKey) return signingKey;
  const pem = Deno.env.get("ENABLE_BANKING_KEY");
  if (!pem) throw new BankError("the bank connection isn't set up on the server yet (ENABLE_BANKING_KEY)", 503);
  const base64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  let der = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  if (pem.includes("BEGIN RSA PRIVATE KEY")) der = pkcs1ToPkcs8(der);
  signingKey = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  return signingKey;
}

export async function jwt(): Promise<string> {
  const appId = Deno.env.get("ENABLE_BANKING_APP_ID");
  if (!appId) throw new BankError("the bank connection isn't set up on the server yet (ENABLE_BANKING_APP_ID)", 503);
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: appId }));
  const body = base64url(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 600 }));
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await key(), new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${base64url(new Uint8Array(signature))}`;
}

// A request to Enable Banking. `psu` headers say you're using the app
// right now, which lifts the bank's limit on background fetches.
export async function bank(method: string, path: string, body?: unknown, psu: Record<string, string> = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await jwt()}`, "Content-Type": "application/json", ...psu },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const code = data?.error ?? data?.code ?? "";
    const message = data?.message ?? data?.detail ?? data?.error_description ?? `bank error ${response.status}`;
    if (response.status === 429) throw new BankError("the bank's daily limit is reached; it'll fetch again later", 429, code);
    throw new BankError(`${message}${code ? ` (${code})` : ""}`, response.status, code);
  }
  return data;
}

export type Bank = { name: string; country: string; maximum_consent_validity?: number };

// The bank to connect to, as Enable Banking names it.
export async function findBank(): Promise<Bank> {
  const wanted = (Deno.env.get("ENABLE_BANKING_BANK") ?? "Royal Bank of Scotland").toLowerCase();
  const country = Deno.env.get("ENABLE_BANKING_COUNTRY") ?? "GB";
  const { aspsps } = await bank("GET", `/aspsps?country=${country}&psu_type=personal&service=AIS`);
  const list = (aspsps ?? []) as Bank[];
  const found = list.find((b) => b.name.toLowerCase() === wanted)
    ?? list.find((b) => b.name.toLowerCase().includes(wanted))
    ?? list.find((b) => wanted.includes(b.name.toLowerCase()));
  if (!found) throw new BankError(`couldn't find ${wanted} in Enable Banking's list for ${country}`, 404);
  return found;
}

// The "you're using the app" headers, from the request the app made.
export function psuHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) headers["Psu-Ip-Address"] = ip;
  const agent = request.headers.get("user-agent");
  if (agent) headers["Psu-User-Agent"] = agent;
  const accept = request.headers.get("accept");
  if (accept) headers["Psu-Accept"] = accept;
  const language = request.headers.get("accept-language");
  if (language) headers["Psu-Accept-Language"] = language;
  return headers;
}
