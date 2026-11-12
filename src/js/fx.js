// Motion helpers. Every one of them collapses to an instant result under prefers-reduced-motion.
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Damped spring solver: x'' = -k (x - 1) - c x'. Semi-implicit Euler, fixed substep.
export function springValue(k = 170, c = 22) {
  let x = 0, v = 0;
  return (dt) => {
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) { v += (-k * (x - 1) - c * v) * h; x += v * h; }
    return { x, done: Math.abs(x - 1) < 0.0015 && Math.abs(v) < 0.0015 };
  };
}

export function reveal(root = document) {
  const items = [...root.querySelectorAll('.rv')];
  if (reduced() || !('IntersectionObserver' in window)) { items.forEach((e) => { e.style.opacity = 1; }); return; }
  const groups = new Map();
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      io.unobserve(en.target);
      const idx = (groups.get(en.target.parentElement) || 0);
      groups.set(en.target.parentElement, idx + 1);
      play(en.target, idx * 70);
    }
  }, { threshold: 0.12 });
  items.forEach((e) => { e.style.transform = 'translateY(28px)'; io.observe(e); });
  setTimeout(() => groups.clear(), 0);
}
function play(el, delay) {
  const sp = springValue();
  let last = 0;
  const frame = (t) => {
    if (!last) last = t;
    const { x, done } = sp(Math.min(0.05, (t - last) / 1000)); last = t;
    el.style.opacity = Math.max(0, Math.min(1, x));
    el.style.transform = `translateY(${(1 - x) * 28}px)`;
    if (!done) requestAnimationFrame(frame); else { el.style.opacity = 1; el.style.transform = 'none'; }
  };
  setTimeout(() => requestAnimationFrame(frame), delay);
}

export function parallax(hero) {
  if (!hero || reduced()) return;
  const layers = [...hero.querySelectorAll('[data-depth]')];
  let px = 0, py = 0, tx = 0, ty = 0, sy = 0, raf = 0;
  const loop = () => {
    px += (tx - px) * 0.08; py += (ty - py) * 0.08;
    for (const l of layers) {
      const d = parseFloat(l.dataset.depth);
      l.style.transform = `translate3d(${(px * d * 40).toFixed(2)}px,${(py * d * 30 + sy * d * 0.4).toFixed(2)}px,0)`;
    }
    raf = (Math.abs(tx - px) > 0.001 || Math.abs(ty - py) > 0.001) ? requestAnimationFrame(loop) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    tx = (e.clientX - r.left) / r.width - 0.5; ty = (e.clientY - r.top) / r.height - 0.5; kick();
  });
  hero.addEventListener('pointerleave', () => { tx = 0; ty = 0; kick(); });
  addEventListener('scroll', () => { sy = Math.min(scrollY, hero.offsetHeight); kick(); }, { passive: true });
}

export function progressBar(bar) {
  const set = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
  };
  addEventListener('scroll', set, { passive: true }); addEventListener('resize', set); set();
}

export function spotlight(root = document) {
  if (reduced()) return;
  root.addEventListener('pointermove', (e) => {
    const t = e.target.closest?.('.spot'); if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', e.clientX - r.left + 'px'); t.style.setProperty('--my', e.clientY - r.top + 'px');
  });
}

const ease = (t) => 1 - Math.pow(1 - t, 3);
// Count a cell to a new value; flash when it changes on an update.
export function countTo(el, to, format, { from, flash = false, ms = 650 } = {}) {
  const prev = el.dataset.v === '' || el.dataset.v == null ? NaN : Number(el.dataset.v);
  const start = Number.isFinite(from) ? from : prev;
  el.dataset.v = Number.isFinite(to) ? String(to) : '';
  if (flash && Number.isFinite(prev) && Number.isFinite(to) && prev !== to) {
    const c = to > prev ? 'flash-up' : 'flash-down';
    el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth; el.classList.add(c);
  }
  if (reduced() || !Number.isFinite(to) || !Number.isFinite(start) || start === to) { el.textContent = format(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / ms);
    el.textContent = format(start + (to - start) * ease(p));
    if (p < 1) requestAnimationFrame(step); else el.textContent = format(to);
  };
  requestAnimationFrame(step);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}
