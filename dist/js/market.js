// Live market data. Follows the market-source register record only; the CA record affects the own-token row alone.
import { isStated, liveCA } from './registry.js';
import { BRAND_LOGO } from './view.js';

const DEX_OWN = 'https://api.dexscreener.com/latest/dex/tokens/';
const PUMP_OWN = 'https://frontend-api.pump.fun/coins/';
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function getJson(url, f = fetch, signal) {
  const res = await f(url, { signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('http ' + res.status);
  return res.json();
}

// Exponential backoff with jitter.
export async function withBackoff(fn, { tries = 4, base = 800, signal } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (signal?.aborted || i === tries - 1) break;
      await sleep(base * 2 ** i + Math.random() * 250);
    }
  }
  throw last;
}

function toModel(p) {
  return {
    key: p.baseToken.address, kind: 'live', own: false,
    name: p.baseToken.name || p.baseToken.symbol || 'Unknown', symbol: p.baseToken.symbol || '',
    logo: p.info?.imageUrl || '', url: p.url || '', address: p.baseToken.address,
    price: num(p.priceUsd), chg: num(p.priceChange?.h24), vol: num(p.volume?.h24),
    liq: num(p.liquidity?.usd), liqLabel: 'Liq',
  };
}

export async function fetchTrending(reg, { f = fetch, signal } = {}) {
  if (!isStated(reg.market)) throw new Error('market source not stated');
  const boosts = await getJson(reg.market.url, f, signal);
  const seen = new Set();
  const addrs = [];
  for (const b of Array.isArray(boosts) ? boosts : []) {
    if (b.chainId !== 'solana' || !b.tokenAddress || seen.has(b.tokenAddress)) continue;
    seen.add(b.tokenAddress); addrs.push(b.tokenAddress);
    if (addrs.length === 30) break;
  }
  if (!addrs.length) return [];
  const pairs = await getJson(reg.market.pairs + addrs.join(','), f, signal);
  const best = new Map();
  for (const p of Array.isArray(pairs) ? pairs : []) {
    if (p.chainId !== 'solana' || !p.baseToken?.address) continue;
    const cur = best.get(p.baseToken.address);
    if (!cur || num(p.volume?.h24) > num(cur.volume?.h24) || Number.isNaN(num(cur.volume?.h24))) best.set(p.baseToken.address, p);
  }
  return [...best.values()].map(toModel).sort((a, b) => (b.vol || 0) - (a.vol || 0));
}

// Own token, stated-CA branch.
export async function fetchOwn(ca, { f = fetch, signal } = {}) {
  const [dex, pump] = await Promise.all([
    getJson(DEX_OWN + ca, f, signal).catch(() => null),
    getJson(PUMP_OWN + ca, f, signal).catch(() => null),
  ]);
  console.log('[HOLDORA] own token raw response', { dex, pump });
  if (!dex && !pump) throw new Error('own token sources unreachable');
  return ownModel(ca, dex, pump);
}

export function ownModel(ca, dex, pump) {
  const pairs = (dex?.pairs || []).filter((p) => p.baseToken?.address === ca)
    .sort((a, b) => (num(b.volume?.h24) || 0) - (num(a.volume?.h24) || 0));
  const p = pairs[0];
  const mcap = num(p?.marketCap ?? p?.fdv ?? pump?.usd_market_cap);
  const liqUsd = num(p?.liquidity?.usd);
  console.log('[HOLDORA] own liquidity candidates', { liquidityUsd: p?.liquidity?.usd, marketCap: p?.marketCap, fdv: p?.fdv, pumpMarketCap: pump?.usd_market_cap });
  const useLiq = Number.isFinite(liqUsd);
  return {
    key: 'own', kind: 'live', own: true,
    name: p?.baseToken?.name || pump?.name || 'Holdora', symbol: p?.baseToken?.symbol || pump?.symbol || '',
    logo: BRAND_LOGO, // local brand file only, no API image
    url: p?.url || '', address: ca,
    price: num(p?.priceUsd), chg: num(p?.priceChange?.h24), vol: num(p?.volume?.h24),
    liq: useLiq ? liqUsd : mcap, liqLabel: useLiq ? 'Liq' : 'Mkt Cap',
  };
}

// Compose the visible board: own row pinned first, rows 2-10 trending with the own CA removed.
export function composeBoard(reg, own, trending, placeholder) {
  const ca = liveCA(reg);
  const rest = (trending || []).filter((t) => t.address !== ca).slice(0, 9);
  return [ca ? (own || { ...placeholder, kind: 'loading', name: 'Holdora', price: NaN, chg: NaN, vol: NaN, liq: NaN, address: ca }) : placeholder, ...rest];
}

// Poll loop: 60s, paused while hidden, immediate on visible, last good data kept.
export function startPolling({ reg, onState, onData, interval = 60000, f = fetch }) {
  let timer = 0, ctl = null, busy = false, lastTrending = null, lastOwn = null;
  async function tick() {
    if (busy || document.hidden) return;
    busy = true; ctl = new AbortController();
    onState(lastTrending ? 'refreshing' : 'loading');
    const ca = liveCA(reg);
    try {
      const [t, o] = await Promise.all([
        isStated(reg.market) ? withBackoff(() => fetchTrending(reg, { f, signal: ctl.signal }), { signal: ctl.signal }) : Promise.reject(new Error('inert')),
        ca ? withBackoff(() => fetchOwn(ca, { f, signal: ctl.signal }), { tries: 2, signal: ctl.signal }).catch(() => lastOwn) : null,
      ]);
      lastTrending = t; if (o) lastOwn = o;
      onData({ trending: lastTrending, own: lastOwn });
      onState('live');
    } catch (e) {
      onData({ trending: lastTrending, own: lastOwn, failed: true });
      onState(lastTrending ? 'stale' : 'down');
    } finally { busy = false; schedule(); }
  }
  function schedule() { clearTimeout(timer); if (!document.hidden) timer = setTimeout(tick, interval); }
  const vis = () => { if (document.hidden) { clearTimeout(timer); ctl?.abort(); } else { clearTimeout(timer); tick(); } };
  document.addEventListener('visibilitychange', vis);
  tick();
  return () => { clearTimeout(timer); ctl?.abort(); document.removeEventListener('visibilitychange', vis); };
}
