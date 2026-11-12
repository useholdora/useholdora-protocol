import reg from './register.js';
import { isStated } from './registry.js';
import { socialHtml, caHtml, tilesHtml, chipsHtml, rowHtml, tickerHtml, skeletonRows, headHtml, fmt, PLACEHOLDER_OWN } from './view.js';
import { startPolling, composeBoard } from './market.js';
import { reveal, parallax, progressBar, spotlight, countTo, copyText } from './fx.js';

document.documentElement.classList.add('js');
const $ = (s) => document.querySelector(s);

// Register-driven slots, read off the live record at runtime.
$('#slot-social').innerHTML = socialHtml(reg);
$('#slot-ca').innerHTML = caHtml(reg);
$('#slot-tiles').innerHTML = tilesHtml(reg);
$('#slot-chips').innerHTML = chipsHtml(reg);

progressBar($('.progress i'));
spotlight();
parallax($('.hero'));
reveal();

/* ---------- copy handling (CA slot + every row) ---------- */
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  const ok = await copyText(b.dataset.copy);
  if (b.classList.contains('ca-text')) {
    const hint = b.parentElement.querySelector('.ca-hint');
    hint.textContent = ok ? 'Copied' : 'Press Ctrl+C';
    setTimeout(() => { hint.textContent = ''; }, 1800);
  } else {
    b.dataset.done = '1'; b.setAttribute('aria-label', ok ? 'Copied' : 'Copy failed');
    setTimeout(() => { b.dataset.done = ''; b.setAttribute('aria-label', 'Copy address'); }, 1400);
  }
});

// Image failure -> letter tile (own row falls back to the brand logo first).
document.addEventListener('error', (e) => {
  const im = e.target;
  if (!(im instanceof HTMLImageElement) || !im.classList.contains('logo')) return;
  if (im.dataset.own === '1' && !im.src.endsWith('assets/logo-96.png')) { im.src = 'assets/logo-96.png'; return; }
  const s = document.createElement('span'); s.className = 'tile-fallback'; s.setAttribute('aria-hidden', 'true'); s.textContent = im.dataset.letter || '?';
  im.replaceWith(s);
}, true);

/* ---------- market board ---------- */
const board = $('#board-rows'), ticker = $('#ticker'), errBox = $('#board-err');
const pills = [...document.querySelectorAll('.pill')];
let sortMode = 'volume';
let data = { trending: null, own: null };
const rowsByKey = new Map();
const LABEL = { loading: 'Loading market', live: 'Market live', refreshing: 'Market live', stale: 'Retrying feed', down: 'Feed unreachable' };

function setState(s) {
  const dot = s === 'refreshing' ? 'live' : s;
  pills.forEach((p) => { p.dataset.state = dot; p.querySelector('.pill-text').textContent = LABEL[s]; });
  errBox.classList.toggle('on', s === 'down' || s === 'stale');
  errBox.textContent = s === 'down' ? 'The market feed did not answer. Figures show a dash until it does.' : s === 'stale' ? 'The feed missed a refresh. The last good figures stay on screen.' : '';
}

function sorted(trending) {
  const t = [...(trending || [])];
  return sortMode === 'move' ? t.sort((a, b) => (b.chg || -Infinity) - (a.chg || -Infinity)) : t;
}

const KINDS = { 'c-price': ['price', 'price', fmt.price], 'c-chg': ['chg', 'pct', fmt.pct], 'c-vol': ['vol', 'usd', fmt.usd], 'c-liq': ['liq', 'usd', fmt.usd] };

function updateRow(el, m, rank, first) {
  el.querySelector('.rank').textContent = rank;
  for (const [cls, [field, kind, f]] of Object.entries(KINDS)) {
    const c = el.querySelector('.' + cls);
    const v = m[field];
    countTo(c, v, f, { from: first ? 0 : undefined, flash: !first });
    if (kind === 'pct') c.classList.toggle('up', v > 0), c.classList.toggle('down', v < 0);
  }
  if (m.liqLabel === 'Mkt Cap') el.querySelector('.c-liq').title = 'Mkt Cap'; else el.querySelector('.c-liq').removeAttribute('title');
}

function render() {
  let models = composeBoard(reg, data.own, sorted(data.trending), PLACEHOLDER_OWN);
  if (!data.trending) { // source failed and nothing good was ever kept: dashes, not zeros
    const dashes = Array.from({ length: 9 }, (_, i) => ({ key: 'dash' + i, kind: 'dash', own: false, name: '–', symbol: '', price: NaN, chg: NaN, vol: NaN, liq: NaN, liqLabel: 'Liq' }));
    models = [models[0], ...dashes];
  }
  ticker.innerHTML = tickerHtml(models);
  board.innerHTML = headHtml;
  const frag = document.createDocumentFragment();
  const nextKeys = new Set();
  models.forEach((m, i) => {
    nextKeys.add(m.key);
    let el = rowsByKey.get(m.key);
    const fresh = !el || el.dataset.kind !== m.kind;
    if (fresh) {
      const tmp = document.createElement('div'); tmp.innerHTML = rowHtml(m, i + 1);
      el = tmp.firstElementChild; el.dataset.kind = m.kind;
      el.classList.add('spot', 'fresh'); el.style.animationDelay = i * 45 + 'ms';
      rowsByKey.set(m.key, el);
    }
    if (m.kind === 'live') updateRow(el, m, i + 1, fresh);
    else el.querySelector('.rank').textContent = i + 1;
    frag.appendChild(el);
  });
  for (const k of [...rowsByKey.keys()]) if (!nextKeys.has(k)) rowsByKey.delete(k);
  board.appendChild(frag);
}

function paintSkeleton(own) {
  board.innerHTML = headHtml;
  const tmp = document.createElement('div'); tmp.innerHTML = rowHtml(own, 1);
  const el = tmp.firstElementChild; el.classList.add('spot'); board.appendChild(el);
  const sk = document.createElement('div'); sk.innerHTML = skeletonRows(9); board.append(...sk.children);
  rowsByKey.clear();
}

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[role="tab"]'); if (!b) return;
  sortMode = b.dataset.sort;
  document.querySelectorAll('#tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  if (data.trending) render();
});

if (!isStated(reg.market)) {
  board.innerHTML = headHtml; board.insertAdjacentHTML('beforeend', rowHtml(PLACEHOLDER_OWN, 1));
  ticker.innerHTML = tickerHtml([PLACEHOLDER_OWN]); setState('down');
  errBox.textContent = 'Market source pending.'; errBox.classList.add('on');
} else {
  paintSkeleton(composeBoard(reg, null, [], PLACEHOLDER_OWN)[0]);
  ticker.innerHTML = '<span class="skeleton-line"></span>';
  setState('loading');
  startPolling({
    reg,
    onState: setState,
    onData: (d) => { data = { trending: d.trending, own: d.own }; render(); },
  });
}
