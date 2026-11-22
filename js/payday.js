// The nudge before payday: what's left in your spending accounts that's
// safe to move to savings. No UI code.

// Days before payday when the nudge shows (and it stays until pay lands).
export const NUDGE_DAYS = 3;
// Left in your spending accounts for surprises.
export const CUSHION = 400;

// {days, suggest} when payday is close and there's something worth moving,
// or null. `spending` is the total in your spending accounts now;
// `billsBefore` what's still due before payday; `dailySpend` your usual
// day-to-day spending. The suggestion keeps all of that back, plus the
// cushion, and rounds down to £50.
export function paydayNudge({ today, payDay, spending, billsBefore = 0, dailySpend = 0, cushion = CUSHION }) {
  if (!payDay) return null;
  const days = Math.max(0, payDay - today);
  if (days > NUDGE_DAYS) return null;
  const keep = billsBefore + dailySpend * days + cushion;
  const suggest = Math.floor(Math.max(0, spending - keep) / 50) * 50;
  return suggest >= 50 ? { days, suggest, keep: Math.round(keep) } : null;
}
