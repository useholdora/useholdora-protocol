// Build: src/ -> dist/. No dependencies. dist/ is what gets deployed.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src'), dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// 1. register -> js module (dates stay as data inside the record, never rendered)
const reg = JSON.parse(readFileSync(join(src, 'register.json'), 'utf8'));
mkdirSync(join(dist, 'js'), { recursive: true });
writeFileSync(join(dist, 'js', 'register.js'), 'export default ' + JSON.stringify(reg) + ';\n');

// 2. static files
cpSync(join(src, 'css'), join(dist, 'css'), { recursive: true });
for (const f of readdirSync(join(src, 'js'))) cpSync(join(src, 'js', f), join(dist, 'js', f));

// 3. assets: explicit list so a missing logo fails the build instead of shipping a broken page
const ASSETS = ['logo-96.png', 'logo-512.png', 'mark-720.png', 'mark-192.png', 'icon-64.png', 'favicon.svg'];
mkdirSync(join(dist, 'assets'), { recursive: true });
for (const a of ASSETS) {
  const from = join(src, 'assets', a);
  if (!existsSync(from)) throw new Error('missing asset: ' + a);
  cpSync(from, join(dist, 'assets', a));
}

// 4. render the register-driven slots into the page (same renderers the browser uses)
const v = await import(pathToFileURL(join(src, 'js', 'view.js')).href);
let html = readFileSync(join(src, 'index.html'), 'utf8');
const slots = { social: v.socialHtml(reg), ca: v.caHtml(reg), tiles: v.tilesHtml(reg), chips: v.chipsHtml(reg) };
for (const [k, val] of Object.entries(slots)) html = html.replace(`<!--@${k}-->`, val);
writeFileSync(join(dist, 'index.html'), html);

console.log('build ok -> dist/ (' + (ASSETS.length) + ' assets, logo: assets/logo-96.png)');
