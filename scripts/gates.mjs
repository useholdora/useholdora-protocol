// Gates: run against dist/ after `npm run build`. Exit 0 only if every gate passes.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const rd = (p) => readFileSync(p, 'utf8');
const imp = (p) => import(pathToFileURL(join(dist, p)).href);

const results = [];
async function gate(name, fn) {
  try { await fn(); results.push([name, true]); console.log('PASS  ' + name); }
  catch (e) { results.push([name, false]); console.log('FAIL  ' + name + '\n        ' + e.message); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (['node_modules', '.git'].includes(n)) continue;
    const p = join(dir, n);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const textOf = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
const attrsOf = (html) => [...html.matchAll(/\s(?:aria-label|title|alt|content|placeholder)="([^"]*)"/g)].map((m) => m[1]).join(' \n ');

const DATE_RES = [/\b\d{4}-\d{2}-\d{2}\b/, /\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/, /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i, /\b\d{1,2}:\d{2}\b/, /\bas of\b/i, /\bchecked\b/i, /\bupdated\b/i, /\b\d+\s*(seconds?|minutes?|hours?|days?)\s+ago\b/i, /\b20[12]\d\b/];
const findDate = (s) => DATE_RES.map((r) => (s.match(r) || [])[0]).filter(Boolean);

const FIX_CA = 'So11111111111111111111111111111111111111112'; // fixture only, never shipped
const FIX_HEX = '0x52908400098527886E0F7030069857D2E4169EE7';

ok(existsSync(join(dist, 'index.html')), 'dist/index.html missing: run npm run build');
const reg = (await imp('js/register.js')).default;
const R = await imp('js/registry.js');
const V = await imp('js/view.js');
const M = await imp('js/market.js');
const html = rd(join(dist, 'index.html'));
const css = rd(join(dist, 'css/styles.css'));
const tokens = rd(join(dist, 'css/tokens.css'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const withCA = (r, v) => { const c = clone(r); c.ca = { ...c.ca, state: 'stated', value: v }; return c; };

/* ---------- deploy output & logo ---------- */
await gate('build output: dist/ holds index.html, css, js', () => {
  for (const f of ['index.html', 'css/styles.css', 'css/tokens.css', 'js/main.js', 'js/register.js']) ok(existsSync(join(dist, f)), f + ' missing');
});
await gate('logo: file copied into dist and index.html references it by correct relative path', () => {
  const srcs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  ok(srcs.includes('assets/logo-96.png'), 'header logo not referenced as assets/logo-96.png');
  for (const s of srcs) {
    ok(!s.startsWith('/') && !/^https?:/.test(s), 'non-relative img src: ' + s);
    ok(existsSync(join(dist, s)), 'img src does not resolve inside dist: ' + s);
    const b = readFileSync(join(dist, s)); ok(b.slice(1, 4).toString() === 'PNG', s + ' is not a PNG');
  }
});
await gate('every href/src in index.html resolves inside dist', () => {
  for (const m of html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)) {
    const u = m[1]; if (/^https?:|^mailto:/.test(u)) continue;
    ok(existsSync(join(dist, u)), 'unresolved: ' + u);
  }
});
await gate('favicon: svg 32x32, no double hyphen anywhere, no xml comments', () => {
  const s = rd(join(dist, 'assets/favicon.svg'));
  ok(/width="32"/.test(s) && /height="32"/.test(s) && /viewBox="0 0 32 32"/.test(s), 'not 32x32');
  ok(!s.includes('--'), 'double hyphen in svg');
  ok(!s.includes('<!--'), 'comment in svg');
  ok(/<link rel="icon"[^>]+favicon\.svg/.test(html), 'favicon not linked');
});

/* ---------- palette / tokens ---------- */
await gate('palette: colour literals only in tokens.css (css, js, html)', () => {
  const lit = /#[0-9a-fA-F]{3,8}\b(?![\w-])|\brgba?\(|\bhsla?\(/;
  const bad = [];
  for (const f of walk(dist)) {
    if (!['.css', '.js', '.html'].includes(extname(f)) || f.endsWith('tokens.css')) continue;
    const t = rd(f).replace(/&#\d+;/g, '');
    if (lit.test(t) && !f.endsWith('index.html')) bad.push(relative(dist, f));
    if (f.endsWith('index.html') && /style="[^"]*(#[0-9a-f]{3,8}|rgba?\()/i.test(t)) bad.push('index.html inline style');
  }
  ok(!bad.length, 'literals outside tokens: ' + bad.join(', '));
});
await gate('palette: every token carries pixel provenance (x,y) and k-means note', () => {
  const lines = tokens.split('\n').filter((l) => /--(brand|white|deep|forest|green|glow|mint|frost):\s*#/.test(l));
  ok(lines.length === 8, 'expected 8 sampled tokens, got ' + lines.length);
  for (const l of lines) ok(/\(\d+,\d+\)/.test(l), 'no coordinate: ' + l.trim());
  ok(/k-means/.test(tokens), 'no k-means note');
});
await gate('css: no ch units', () => ok(!/\d\s?ch\b/.test(css), 'ch unit found'));

/* ---------- no dates ---------- */
await gate('no dates: static page text and attributes', () => {
  const found = findDate(textOf(html) + attrsOf(html));
  ok(!found.length, 'date-like text: ' + found.join(' | '));
});
await gate('no dates: rendered fragments in both CA branches', () => {
  for (const r of [reg, withCA(reg, FIX_CA)]) {
    const frag = V.socialHtml(r) + V.caHtml(r) + V.tilesHtml(r) + V.chipsHtml(r) + V.tickerHtml([V.PLACEHOLDER_OWN]) + V.rowHtml(V.PLACEHOLDER_OWN, 1);
    const found = findDate(textOf(frag) + attrsOf(frag));
    ok(!found.length, 'date-like text: ' + found.join(' | '));
  }
});
await gate('no dates: shipped js (except register data) and css carry none', () => {
  for (const f of walk(dist)) {
    if (!['.js', '.css'].includes(extname(f)) || f.endsWith('register.js')) continue;
    const found = findDate(rd(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\sd="[^"]*"/g, ''));
    ok(!found.length, relative(dist, f) + ': ' + found.join(' | '));
  }
});

/* ---------- register + link rule ---------- */
await gate('register: every record has state in stated|absent|unconfirmed', () => {
  for (const r of Object.values(reg)) ok(R.STATES.includes(r.state), r.id + ' bad state');
});
await gate('register: non-stated records carry no value or url', () => {
  for (const r of Object.values(reg)) if (r.state !== 'stated') ok(!('value' in r) && !('url' in r), r.id + ' leaks value/url');
});
await gate('register: chain stated Solana with rpc, client statement, batch-level', () => {
  const c = reg.chain; ok(c.state === 'stated' && c.value === 'Solana' && c.rpc === 'https://solana-rpc.publicnode.com' && c.source === 'client statement' && c.scope === 'batch-level', 'chain record wrong');
});
await gate('link rule: X href equals stored url, handle derived; no href for unstated records', () => {
  ok(html.includes(`href="${reg.x.url}"`), 'X href missing');
  ok(R.handleFromUrl(reg.x.url) === '@holdora', 'handle not derived');
  const gh = html.match(/<span[^>]*data-record="github"[^>]*>/)?.[0] ?? '';
  ok(gh && !/href|tabindex/.test(gh), 'GitHub icon missing or not inert');
});
await gate('social: both icons in the header, icon-only, never hidden at any breakpoint', () => {
  const slot = html.match(/<div class="social"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/header>/)?.[1] ?? '';
  ok((slot.match(/<svg/g) || []).length === 2, 'expected two svg icons');
  ok(textOf(slot).trim() === '', 'text label inside social slot');
  ok(!/\.social[^{]*\{[^}]*display:\s*none/.test(css), 'social hidden by css');
  ok(/M18\.244 2\.25h3\.308/.test(slot) && /M8 0c4\.42 0 8 3\.58 8 8/.test(slot), 'icon paths are not the official X / Octicon marks');
});

/* ---------- CA slot, both branches ---------- */
await gate('CA absent: inert slot, label + pending only, no value/url/copy hook', () => {
  const r = clone(reg); r.ca = { ...r.ca, state: 'absent' }; delete r.ca.value;
  const h = V.caHtml(r);
  ok(/pending/.test(h) && !/data-copy|href|<button|data-value/.test(h), 'absent slot not inert: ' + h);
});
await gate('CA stated: full address shown in a click-to-copy button with feedback region', () => {
  const h = V.caHtml(withCA(reg, FIX_CA));
  ok(h.includes(`>${FIX_CA}<`) && h.includes(`data-copy="${FIX_CA}"`) && /aria-live="polite"/.test(h), 'stated slot wrong');
  ok(/\.ca-text\{[^}]*clamp\(/.test(css), 'CA slot not large');
});
await gate('CA stated but malformed: stays inert (shape-checked, not trusted)', () => {
  const h = V.caHtml(withCA(reg, 'not-an-address'));
  ok(!/data-copy/.test(h), 'malformed CA rendered live');
});

/* ---------- address gate (0x never blanket-rejected) ---------- */
await gate('address scanner: 0x hex vouched by a stated record passes, unstated flagged, CA exempt', () => {
  const r = clone(reg); r.extra = { id: 'extra', state: 'stated', value: FIX_HEX };
  ok(R.strayAddresses(`see ${FIX_HEX}`, r).length === 0, 'stated hex rejected');
  ok(R.strayAddresses(`see ${FIX_HEX}`, reg).length === 1, 'unstated hex not flagged');
  const rc = withCA(reg, FIX_CA);
  ok(R.strayAddresses(`ca ${FIX_CA}`, rc).length === 0, 'stated CA flagged');
  ok(R.isHexAddress(FIX_HEX) && R.isSolanaAddress(FIX_CA), 'shape detection broken');
});
await gate('address scanner: shipped page text holds no unvouched address-shaped string', () => {
  const stray = R.strayAddresses(textOf(html), reg);
  ok(!stray.length, 'stray: ' + stray.join(', '));
});

/* ---------- mutation harness: anchors read the current record at runtime ---------- */
await gate('mutation harness: flip every record to its opposite state, invariants follow the runtime state', () => {
  for (const id of Object.keys(reg)) {
    const r = clone(reg);
    const wasStated = R.isStated(r[id]);                       // anchor read at runtime, never hard-coded
    if (wasStated) { r[id].state = 'absent'; delete r[id].value; delete r[id].url; }
    else {
      r[id].state = 'stated';
      if (id === 'ca') r[id].value = FIX_CA; else if (id === 'x' || id === 'github') r[id].url = `https://example.test/${id}`; else r[id].value = 'v';
    }
    const frag = V.socialHtml(r) + V.caHtml(r) + V.tilesHtml(r) + V.chipsHtml(r);
    const rec = r[id];
    if (id === 'ca') ok(R.isStated(rec) === /data-copy/.test(V.caHtml(r)), 'ca invariant broke after flip');
    if (id === 'x' || id === 'github') {
      const tag = frag.match(new RegExp(`<(a|span)[^>]*data-record="${id}"[^>]*>`))[0];
      ok(R.isStated(rec) === /href=/.test(tag), id + ' href invariant broke after flip');
    }
    if (id !== 'ca' && id !== 'x' && id !== 'github' && id !== 'market') ok(R.isStated(rec) === !/pending/.test(V.tilesHtml(r).split(rec.label)[1]?.split('</div>')[0] ?? 'pending') || id === 'chain', id + ' tile invariant broke');
  }
});

/* ---------- own token row, both branches ---------- */
await gate('own row, CA absent: placeholder exact values, non-clickable, mint border + ownPulse', () => {
  const h = V.rowHtml(V.PLACEHOLDER_OWN, 1);
  for (const t of ['· · · · ·', '$0.00', '0.00%', '>$0<']) ok(h.includes(t), 'missing ' + t);
  ok((h.match(/>\$0</g) || []).length === 2, 'vol/liq not $0');
  ok(!/<a\b|href/.test(h), 'placeholder is clickable');
  const board = M.composeBoard(reg, null, [{ address: 'a', key: 'a' }], V.PLACEHOLDER_OWN);
  ok(board[0].kind === 'placeholder' && board.length === 2, 'row #1 not pinned placeholder');
});
await gate('own row css: border-left 2px solid var(--color-mint), ownPulse 2s, reduced-motion off', () => {
  ok(/\.row\.own\{[^}]*border-left:2px solid var\(--color-mint\)/.test(css), 'border-left');
  ok(/@keyframes ownPulse\{0%,100%\{[^}]*2%[^}]*\}50%\{[^}]*8%/.test(css), 'keyframes');
  ok(/animation:ownPulse 2s ease-in-out infinite/.test(css), 'animation');
  ok(/@media \(prefers-reduced-motion:reduce\)\{[\s\S]*animation:none/.test(css), 'reduced-motion');
});
await gate('own row, CA stated: pair chosen by baseToken.address then volume.h24, logo from pump.fun, liquidity fallback to market cap', () => {
  const dex = { pairs: [
    { baseToken: { address: 'other', symbol: 'X' }, volume: { h24: 9e9 }, priceUsd: '9' },
    { baseToken: { address: FIX_CA, symbol: 'HLD', name: 'Holdora' }, volume: { h24: 10 }, priceUsd: '0.1', liquidity: { usd: 5 }, priceChange: { h24: 1 } },
    { baseToken: { address: FIX_CA, symbol: 'HLD', name: 'Holdora' }, volume: { h24: 500 }, priceUsd: '0.2', marketCap: 7777, priceChange: { h24: -3.5 }, url: 'https://dexscreener.com/solana/p' },
  ] };
  const m = M.ownModel(FIX_CA, dex, { image_uri: 'https://ipfs.io/ipfs/img' });
  ok(m.price === 0.2 && m.vol === 500 && m.chg === -3.5, 'wrong pair');
  ok(m.logo === V.BRAND_LOGO && V.rowHtml(m, 1).includes('src="assets/logo-96.png"'), 'own logo not the local brand file');
  ok(m.liq === 7777 && m.liqLabel === 'Mkt Cap', 'liquidity fallback');
  ok(/title="Mkt Cap"/.test(V.rowHtml(m, 1)), 'Mkt Cap title missing');
  ok(M.ownModel(FIX_CA, { pairs: [] }, null).logo === V.BRAND_LOGO, 'brand logo fallback');
  const srcM = rd(join(dist, 'js/market.js'));
  ok(srcM.includes('[HOLDORA] own token raw response') && srcM.includes('[HOLDORA] own liquidity candidates'), 'console tags missing');
  ok(/Promise\.all\(\[\s*getJson\(DEX_OWN/.test(srcM), 'own fetch not parallel');
});
await gate('own row, CA stated: pinned above rows 2-10 with same classes; duplicate removed from trending', () => {
  const r = withCA(reg, FIX_CA);
  const own = { ...M.ownModel(FIX_CA, { pairs: [{ baseToken: { address: FIX_CA, symbol: 'H' }, volume: { h24: 1 }, priceUsd: '1' }] }, null) };
  const tr = Array.from({ length: 12 }, (_, i) => ({ key: 't' + i, address: i === 3 ? FIX_CA : 't' + i, kind: 'live' }));
  const b = M.composeBoard(r, own, tr, V.PLACEHOLDER_OWN);
  ok(b.length === 10 && b[0].own && b.slice(1).every((x) => x.address !== FIX_CA), 'compose wrong');
  ok(/class="row own"/.test(V.rowHtml(own, 1)), 'own class missing on live row');
});

/* ---------- market ---------- */
const mockFetch = (log, { failFirst = 0 } = {}) => { let n = 0; return async (url) => {
  log.push(url);
  if (n++ < failFirst) throw new Error('net');
  const j = (x) => ({ ok: true, json: async () => x });
  if (url.includes('token-boosts')) return j([{ chainId: 'solana', tokenAddress: 'A' }, { chainId: 'base', tokenAddress: 'B' }, { chainId: 'solana', tokenAddress: 'C' }, { chainId: 'solana', tokenAddress: 'A' }]);
  const pair = (a, v) => ({ chainId: 'solana', baseToken: { address: a, symbol: a, name: a }, volume: { h24: v }, priceUsd: '1', url: 'https://dexscreener.com/solana/' + a });
  return j([pair('A', 5), pair('C', 50), pair('A', 70)]);
}; };
await gate('market: solana only, deduped, best pair per token, sorted by 24h volume, 30-address cap', async () => {
  const log = []; const t = await M.fetchTrending(reg, { f: mockFetch(log) });
  ok(t.map((x) => x.address).join() === 'A,C' && t[0].vol === 70, 'wrong ordering/filter');
  ok(log[1] === 'https://api.dexscreener.com/tokens/v1/solana/A,C', 'pairs url wrong: ' + log[1]);
});
await gate('market: CA state has zero effect on the market requests', async () => {
  const a = [], b = [];
  await M.fetchTrending(reg, { f: mockFetch(a) }); await M.fetchTrending(withCA(reg, FIX_CA), { f: mockFetch(b) });
  ok(JSON.stringify(a) === JSON.stringify(b), 'requests differ by CA state');
  const off = clone(reg); off.market.state = 'absent';
  let threw = false; try { await M.fetchTrending(off, { f: mockFetch([]) }); } catch { threw = true; }
  ok(threw, 'market did not follow its own register record');
});
await gate('market: exponential backoff retries then recovers; failure surfaces when exhausted', async () => {
  const log = []; const t0 = Date.now();
  const mf = mockFetch(log, { failFirst: 2 });
  const r = await M.withBackoff(() => M.getJson('https://api.dexscreener.com/x', mf), { tries: 4, base: 20 });
  ok(log.length === 3 && Date.now() - t0 >= 20 + 40 - 1, 'backoff timing wrong');
  let threw = false; try { await M.withBackoff(() => Promise.reject(new Error('x')), { tries: 2, base: 5 }); } catch { threw = true; }
  ok(threw && r, 'no surfaced failure');
});
await gate('market: poll 60s, pause when hidden, immediate fetch on visible', () => {
  const s = rd(join(dist, 'js/market.js'));
  ok(/interval = 60000/.test(s) && /document\.hidden/.test(s) && /visibilitychange/.test(s), 'poll wiring missing');
  ok(/else \{ clearTimeout\(timer\); tick\(\); \}/.test(s), 'no immediate fetch on visible');
});
await gate('market: skeleton, letter-tile fallback, dash on failure, last good data kept', () => {
  const m = rd(join(dist, 'js/main.js'));
  ok(/skeletonRows/.test(m) && /tile-fallback/.test(m) && /kind: 'dash'/.test(m), 'ui fallbacks missing');
  ok(/lastTrending = t/.test(rd(join(dist, 'js/market.js'))) && /trending: lastTrending, own: lastOwn, failed: true/.test(rd(join(dist, 'js/market.js'))), 'last good not kept');
  ok(V.rowHtml({ key: 'z', kind: 'live', name: 'Zed', symbol: 'ZED', logo: '', price: 1, chg: 1, vol: 1, liq: 1, address: 'z' }, 2).includes('tile-fallback'), 'no letter tile when imageUrl missing');
  ok(V.rowHtml({ key: 'z', kind: 'dash', name: '–', price: NaN, chg: NaN, vol: NaN, liq: NaN }, 2).includes('>–<'), 'no dash');
});
await gate('market: each row has a 44px copy-address button', () => {
  const h = V.rowHtml({ key: 'z', kind: 'live', name: 'Zed', symbol: 'Z', logo: '', price: 1, chg: 1, vol: 1, liq: 1, address: 'AAA' }, 2);
  ok(/data-copy="AAA"/.test(h) && /\.copy\{width:44px;height:44px/.test(css), 'copy button');
});

/* ---------- motion ---------- */
await gate('motion: reduced-motion fallback covers animation, transition, scroll-behaviour and js effects', () => {
  ok(/@media \(prefers-reduced-motion:reduce\)\{\s*\*,\*::before,\*::after\{animation:none!important;transition:none!important/.test(css), 'css blanket');
  const fx = rd(join(dist, 'js/fx.js'));
  ok((fx.match(/reduced\(\)/g) || []).length >= 4, 'js effects not guarded');
  for (const k of ['springValue', 'parallax', 'progressBar', 'spotlight', 'countTo']) ok(fx.includes(k), k + ' missing');
  ok(/\.progress\{position:fixed/.test(css) && /@keyframes dotPulse/.test(css) && /@keyframes shimmer/.test(css) && /phmarq 60s linear infinite/.test(css), 'css motion pieces');
});

/* ---------- copy ---------- */
const words = (s) => s.toLowerCase().replace(/[^a-z0-9$%\s]/g, ' ').split(/\s+/).filter(Boolean);
const grams = (s) => { const w = words(s), o = new Set(); for (let i = 0; i < w.length - 1; i++) o.add(w[i] + ' ' + w[i + 1]); return o; };
await gate('copy: zero shared 2-grams with the reference', () => {
  const ref = grams(rd(join(root, 'scripts/fixtures/reference-copy.txt')));
  const ours = [textOf(html), V.tilesHtml(reg), V.chipsHtml(reg), V.caHtml(reg), V.headHtml, rd(join(dist, 'js/main.js')).match(/'[^']{12,}'/g)?.join(' ') ?? ''].map((x) => textOf(x)).join(' \n ');
  const shared = [...grams(ours)].filter((g) => ref.has(g));
  ok(!shared.length, 'shared: ' + shared.slice(0, 12).join(' | '));
});

/* ---------- repo hygiene ---------- */
await gate('hygiene: no assistant config files, no AI attribution anywhere in the project', () => {
  ok(!existsSync(join(root, 'CLAU' + 'DE.md')) && !existsSync(join(root, '.clau' + 'de')), 'forbidden file');
  const re = new RegExp(['cla' + 'ude', 'anthro' + 'pic', 'co-auth' + 'ored', 'generated' + ' with', 'chat' + 'gpt', 'open' + 'ai'].join('|'), 'i');
  const hits = walk(root).filter((f) => !f.includes(join(root, 'brand')) && !f.includes(join(root, 'reference')) && /\.(md|html|css|js|mjs|json|txt|svg)$|LICENSE$/.test(f) && re.test(rd(f)));
  ok(!hits.length, 'attribution text in: ' + hits.map((h) => relative(root, h)).join(', '));
});
await gate('repo content: README, whitepaper, MIT licence in root; none shipped in dist', () => {
  for (const f of ['README.md', 'docs/whitepaper.md', 'LICENSE']) ok(existsSync(join(root, f)), f + ' missing');
  ok(/MIT License/.test(rd(join(root, 'LICENSE'))) && /HOLDORA, 2026/.test(rd(join(root, 'LICENSE'))), 'licence text');
  const shipped = walk(dist).map((f) => relative(dist, f).toLowerCase());
  ok(!shipped.some((f) => /readme|whitepaper|license/.test(f)), 'repo docs leaked into dist');
});

const failed = results.filter((r) => !r[1]).length;
console.log(`\n${results.length} gates, ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
