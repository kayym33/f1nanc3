// Compares secrets in constant time, so response times don't give one away.
export function sameSecret(given: string | null, secret: string): boolean {
  if (!given) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(secret);
  let difference = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) difference |= (a[i] ?? 0) ^ b[i];
  return difference === 0;
}
