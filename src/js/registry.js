// Register helpers. Every external fact is one record: { id, label, state: stated|absent|unconfirmed, ... }.
// Only "stated" records may carry a value or url; everything else renders inert.

export const STATES = ['stated', 'absent', 'unconfirmed'];

export const isStated = (rec) => !!rec && rec.state === 'stated';

// Derive, never store: the handle comes from the url.
export function handleFromUrl(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean)[0];
    return seg ? '@' + seg : u.hostname;
  } catch { return ''; }
}

export function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^(www|api)\./, ''); } catch { return ''; }
}

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HEX = /^0x[0-9a-fA-F]{40}$/;
export const isSolanaAddress = (s) => typeof s === 'string' && B58.test(s);
export const isHexAddress = (s) => typeof s === 'string' && HEX.test(s);
export const isAddressShaped = (s) => isSolanaAddress(s) || isHexAddress(s);

// Address-shaped strings are matched against the stated registry, never rejected wholesale.
const ADDR_RE = /0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}/g;
export function statedAddresses(reg) {
  const out = new Set();
  for (const rec of Object.values(reg)) {
    if (isStated(rec) && isAddressShaped(rec.value)) out.add(rec.value);
  }
  return out;
}
// Returns address-shaped strings found in text that no stated record vouches for. The CA record is exempt.
export function strayAddresses(text, reg) {
  const ok = statedAddresses(reg);
  return (String(text).match(ADDR_RE) || []).filter((a) => !ok.has(a));
}

// A CA record counts as live only when stated AND the value has a valid shape.
export function liveCA(reg) {
  const r = reg.ca;
  return isStated(r) && isSolanaAddress(r.value) ? r.value : null;
}
