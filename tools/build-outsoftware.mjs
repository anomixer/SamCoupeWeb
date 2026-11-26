#!/usr/bin/env node
/**
 * Build the experimental Outsoftware SAM Coupé catalogue.
 *
 * Outsoftware publishes a "SAM Coupé" section on its own game catalogue page
 * with a screenshot, a Mode/format line, a direct ZIP download and an Info
 * page for every title. This script reads that page server-side (there is no
 * CORS outside a browser), keeps only entries that actually offer a ZIP, and
 * writes:
 *
 *   wasm/deploy/outsoftware-data.js  -> window.OUTSOFTWARE_LIBRARY
 *   tools/prefetch-outsoftware.json  -> manifest for tools/prefetch-media.mjs
 *
 * Titles marked DENIED by the publisher are skipped. No ZIP bytes are stored
 * in git: the manifest only points at the publisher's own download URLs.
 *
 *   node tools/build-outsoftware.mjs
 *
 * Node 18+ (global fetch). No dependencies.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PAGE = 'https://outsoftware.it/games/';
const BASE = 'https://outsoftware.it';
const UA = 'SamCoupeWeb-Outsoftware-Builder/1.0 (+https://github.com/anomixer/SamCoupeWeb)';
const DATA = join(ROOT, 'wasm/deploy/outsoftware-data.js');
const MANIFEST = join(HERE, 'prefetch-outsoftware.json');

// These gallery entries are explicitly marked DENIED by the publisher (no ZIP
// is offered). Keep the list here as a guard in case a ZIP link appears later.
const DENIED = [
  'everyones-a-wally-sam-coupe',
  'tony-sam-coupe',
  'stevedore-sam-coupe'
];

const RETRIES = 3;

async function fetchText(url) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(60000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (attempt < RETRIES) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastErr;
}

function decode(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(url) {
  return url.split('/').pop().replace(/\.zip$/i, '').toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

const html = await fetchText(PAGE);
const start = html.indexOf('id="sam-coupe"');
if (start < 0) throw new Error('SAM Coupé section not found on ' + PAGE);
const nextH2 = html.indexOf('<h2', start + 20);
const section = html.slice(start, nextH2 < 0 ? html.length : nextH2);

// Each game is a wp-block-group containing an <img>, an <h3> and the
// "Mode 4 · MGT · ZIP ↓ · Info" paragraph.
const blocks = [...section.matchAll(
  /<div[^>]*class="[^"]*wp-block-group[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*wp-block-group[^"]*"|$)/g
)].map(m => m[1]);

const items = [];
const prefetch = [];
const usedSlugs = new Set();

for (const block of blocks) {
  const h3 = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
  const zip = block.match(/href="(https:\/\/outsoftware\.it\/wp-content\/uploads\/[^"]+\.zip)"/i);
  const info = block.match(/href="(https:\/\/outsoftware\.it\/games\/[^"]+)"[^>]*>\s*Info/i);
  if (!h3 || !zip) continue;

  const infoUrl = info ? info[1] : BASE + '/games/#sam-coupe';
  const infoSlug = infoUrl.split('/').filter(Boolean).pop();
  if (DENIED.includes(infoSlug)) continue;
  if (/DENIED/i.test(block)) continue;

  const title = decode(h3[1]);
  if (!title) continue;

  let slug = slugify(zip[1]);
  if (!slug) continue;
  if (usedSlugs.has(slug)) {
    let n = 2;
    while (usedSlugs.has(slug + '-' + n)) n++;
    slug += '-' + n;
  }
  usedSlugs.add(slug);

  const img = block.match(/<img[^>]*\bsrc="([^"]+)"/i);
  const fmtMatch = block.match(/<p[^>]*>([\s\S]*?)<a[^>]*>\s*ZIP/i);
  const format = fmtMatch ? decode(fmtMatch[1]).replace(/[·|]$/, '').trim() : '';

  items.push({
    t: title,
    y: null,
    c: 'games',
    u: infoUrl,
    s: img ? img[1] : '',
    m: format,
    d: [{ n: slug + '.zip', u: 'media/outsoftware/' + slug + '.zip', t: 'zip' }]
  });

  prefetch.push({
    path: 'wasm/deploy/media/outsoftware/' + slug + '.zip',
    url: zip[1],
    note: `Outsoftware official SAM Coupé download for ${title}`,
    optional: true
  });
}

items.sort((a, b) => a.t.localeCompare(b.t, 'en', { sensitivity: 'base', numeric: true }));

const data = {
  generated: new Date().toISOString(),
  source: 'Outsoftware',
  categories: [{ key: 'games', label: 'Games', count: items.length }],
  items
};

writeFileSync(DATA, 'window.OUTSOFTWARE_LIBRARY = ' + JSON.stringify(data, null, 2) + ';\n');
writeFileSync(MANIFEST, JSON.stringify(prefetch, null, 2) + '\n');

console.log(`Outsoftware: ${items.length} titles (Games ${items.length})`);
console.log(`Prefetch manifest: ${prefetch.length} ZIPs`);
