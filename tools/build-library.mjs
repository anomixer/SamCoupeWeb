#!/usr/bin/env node
/**
 * SamCoupeWeb Software Library generator
 *
 * Scrapes the World of SAM catalogue (https://www.worldofsam.org) and writes
 * wasm/deploy/library-data.js, which the emulator front-end loads as window.SAM_LIBRARY.
 *
 * Node 18+ (global fetch). No dependencies.
 *
 * Usage:
 *   node tools/build-library.mjs                 # full refresh
 *   node tools/build-library.mjs --categories 3  # single category (debug)
 *
 * Notes:
 *   - The World of SAM site is a Drupal "Views" table listing, one product per row.
 *   - Product pages carry the download file(s) and the full-size title screenshot.
 *   - Product thumbnails on the listing are ~60px; the original image (same path
 *     without the /styles/<style>/ segment) is used instead, so cards stay sharp.
 *   - Entries with no playable download are kept (the site lists them) and the
 *     front-end greys them out.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WOS = 'https://www.worldofsam.org';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'wasm', 'deploy', 'library-data.js');
const RECOVERY = join(HERE, 'library-recovery.json');
const UA = 'SamCoupeWeb-Library-Builder/1.0 (+https://github.com/anomixer/SamCoupeWeb)';

const CATEGORIES = [
  { key: 'games', id: 3, label: 'Games' },
  { key: 'demos', id: 4, label: 'Demos' },
  { key: 'utilities', id: 5, label: 'Utilities' },
];

const MEDIA_EXT = new Set(['dsk', 'mgt', 'sad', 'hdf', 'tap', 'tzx', 'zip', '7z', 'gz']);
const CONCURRENCY = 8;
const RETRIES = 3;

const argv = process.argv.slice(2);
const onlyCat = argv.includes('--categories') ? new Set(argv[argv.indexOf('--categories') + 1].split(',')) : null;
const cats = onlyCat ? CATEGORIES.filter(c => onlyCat.has(String(c.id))) : CATEGORIES;

const decode = s => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(x?)([0-9a-fA-F]+);/g, (m, hex, n) => String.fromCodePoint(parseInt(n, hex ? 16 : 10)));

const stripTags = s => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function fetchText(url) {
  let lastErr;
  for (let i = 0; i < RETRIES; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.text();
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

/** Absolute URL for a site-relative href/src, keeping the query string off images. */
function abs(href, keepQuery = true) {
  if (!href) return '';
  const h = decode(href);
  const u = h.startsWith('http') ? h : WOS + (h.startsWith('/') ? h : '/' + h);
  return keepQuery ? u : u.split('?')[0];
}

const MEDIA_RE = /\.(dsk|mgt|sad|hdf|tap|tzx|zip|7z|gz)(?:[?#].*)?$/i;

// Pages a product page points at (publisher sites, author pages) are followed one
// hop so an image hosted there can still be mounted. Sources that only carry
// Spectrum/emulator binaries or source tarballs are never treated as SAM media,
// and an off-site file only counts when it lives on the same site as the landing
// page or on a well-known file host.
const OFFSITE_MAX = 5;
const LANDING_BLOCK = /(?:youtube\.com|youtu\.be|facebook\.com|twitter\.com|x\.com|instagram\.com|tiktok\.com|linkedin\.com|patreon\.com|ko-fi\.com)/i;
const OFFSITE_BLOCK = /(?:worldofspectrum\.org|worldofspectrum\.net|spectrumcomputing|simonowen\.com|fms\.komkon\.org|chibiakumas\.com|chibialiens\.com|zx81\.free\.fr)/i;
const OFFSITE_ALLOW = /^(?:github\.com|raw\.githubusercontent\.com|drive\.google\.com|drive\.usercontent\.google\.com|dropbox\.com|archive\.org|itch\.io)$/i;
const landingCache = new Map();

/** Registrable-ish domain: enough to keep subdomains of one publisher together. */
function hostRoot(host) {
  const parts = String(host).toLowerCase().replace(/^www\./, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  const last2 = parts.slice(-2).join('.');
  return /^(?:co|com|org|gov|ac|net|edu)\.[a-z]{2}$/.test(last2) ? parts.slice(-3).join('.') : last2;
}

const GENERIC_TITLE_WORDS = new Set([
  'the', 'and', 'for', 'of', 'a', 'sam', 'coupe', 'coupé', 'disk', 'disks', 'dsk', 'mgt',
  'zip', 'utility', 'utilities', 'video', 'tutorial', 'tutorials', 'series', 'edition',
  'software', 'game', 'games', 'demo', 'demos',
]);

function words(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/).filter(Boolean);
}

/** Off-site files must actually relate to the product, not a generic download nearby. */
function mediaMatchesTitle(title, name) {
  const wanted = words(title).filter(w => !GENERIC_TITLE_WORDS.has(w));
  if (!wanted.length) return true;
  const have = words(name);
  const joined = have.join('');
  return wanted.some(w => have.includes(w) || joined.includes(w));
}

/** Fetch a product's outbound page once and remember its final HTML. */
function fetchLanding(url) {
  if (landingCache.has(url)) return landingCache.get(url);
  const task = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: ctrl.signal });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || (ct && !/text\/html|text\/plain/i.test(ct))) {
        try { await res.body?.cancel(); } catch { /* ignore */ }
        return null;
      }
      const len = Number(res.headers.get('content-length') || 0);
      if (len > 2 * 1024 * 1024) { try { await res.body?.cancel(); } catch { /* ignore */ } return null; }
      const html = await res.text();
      return html.length > 2 * 1024 * 1024 ? null : { finalUrl: res.url, html };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  })();
  landingCache.set(url, task);
  return task;
}

function extOf(nameOrUrl) {
  const m = String(nameOrUrl).split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}

function basename(href) {
  try { return decodeURIComponent(String(href).split(/[?#]/)[0].split('/').pop() || ''); }
  catch { return String(href).split(/[?#]/)[0].split('/').pop() || ''; }
}

/** List a ZIP's entry names using only its central directory (no decompression). */
function zipNames(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return [];
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < count && off + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    names.push(buf.toString('utf8', off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

async function fetchBytes(url, cap = 12 * 1024 * 1024) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const len = Number(res.headers.get('content-length') || 0);
  if (len > cap) { try { await res.body?.cancel(); } catch { /* ignore */ } return null; }
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > cap ? null : buf;
}

/** Read a download's filename/size without consuming the body. */
async function probe(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    let name = '';
    if (m) {
      try { name = decodeURIComponent(m[1].trim().replace(/^"|"$/g, '')); }
      catch { name = m[1].trim().replace(/^"|"$/g, ''); }
    }
    const out = {
      ok: res.ok,
      status: res.status,
      ct: res.headers.get('content-type') || '',
      size: Number(res.headers.get('content-length') || 0),
      name,
      finalUrl: res.url,
    };
    try { await res.body?.cancel(); } catch { /* ignore */ }
    return out;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Turn a Google Drive / Dropbox share link (or a GitHub blob page) into a direct download URL. */
function resolveIndirect(href) {
  try {
    const u = new URL(href, WOS);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = u.hostname.replace(/^www\./i, '');
    if (host === 'drive.google.com' || host === 'drive.usercontent.google.com') {
      const id = (u.pathname.match(/\/file\/d\/([\w-]+)/) || [])[1] || u.searchParams.get('id');
      return id ? `https://drive.usercontent.google.com/download?id=${id}&export=download` : null;
    }
    if (host === 'dropbox.com' || host === 'www.dropbox.com') {
      u.searchParams.set('dl', '1');
      return u.toString();
    }
    if (host === 'github.com' && /^\/[^/]+\/[^/]+\/blob\//.test(u.pathname)) {
      // Repo file view is HTML; the raw host serves the bytes with the same path.
      return 'https://raw.githubusercontent.com' + u.pathname.replace('/blob/', '/') + (u.search || '');
    }
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Every link on a page, resolved to an absolute URL. Bare media URLs that were
 * pasted as text (not wrapped in an anchor) are included too.
 */
function candidateLinks(html, baseUrl) {
  const urls = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const raw = decode(m[1]).trim();
    if (!raw || raw.startsWith('#') || /^(mailto|javascript|ftp|tel):/i.test(raw)) continue;
    try { urls.push(new URL(raw, baseUrl).toString()); } catch { /* malformed href */ }
  }
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>]+\.(?:dsk|mgt|sad|hdf|tap|tzx|zip|7z|gz)(?:[?#][^\s"'<>]*)?/gi)) {
    urls.push(decode(m[0]));
  }
  return [...new Set(urls)];
}

/** Resolve, name and validate one media URL; returns null when it is not playable. */
async function validateMedia(url, landingHost) {
  const resolved = resolveIndirect(url);
  if (!resolved) return null;

  let host = '';
  try { host = new URL(resolved).hostname.replace(/^www\./i, ''); } catch { return null; }
  if (landingHost) {
    if (OFFSITE_BLOCK.test(host)) return null;
    const sameSite = hostRoot(host) === hostRoot(landingHost);
    if (!sameSite && !OFFSITE_ALLOW.test(host)) return null;
  }

  let name = basename(resolved);
  let ext = extOf(name);
  if (!MEDIA_EXT.has(ext) || landingHost) {
    // Off-site links need a real content check: repo file views and download
    // buttons can end in .dsk while actually serving an HTML page.
    const p = await probe(resolved);
    if (!p || !p.ok || /text\/html/i.test(p.ct)) return null;
    name = p.name || basename(p.finalUrl || resolved);
    ext = extOf(name) || ext;
  }
  if (!MEDIA_EXT.has(ext)) return null;
  // Off-site pages routinely offer .7z source drops and .gz tooling; only the
  // World of SAM / curated files may use those containers.
  if (landingHost && (ext === '7z' || ext === 'gz')) return null;
  if (/manual|readme|cheat|source|\bsrc\b|windows|linux|macos/i.test(name)) return null;
  if (ext === 'zip') {
    const buf = await fetchBytes(resolved);
    const names = buf ? zipNames(buf) : [];
    if (!names.some(n => MEDIA_EXT.has(extOf(n)))) return null;
  } else if (ext === '7z' || ext === 'gz') {
    return null;
  }
  return { n: name, u: resolved, t: ext };
}

/**
 * Find playable media anywhere on a product page - not just in the download
 * field. This catches direct links in the description, Google Drive / Dropbox
 * shares and GitHub release assets, and validates archives by listing their
 * entries so manuals, source tarballs or emulator binaries are never attached.
 * If the page only links out (e.g. to a publisher's own game page), that page
 * is followed once and scanned for a real SAM image (unless allowOutbound is
 * false for copyright-restricted titles).
 */
async function collectPageFiles(html, pageUrl, title, allowOutbound = true) {
  const direct = [];
  const landings = [];
  for (const url of candidateLinks(html, pageUrl)) {
    if (!/^https?:/i.test(url)) continue;
    if (MEDIA_EXT.has(extOf(url)) || /drive\.google\.com|dropbox\.com/i.test(url)) direct.push(url);
    else if (!/worldofsam\.org/i.test(url) && !LANDING_BLOCK.test(url)) landings.push(url);
  }

  const out = [];
  const seen = new Set();
  const push = f => {
    if (!f) return;
    const key = f.u + '|' + f.n;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(f);
  };

  for (const url of direct.slice(0, 24)) {
    if (out.length >= 8) break;
    push(await validateMedia(url, null));
  }

  if (!allowOutbound) return out;

  for (const landing of [...new Set(landings)].slice(0, OFFSITE_MAX)) {
    if (out.length >= 8) break;
    const page = await fetchLanding(landing);
    if (!page) continue;
    let landingHost = '';
    try { landingHost = new URL(page.finalUrl).hostname.replace(/^www\./i, ''); } catch { /* ignore */ }
    let used = 0;
    for (const url of candidateLinks(page.html, page.finalUrl)) {
      if (out.length >= 8 || used >= 4) break;
      if (!MEDIA_EXT.has(extOf(url)) || OFFSITE_BLOCK.test(url)) continue;
      const f = await validateMedia(url, landingHost);
      if (f && mediaMatchesTitle(title || '', f.n)) { push(f); used++; }
    }
  }
  return out;
}

/** /sites/default/files/styles/<style>/public/2021-05/x.png -> /sites/default/files/2021-05/x.png */
function originalImage(src) {
  const clean = abs(src, false);
  return clean.replace(/\/styles\/[^/]+\/public\//, '/');
}

function parseListing(html) {
  const items = [];
  const body = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
  const rows = body.split(/<tr>/).slice(1);
  for (const row of rows) {
    const titleM = row.match(/views-field-title[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleM) continue;
    const imgM = row.match(/views-field-field-title-image[\s\S]*?<img[^>]*src="([^"]+)"/);
    const yearM = row.match(/views-field-field-release-year">\s*([\s\S]*?)<\/td>/);
    const year = yearM ? stripTags(yearM[1]) : '';
    items.push({
      href: decode(titleM[1]),
      title: stripTags(titleM[2]),
      year: /^\d{4}$/.test(year) ? Number(year) : null,
      img: imgM ? originalImage(imgM[1]) : '',
    });
  }
  return items;
}

function lastPageIndex(html) {
  // Pager links are HTML-escaped in the markup: ?field_category_target_id=3&amp;page=7
  const pages = [...html.matchAll(/(?:\?|&|&amp;)page=(\d+)/g)].map(m => Number(m[1]));
  return pages.length ? Math.max(...pages) : 0;
}

async function parseProduct(html, pageUrl, title) {
  const files = [];
  const block = html.match(/field--name-field-download([\s\S]*?)<\/div>\s*<\/div>/);
  if (block) {
    for (const m of block[1].matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const name = stripTags(m[2]);
      const ext = (name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
      if (!MEDIA_EXT.has(ext)) continue;
      files.push({ n: name, u: abs(m[1]), t: ext });
    }
  }

  // "Copyrights Declined" products render a locked span instead of a link.
  const blocked = /not been approved|file--protected|fa-lock/i.test(html);

  // Nothing in the download field: look for a real image elsewhere on the page
  // (Google Drive / Dropbox shares, GitHub releases, direct /sites links). For
  // titles the site marks copyright-restricted only links published on the
  // page itself count - no outbound publisher pages are followed.
  if (!files.length) {
    try {
      files.push(...await collectPageFiles(html, pageUrl || WOS, title || '', !blocked));
    } catch (e) {
      console.error(`  ! page media scan: ${e.message}`);
    }
  }

  const shotM = html.match(/field--name-field-title-image[^>]*>\s*<img[^>]*src="([^"]+)"/);
  let shot = shotM ? originalImage(shotM[1]) : '';
  if (!shot) {
    const scr = html.match(/field--name-field-screenshots([\s\S]*?)<\/div>/);
    const im = scr && scr[1].match(/<img[^>]*src="([^"]+)"/);
    if (im) shot = originalImage(im[1]);
  }

  const catM = html.match(/field--name-field-category[^>]*>\s*([^<]+)</);
  const return_ = { files, shot, catLabel: catM ? decode(catM[1]).trim() : '', blocked };

  return return_;
}

async function build() {
  const started = Date.now();
  const all = [];

  for (const cat of cats) {
    const listUrl = page => `${WOS}/products?field_category_target_id=${cat.id}&page=${page}`;
    const first = await fetchText(listUrl(0));
    const pages = [first, ...await pool(
      Array.from({ length: lastPageIndex(first) }, (_, i) => i + 1),
      CONCURRENCY,
      p => fetchText(listUrl(p)),
    )];

    const rows = pages.flatMap(parseListing);
    const seen = new Set();
    const unique = rows.filter(r => !seen.has(r.href) && seen.add(r.href));
    console.log(`${cat.label}: ${unique.length} entries on ${pages.length} pages`);
    unique.forEach(r => all.push({ ...r, cat: cat.key }));
  }

  // Fetch each product page once (a product may appear in more than one category).
  const byHref = new Map();
  for (const it of all) if (!byHref.has(it.href)) byHref.set(it.href, it);
  const hrefs = [...byHref.keys()];

  let done = 0;
  const details = await pool(hrefs, CONCURRENCY, async href => {
    const item = byHref.get(href);
    let info = { files: [], shot: '', catLabel: '', desc: '', blocked: false };
    try {
      info = await parseProduct(await fetchText(WOS + href), WOS + href, item.title);
    } catch (e) {
      console.error(`  ! ${href}: ${e.message}`);
    }
    if (++done % 50 === 0) console.log(`  ... ${done}/${hrefs.length} product pages`);
    return { ...item, ...info };
  });
  const detailByHref = new Map(details.map(d => [d.href, d]));

  // Curated playable media for titles whose World of SAM page only links out to
  // a compilation or a dead page (sources are recorded in library-recovery.json).
  const recovery = new Map();
  if (existsSync(RECOVERY)) {
    for (const r of JSON.parse(readFileSync(RECOVERY, 'utf8'))) {
      if (r && r.u && Array.isArray(r.files) && r.files.length) recovery.set(r.u, r.files);
    }
  }

  const items = [];
  for (const it of all) {
    const d = detailByHref.get(it.href);
    if (!d) continue;
    // Curated recovery wins over a generic match: it pins a known-good URL
    // (or a locally mirrored file) and is allowed to override the scrape.
    // Restricted titles never get curated media.
    const curated = d.blocked ? null : recovery.get(it.href);
    const files = curated || (d.files && d.files.length ? d.files : []);
    items.push({
      t: d.title,
      y: d.year,
      c: d.cat,
      u: d.href,
      s: d.shot || d.img || '',
      ...(d.desc ? { x: d.desc } : {}),
      ...(d.blocked && !files.length ? { k: 1 } : {}),
      d: files,
    });
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

  const payload = {
    generated: new Date().toISOString(),
    source: WOS,
    categories,
    formats,
    items,
  };

  const header = `/**
 * SamCoupeWeb Software Library data
 * Generated: ${payload.generated}
 * Source:    ${WOS}
 * Entries:   ${items.length} (${available} with playable media)
 * Formats:   ${Object.entries(formats).map(([k, v]) => `${k}:${v}`).join(', ')}
 *
 * DO NOT EDIT BY HAND - regenerate with: node tools/build-library.mjs
 */
window.SAM_LIBRARY = ${JSON.stringify(payload, null, 0)};
`;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, header, 'utf8');
  console.log(`\nWrote ${OUT}`);
  console.log(`  entries: ${items.length}  available: ${available}  time: ${((Date.now() - started) / 1000).toFixed(0)}s`);
  console.log(`  formats: ${JSON.stringify(formats)}`);
}

build().catch(e => {
  console.error('BUILD FAILED:', e);
  process.exit(1);
});
