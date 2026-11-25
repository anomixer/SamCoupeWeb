#!/usr/bin/env node
/**
 * SamCoupeWeb Software Library generator
 *
 * Builds wasm/deploy/library-data.js (window.SAM_LIBRARY) from the World of SAM
 * JSON API - no HTML scraping:
 *
 *   https://www.worldofsam.org/api/products.json        all product pages
 *   https://www.worldofsam.org/api/products/<nid>.json  details + download files
 *
 * World of SAM asked (2026-11-18) that the title list be taken from this API
 * rather than parsed out of the catalogue HTML. Products the API does not list
 * (mostly titles with no attached download) are preserved as curated entries in
 * tools/library-extra.json. Copyright-restricted ("lock icon") titles are never
 * included in the selection interface.
 *
 * Node 18+ (global fetch). No dependencies.
 *
 * Usage:
 *   node tools/build-library.mjs                 # full refresh
 *   node tools/build-library.mjs --categories games,utilities
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WOS = 'https://www.worldofsam.org';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'wasm', 'deploy', 'library-data.js');
const INDEX = join(HERE, '..', 'wasm', 'deploy', 'index.html');
const EXTRA = join(HERE, 'library-extra.json');
const UA = 'SamCoupeWeb-Library-Builder/1.3 (+https://github.com/anomixer/SamCoupeWeb)';

const CATEGORIES = [
  { key: 'games', api: 'game', id: 3, label: 'Games' },
  { key: 'demos', api: 'demo', id: 4, label: 'Demos' },
  { key: 'utilities', api: 'utility', id: 5, label: 'Utilities' },
];

const MEDIA_EXT = new Set(['dsk', 'mgt', 'sad', 'hdf', 'tap', 'tzx', 'zip', '7z', 'gz']);
const NON_MEDIA = /manual|readme|cheat|source|\bsrc\b|windows|linux|macos/i;
const RESTRICTED = /declin|restrict|not been approved|protected/i;
const CONCURRENCY = 8;
const RETRIES = 3;

const argv = process.argv.slice(2);
const onlyCat = argv.includes('--categories')
  ? new Set(argv[argv.indexOf('--categories') + 1].split(','))
  : null;
const cats = onlyCat ? CATEGORIES.filter(c => onlyCat.has(c.key) || onlyCat.has(String(c.id))) : CATEGORIES;

async function fetchJson(url) {
  let lastErr;
  for (let i = 0; i < RETRIES; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

const extOf = name => ((String(name).split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i) || [, ''])[1] || '').toLowerCase();

/** Product path as used by the front-end: /products/<slug>. */
function productPath(url) {
  try {
    const u = new URL(url, WOS);
    if (u.origin === new URL(WOS).origin) return u.pathname;
  } catch { /* keep raw */ }
  return String(url || '');
}

/** Only real SAM media; API records also contain manuals and PDFs. */
function mediaFiles(files) {
  const out = [];
  const seen = new Set();
  for (const f of (Array.isArray(files) ? files : [])) {
    if (!f) continue;
    // API records use { name, url, size }; curated entries use { n, u, t }.
    const url = f.url || f.u;
    if (!url) continue;
    const name = String(f.name || f.n || '').trim() || decodeURIComponent(String(url).split('/').pop() || '');
    const ext = extOf(name) || extOf(url) || (f.t || '');
    if (!MEDIA_EXT.has(ext) || NON_MEDIA.test(name)) continue;
    const key = url + '|' + name;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ n: name, u: String(url), t: ext });
  }
  return out;
}

async function build() {
  const started = Date.now();
  const list = await fetchJson(`${WOS}/api/products.json`);
  const byCat = new Map();
  for (const cat of cats) byCat.set(cat.key, []);

  for (const p of (Array.isArray(list) ? list : [])) {
    if (!p || !p.url || RESTRICTED.test(String(p.copyrights || ''))) continue;
    const cat = cats.find(c => String(p.category || '').toLowerCase() === c.api);
    if (!cat) continue;
    byCat.get(cat.key).push(p);
  }

  const all = cats.flatMap(cat => byCat.get(cat.key).map(p => ({ p, cat })));
  // A product can appear in more than one view; its files are fetched once.
  const unique = [];
  const seen = new Set();
  for (const entry of all) {
    const key = String(entry.p.nid);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  console.log(`API: ${list.length} products, ${unique.length} in ${cats.map(c => c.label).join(' / ')}`);

  let done = 0;
  const details = await pool(unique, CONCURRENCY, async entry => {
    let info = null;
    try {
      const payload = await fetchJson(`${WOS}/api/products/${entry.p.nid}.json`);
      // The detail endpoint returns a one-element array; unwrap it.
      info = Array.isArray(payload) ? payload[0] : payload;
    } catch (e) { console.error(`  ! nid ${entry.p.nid}: ${e.message}`); }
    if (++done % 50 === 0) console.log(`  ... ${done}/${unique.length} product details`);
    return { entry, info: info && !RESTRICTED.test(String(info.copyrights || '')) ? info : null };
  });

  const items = [];
  const apiPaths = new Set();
  for (const { entry, info } of details) {
    const { p, cat } = entry;
    const path = productPath(info && info.url ? info.url : p.url);
    apiPaths.add(path.toLowerCase());
    const files = mediaFiles(info ? info.files : p.files);
    items.push({
      t: String(info && info.title ? info.title : p.title || ''),
      y: Number(info && info.year ? info.year : p.year) || null,
      c: cat.key,
      u: path,
      s: (info && info.image ? info.image : p.image) || '',
      d: files,
    });
  }

  // Titles missing from the API are kept as static, curated data. This is not
  // scraping: the entries live in the repository and are reviewed by hand.
  if (existsSync(EXTRA)) {
    const extra = JSON.parse(readFileSync(EXTRA, 'utf8'));
    let added = 0;
    for (const e of (Array.isArray(extra) ? extra : [])) {
      if (!e || !e.u || e.k) continue; // never re-admit a restricted title
      if (apiPaths.has(String(e.u).toLowerCase())) continue;
      items.push({ t: e.t, y: e.y || null, c: e.c, u: e.u, s: e.s || '', d: mediaFiles(e.d) });
      added++;
    }
    console.log(`Curated extras: ${added} (copyright-restricted entries skipped)`);
  }

  const categories = cats.map(cat => ({
    key: cat.key,
    id: cat.id,
    label: cat.label,
    count: items.filter(i => i.c === cat.key).length,
  }));

  const available = items.filter(i => i.d.length > 0).length;
  const formats = {};
  items.forEach(i => i.d.forEach(f => { formats[f.t] = (formats[f.t] || 0) + 1; }));

  const generated = new Date().toISOString();
  const payload = {
    generated,
    source: `${WOS}/api/products.json`,
    categories,
    formats,
    items,
  };

  const header = `/**
 * SamCoupeWeb Software Library data
 * Generated: ${generated}
 * Source:    ${payload.source}
 * Entries:   ${items.length} (${available} with playable media)
 * Formats:   ${Object.entries(formats).map(([k, v]) => `${k}:${v}`).join(', ')}
 *
 * DO NOT EDIT BY HAND - regenerate with: node tools/build-library.mjs
 */
window.SAM_LIBRARY = ${JSON.stringify(payload)};
`;
  writeFileSync(OUT, header, 'utf8');

  // Keep the cache-busting token in index.html in step with the data snapshot,
  // otherwise returning visitors keep the previous catalogue for too long.
  if (existsSync(INDEX)) {
    const stamp = generated.slice(0, 10);
    const html = readFileSync(INDEX, 'utf8');
    const updated = html.replace(/library-data\.js\?v=\d{4}-\d{2}-\d{2}/g, `library-data.js?v=${stamp}`);
    if (updated !== html) writeFileSync(INDEX, updated, 'utf8');
  }

  console.log(`\nWrote ${OUT}`);
  console.log(`  entries: ${items.length}  available: ${available}  time: ${((Date.now() - started) / 1000).toFixed(0)}s`);
  console.log(`  formats: ${JSON.stringify(formats)}`);
}

build().catch(e => {
  console.error('BUILD FAILED:', e);
  process.exit(1);
});
