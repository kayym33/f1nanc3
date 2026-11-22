// Fetching a bank connection's new transactions into fin_transactions.
// Used by "sync now" and connecting (functions/bank) and by the 6am job
// (functions/bank-sync). Runs as the service role, so every query names
// the user explicitly.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { bankRow, notAlreadyThere } from "../../../js/bank.js";
import { bank, BankError } from "./enablebanking.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
// How far back a regular fetch looks again, for transactions that took a
// few days to settle.
const OVERLAP_DAYS = 5;
const BATCH = 500;

export type Link = {
  id: string;
  user_id: string;
  session_id: string;
  valid_until: string | null;
  accounts: { uid: string; account: string; name?: string }[];
  last_synced_at: string | null;
};

// The first day f1nanc3 keeps (as js/money.js windowStart): the 1st of
// the month 12 months before this one, in UK time.
export function windowStart(now = new Date()): string {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit" })
    .format(now).split("-").map(Number);
  const index = year * 12 + (month - 1) - 12;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

const isoDate = (time: number) => new Date(time).toISOString().slice(0, 10);

// Fetches and stores; returns how many transactions were new. The first
// fetch asks for as much history as the bank gives (up to f1nanc3's 13
// months); later ones go back a few days from the last fetch.
export async function syncLink(admin: SupabaseClient, link: Link, psu: Record<string, string> = {}): Promise<number> {
  const start = windowStart();
  const first = !link.last_synced_at;
  const since = first ? start : [start, isoDate(Date.parse(link.last_synced_at!) - OVERLAP_DAYS * DAY_MS)].sort()[1];
  const { data: ruleRows } = await admin.from("fin_rules").select("merchant, category").eq("user_id", link.user_id);
  const rules = new Map((ruleRows ?? []).map((rule) => [rule.merchant, rule.category]));
  let added = 0;
  try {
    for (const account of link.accounts) {
      const rows: any[] = [];
      let continuation: string | null = null;
      do {
        const params = new URLSearchParams({ date_from: since });
        if (first) params.set("strategy", "longest");
        if (continuation) params.set("continuation_key", continuation);
        const page = await bank("GET", `/accounts/${account.uid}/transactions?${params}`, undefined, psu);
        for (const tx of page?.transactions ?? []) {
          const row = await bankRow(tx, account.account, rules);
          if (row && row.booked_on >= start) rows.push(row);
        }
        continuation = page?.continuation_key ?? null;
      } while (continuation);
      if (!rows.length) continue;

      // Already there from a CSV import: same account, date and amount.
      const dates = rows.map((row) => row.booked_on).sort();
      const { data: imported, error } = await admin.from("fin_transactions")
        .select("account, booked_on, amount")
        .eq("user_id", link.user_id).eq("account", account.account).eq("source", "csv")
        .gte("booked_on", dates[0]).lte("booked_on", dates.at(-1)!);
      if (error) throw new Error(error.message);
      const fresh: any[] = notAlreadyThere(rows, (imported ?? []).map((row) => ({ ...row, amount: Number(row.amount) })));

      // Already there from an earlier fetch: the same id, so skipped here.
      for (let i = 0; i < fresh.length; i += BATCH) {
        const { data, error: insertError } = await admin.from("fin_transactions")
          .upsert(fresh.slice(i, i + BATCH).map((row) => ({ ...row, user_id: link.user_id })), { onConflict: "user_id,id", ignoreDuplicates: true })
          .select("id");
        if (insertError) throw new Error(insertError.message);
        added += data?.length ?? 0;
      }
    }
    if (added) await admin.rpc("fin_mark_transfers_for", { target: link.user_id });
    await admin.from("fin_bank_links").update({ last_synced_at: new Date().toISOString(), last_error: null }).eq("id", link.id);
    return added;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The bank's approval has run out or been withdrawn.
    const ended = error instanceof BankError && ([401, 403].includes(error.status) || /SESSION|EXPIRED|REVOKED|CONSENT/i.test(error.code));
    await admin.from("fin_bank_links").update({ last_error: message, ...(ended ? { status: "expired" } : {}) }).eq("id", link.id);
    throw error;
  }
}
