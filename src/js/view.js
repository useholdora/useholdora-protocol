// Pure string renderers. Shared by the build (static slots), the browser, and the gates.
import { isStated, handleFromUrl, hostFromUrl, liveCA } from './registry.js';

export const BRAND_LOGO = 'assets/logo-96.png';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' ? x.href : ''; } catch { return ''; } };

/* ---------- formatting ---------- */
const DASH = '–';
export const fmt = {
  usd(v) {
    if (!Number.isFinite(v)) return DASH;
    const a = Math.abs(v);
    if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + (a === 0 ? '0' : v.toFixed(2));
  },
  price(v) {
    if (!Number.isFinite(v)) return DASH;
    if (v === 0) return '$0.00';
    if (v >= 1) return '$' + v.toFixed(v >= 100 ? 2 : 3);
    if (v >= 0.01) return '$' + v.toFixed(4);
    return '$' + v.toFixed(Math.min(12, Math.ceil(-Math.log10(v)) + 3));
  },
  pct(v) {
    if (!Number.isFinite(v)) return DASH;
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + '%';
  },
};
const dirClass = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');

/* ---------- icons ---------- */
const X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
const GH_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';
const COPY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>';

/* ---------- register-driven slots ---------- */
function socialItem(rec, svg) {
  if (isStated(rec) && safeUrl(rec.url)) {
    return `<a href="${esc(safeUrl(rec.url))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(rec.label)} ${esc(handleFromUrl(rec.url))}" data-record="${esc(rec.id)}">${svg}</a>`;
  }
  // inert: icon present, no href, no tabindex, no value
  return `<span class="is-inert" role="img" aria-disabled="true" aria-label="${esc(rec.label)}, pending" data-record="${esc(rec.id)}">${svg}</span>`;
}
export const socialHtml = (reg) => socialItem(reg.x, X_SVG) + socialItem(reg.github, GH_SVG);

export function caHtml(reg) {
  const ca = liveCA(reg);
  if (ca) {
    return `<div class="ca wrap-ca" data-state="stated"><div class="wrap"><span class="ca-label">Contract address</span><div class="ca-value"><button type="button" class="ca-text" data-copy="${esc(ca)}" aria-label="Copy contract address">${esc(ca)}</button><span class="ca-hint" role="status" aria-live="polite"></span></div></div></div>`;
  }
  return `<div class="ca ca--inert" data-state="${esc(reg.ca.state === 'stated' ? 'absent' : reg.ca.state)}"><div class="wrap"><span class="ca-label">Contract address</span><div class="ca-value"><span class="ca-text">pending</span></div></div></div>`;
}

export function tilesHtml(reg) {
  const tile = (rec, valueHtml) => `<div class="tile spot rv"><small>${esc(rec.label)}</small>${valueHtml}</div>`;
  const val = (rec, v) => (isStated(rec) ? `<b>${esc(v)}</b>` : '<b class="is-pending">pending</b>');
  return [
    tile(reg.chain, val(reg.chain, reg.chain.value)),
    tile(reg.holders, val(reg.holders, reg.holders.value)),
    tile(reg.payout, val(reg.payout, reg.payout.value)),
    tile(reg.cadence, val(reg.cadence, reg.cadence.value)),
  ].join('');
}

export function chipsHtml(reg) {
  const ca = liveCA(reg);
  const chip = (label, v) => (v
    ? `<div class="chip"><span>${esc(label)}</span><b>${esc(v)}</b></div>`
    : `<div class="chip is-inert"><span>${esc(label)}</span><b>pending</b></div>`);
  return [
    chip(reg.chain.label, isStated(reg.chain) ? reg.chain.value : ''),
    chip(reg.ca.label, ca ? ca.slice(0, 4) + '…' + ca.slice(-4) : ''),
    chip(reg.x.label, isStated(reg.x) ? handleFromUrl(reg.x.url) : ''),
    chip(reg.github.label, isStated(reg.github) ? handleFromUrl(reg.github.url) : ''),
    chip(reg.market.label, isStated(reg.market) ? hostFromUrl(reg.market.url) : ''),
  ].join('');
}

/* ---------- market rows ---------- */
// model: { key, rank, kind: 'placeholder'|'live'|'loading', own, name, symbol, logo, url, address, price, chg, vol, liq, liqLabel }
export const PLACEHOLDER_OWN = { key: 'own', kind: 'placeholder', own: true, name: '· · · · ·', symbol: '', price: 0, chg: 0, vol: 0, liq: 0, liqLabel: 'Liq' };

function logoHtml(m) {
  if (m.own) return `<img class="logo" src="${BRAND_LOGO}" alt="" width="36" height="36" data-letter="H" data-own="1">`;
  const letter = esc((m.symbol || m.name || '?').trim().charAt(0).toUpperCase() || '?');
  const src = safeUrl(m.logo);
  if (!src) return `<span class="tile-fallback" aria-hidden="true">${letter}</span>`;
  return `<img class="logo" src="${esc(src)}" alt="" width="36" height="36" loading="lazy" referrerpolicy="no-referrer" data-letter="${letter}" data-own="0">`;
}

export function cellHtml(cls, kind, v, extra = '') {
  const f = kind === 'price' ? fmt.price : kind === 'pct' ? fmt.pct : fmt.usd;
  const dir = kind === 'pct' ? ' ' + dirClass(v) : '';
  return `<span class="cell ${cls}${dir}" data-k="${kind}" data-v="${Number.isFinite(v) ? v : ''}"${extra}>${f(v)}</span>`;
}

export function rowHtml(m, rank) {
  const inner = `${logoHtml(m)}<span style="min-width:0"><span class="nm">${esc(m.name)}</span><span class="sym">${esc(m.symbol)}</span></span>`;
  const href = m.kind === 'live' ? safeUrl(m.url) : '';
  const tok = href
    ? `<a class="tok" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
    : `<span class="tok">${inner}</span>`;
  const copyBtn = m.address
    ? `<button type="button" class="copy" data-copy="${esc(m.address)}" aria-label="Copy address for ${esc(m.name)}">${COPY_SVG}</button>`
    : `<button type="button" class="copy" disabled aria-label="Address pending">${COPY_SVG}</button>`;
  const liqTitle = m.liqLabel === 'Mkt Cap' ? ' title="Mkt Cap"' : '';
  const cls = ['row', m.own ? 'own' : '', m.kind === 'placeholder' ? 'own-placeholder' : ''].filter(Boolean).join(' ');
  return `<div class="${cls}" role="row" data-key="${esc(m.key)}"><span class="rank">${rank}</span>${tok}`
    + cellHtml('c-price', 'price', m.price) + cellHtml('c-chg', 'pct', m.chg)
    + cellHtml('c-vol', 'usd', m.vol) + cellHtml('c-liq', 'usd', m.liq, liqTitle) + copyBtn + '</div>';
}

export function skeletonRows(n = 9) {
  return Array.from({ length: n }, () => '<div class="skeleton-row" aria-hidden="true"><span class="skeleton-line"></span><span style="display:flex;gap:12px;align-items:center"><span class="skeleton-line circle"></span><span class="skeleton-line" style="width:60%"></span></span><span class="skeleton-line"></span><span class="skeleton-line"></span></div>').join('');
}

export function tickerHtml(models) {
  const one = (m) => {
    if (m.kind === 'placeholder') return `<span class="tick">${esc(m.name)}<span>${fmt.price(0)}</span><span>${fmt.pct(0)}</span></span>`;
    return `<span class="tick">${esc(m.symbol || m.name)}<span>${fmt.price(m.price)}</span><span class="${dirClass(m.chg)}">${fmt.pct(m.chg)}</span></span>`;
  };
  const items = models.map(one).join('');
  return `<div class="ticker-track" aria-hidden="true">${items}${items}</div>`;
}

export const headHtml = '<div class="row head" role="row"><span>#</span><span>Token</span><span>Price</span><span>24h</span><span>Volume</span><span>Liquidity</span><span class="sr">Copy</span></div>';
