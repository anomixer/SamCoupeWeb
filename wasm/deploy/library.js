/**
 * SamCoupeWeb Software Library (v1.2.17 WOS Edition)
 * ---------------------------------------------------------------------------
 * Browses the World of SAM catalogue (bundled as window.SAM_LIBRARY by
 * tools/build-library.mjs) inside the emulator workspace and launches the
 * selected title straight from worldofsam.org (CORS proxy: Corsfix).
 *
 * Views:
 *   categories -> Games / Demos / Utilities cards
 *   list       -> screenshot cards, A-Z / Z-A / Old-New sorting, paged like
 *                 the World of SAM site (bottom page tabs + prev/next).
 *
 * Launching:
 *   .mgt / .dsk / .sad  -> floppy, Disk 1 (a second image in a 2-disk set is
 *                          placed in Disk 2), then auto-boot.
 *   .tap / .tzx         -> tape, auto-boot.
 *   .hdf                -> AtomLite interface (Pri. Master = D2), then reset.
 *   .zip / .7z / .gz    -> extracted with 7z-wasm, then routed by extension.
 */
(function () {
    'use strict';

    var CORS_PROXY = 'https://proxy.corsfix.com/?';
    var CORS_PROXY_FALLBACK = 'https://api.cors.lol/?url=';
    var PRODUCT_BASE = 'https://www.worldofsam.org';
    var PENDING_KEY = 'samcoupeweb_pending_launch';
    var SORT_KEY = 'samcoupeweb_library_sort';

    var ARROW = '\u2192';
    var ELLIPSIS = '\u2026';

    var SORTS = [
        { id: 'az', label: 'A ' + ARROW + ' Z' },
        { id: 'za', label: 'Z ' + ARROW + ' A' },
        { id: 'old', label: 'Old ' + ARROW + ' New' },
        { id: 'new', label: 'New ' + ARROW + ' Old' }
    ];

    var state = {
        view: 'closed',   // closed | categories | list
        category: null,
        items: [],        // sorted items of the current category
        page: 0,
        pages: 1,
        sort: 'az',
        query: '',        // normalised title filter (lowercase, no accents)
        queryRaw: '',     // exactly what the user typed, for the count / empty state
        cols: 4,
        rows: 2,
        pageSize: 8,
        engineReady: false,
        busy: false
    };

    var pausedBeforeLibrary = null;
    var els = {};
    var layoutTimer = null;
    var closeTimer = null;

    /* ------------------------------------------------------------------ */
    /* Helpers                                                             */
    /* ------------------------------------------------------------------ */

    function byId(id) { return document.getElementById(id); }
    function hasData() { return !!(window.SAM_LIBRARY && Array.isArray(window.SAM_LIBRARY.items)); }
    function engineReady() { return (typeof isEngineReady !== 'undefined') && isEngineReady === true; }

    function setStatus(text) {
        if (els.count) els.count.textContent = text || '';
    }

    function setGlobalStatus(text) {
        try { if (typeof statusLeft !== 'undefined' && statusLeft) statusLeft.innerText = text; } catch (e) { }
    }

    // Accent-insensitive so "coupe" finds "Coupé" and "o" finds "ö".
    function normalizeText(value) {
        var text = (value == null ? '' : String(value)).toLowerCase();
        if (text.normalize) text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return text;
    }

    function matchesQuery(item, query) {
        var haystack = normalizeText(item.t) + ' ' + (item.y || '');
        var tokens = query.split(/\s+/);
        for (var i = 0; i < tokens.length; i++) {
            if (tokens[i] && haystack.indexOf(tokens[i]) < 0) return false;
        }
        return true;
    }

    function setSearchVisible(visible) {
        if (els.searchWrap) els.searchWrap.classList.toggle('is-hidden', !visible);
    }

    function setQuery(value) {
        state.queryRaw = value == null ? '' : String(value);
        state.query = normalizeText(state.queryRaw).trim();
        state.page = 0;
        if (els.search && els.search.value !== state.queryRaw) els.search.value = state.queryRaw;
        if (els.searchWrap) els.searchWrap.classList.toggle('has-text', !!state.queryRaw);
    }

    function focusSearch() {
        if (!els.search) return;
        try { els.search.focus(); els.search.select(); } catch (e) { }
    }

    // Bright banner at the top of the panel: the bottom status bar is too easy
    // to miss while the library is covering the screen.
    function showToast(text, isError) {
        if (!els.toast) return;
        els.toast.textContent = text || '';
        els.toast.classList.toggle('is-error', !!isError);
        els.toast.classList.add('active');
        // The banner lives inside the panel, so after the interface switch (the
        // panel is gone) repeat the message in the status bar where it can be seen.
        if (els.panel && !els.panel.classList.contains('active')) setGlobalStatus(text);
    }

    function hideToast() {
        if (!els.toast) return;
        els.toast.classList.remove('active');
        els.toast.textContent = '';
    }

    function setEnginePause(on) {
        if (!engineReady() || typeof Module === 'undefined' || !Module.ccall) return;
        try { Module.ccall('EMS_SetOption', null, ['string', 'number'], ['pause', on ? 1 : 0]); } catch (e) { }
    }

    function getEngineOption(name) {
        if (!engineReady() || typeof Module === 'undefined' || !Module.ccall) return null;
        try { return Module.ccall('EMS_GetOption', 'number', ['string'], [name]); } catch (e) { return null; }
    }

    function categoryOf(key) {
        return (window.SAM_LIBRARY.categories || []).find(function (c) { return c.key === key; }) || { key: key, label: key };
    }

    function formatLabel(item) {
        return item.t + (item.y ? ' (' + item.y + ')' : '');
    }

    function mediaFiles(item) {
        return (item && Array.isArray(item.d) ? item.d : []).filter(function (f) { return f && f.u; });
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /* ------------------------------------------------------------------ */
    /* Sorting                                                             */
    /* ------------------------------------------------------------------ */

    function sortedItems(items, mode) {
        var collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
        var arr = items.slice();
        var byTitle = function (a, b) { return collator.compare(a.t, b.t); };
        var yearOf = function (it) { return typeof it.y === 'number' ? it.y : null; };
        var byYearAsc = function (a, b) {
            var ya = yearOf(a), yb = yearOf(b);
            if (ya === null && yb === null) return byTitle(a, b);
            if (ya === null) return 1;          // unknown years last
            if (yb === null) return -1;
            return ya === yb ? byTitle(a, b) : ya - yb;
        };
        var byYearDesc = function (a, b) {
            var ya = yearOf(a), yb = yearOf(b);
            if (ya === null && yb === null) return byTitle(a, b);
            if (ya === null) return 1;          // unknown years still last
            if (yb === null) return -1;
            return ya === yb ? byTitle(a, b) : yb - ya;
        };

        if (mode === 'za') arr.sort(function (a, b) { return byTitle(b, a); });
        else if (mode === 'old') arr.sort(byYearAsc);
        else if (mode === 'new') arr.sort(byYearDesc);
        else arr.sort(byTitle);
        return arr;
    }

    /* ------------------------------------------------------------------ */
    /* Layout: how many cards fit the stage                               */
    /* ------------------------------------------------------------------ */

    function measureGrid() {
        var stage = els.stage;
        if (!stage) return;
        var W = stage.clientWidth;
        var H = stage.clientHeight;
        var gap = 12;
        var minCardW = 168;
        var metaH = 46;

        var cols = Math.max(1, Math.floor((W + gap) / (minCardW + gap)));
        var cardW = (W - gap * (cols - 1)) / cols;
        var rowH = cardW * 0.75 + metaH;             // screenshot area ~4:3
        var rows = Math.max(1, Math.floor((H + gap) / (rowH + gap)));

        // Keep the page size sane on very large displays.
        while (cols * rows > 48 && rows > 1) rows--;
        while (cols * rows > 48 && cols > 1) cols--;

        state.cols = cols;
        state.rows = rows;
        state.pageSize = cols * rows;
    }

    /* ------------------------------------------------------------------ */
    /* Rendering                                                           */
    /* ------------------------------------------------------------------ */

    // Category covers are hand-picked where possible: the Games card should
    // look like a game and the Demos card like a demo, otherwise the two read
    // as each other's screenshots. Unknown titles fall back to the heuristic.
    var COVER_HINTS = {
        games: ['Astroball', 'Beetle Mania', 'Bubble Bobble', 'Blokker', 'Batz n Balls'],
        demos: ['Colorweeds', 'Fire Demo', 'Big Scroller Demo', 'ILLUSION PD', 'MGT Demo'],
        utilities: ['Axword', 'Master Copy']
    };

    function pickCover(shots, key) {
        var hints = COVER_HINTS[key] || [];
        for (var h = 0; h < hints.length; h++) {
            var wanted = hints[h].toLowerCase();
            for (var i = 0; i < shots.length; i++) {
                if ((shots[i].t || '').toLowerCase() === wanted) return shots[i];
            }
        }
        var curated = shots.find(function (i) { return /(simc\d+|snap\d+)/i.test(i.s); });
        return curated || shots[0];
    }

    function renderCategories() {
        var lib = window.SAM_LIBRARY;
        els.categories.innerHTML = '';

        (lib.categories || []).forEach(function (cat) {
            var card = document.createElement('button');
            card.type = 'button';
            card.className = 'lib-cat-card lib-cat-' + cat.key;
            card.setAttribute('data-cat', cat.key);

            var shots = (lib.items || []).filter(function (i) { return i.c === cat.key && i.s; });
            var cover = pickCover(shots, cat.key);
            if (cover) {
                var art = document.createElement('span');
                art.className = 'lib-cat-art';
                art.style.backgroundImage = 'url("' + cover.s + '")';
                card.appendChild(art);
            }

            var body = document.createElement('span');
            body.className = 'lib-cat-body';

            var name = document.createElement('span');
            name.className = 'lib-cat-name';
            name.textContent = cat.label;

            var count = document.createElement('span');
            count.className = 'lib-cat-count';
            count.textContent = cat.count + ' titles';

            var note = document.createElement('span');
            note.className = 'lib-cat-note';
            note.textContent = 'World of SAM collection';

            body.appendChild(name);
            body.appendChild(count);
            body.appendChild(note);
            card.appendChild(body);

            card.addEventListener('click', function () { openCategory(cat.key); });
            els.categories.appendChild(card);
        });

        els.categories.classList.remove('hidden-view');
        els.grid.classList.add('hidden-view');
        els.footer.style.display = 'none';
        els.sorts.classList.add('hidden-view');
        els.back.classList.add('is-hidden');
        els.crumbTitle.textContent = 'World of SAM Library';
        setQuery('');
        setSearchVisible(false);
        setStatus('');
    }

    function renderList() {
        var cat = categoryOf(state.category);
        els.crumbTitle.textContent = cat.label;
        els.back.classList.remove('is-hidden');
        els.sorts.classList.remove('hidden-view');
        setSearchVisible(true);
        els.categories.classList.add('hidden-view');
        els.grid.classList.remove('hidden-view');
        els.footer.style.display = 'flex';

        var source = (window.SAM_LIBRARY.items || []).filter(function (i) { return i.c === state.category; });
        var total = source.length;
        if (state.query) {
            source = source.filter(function (i) { return matchesQuery(i, state.query); });
        }
        state.items = sortedItems(source, state.sort);
        state.pages = Math.max(1, Math.ceil(state.items.length / state.pageSize));
        if (state.page > state.pages - 1) state.page = state.pages - 1;
        if (state.page < 0) state.page = 0;

        var start = state.page * state.pageSize;
        var slice = state.items.slice(start, start + state.pageSize);

        els.grid.style.setProperty('--cols', state.cols);
        els.grid.style.setProperty('--rows', state.rows);
        els.grid.innerHTML = '';

        slice.forEach(function (item, offset) {
            els.grid.appendChild(createCard(item, start + offset));
        });

        if (!slice.length) {
            var empty = document.createElement('div');
            empty.className = 'lib-empty';
            var emptyText = document.createElement('div');
            emptyText.textContent = state.queryRaw
                ? 'No titles match \u201c' + state.queryRaw.trim() + '\u201d'
                : 'No titles in this category';
            empty.appendChild(emptyText);
            if (state.query) {
                var clear = document.createElement('button');
                clear.type = 'button';
                clear.className = 'lib-empty-clear';
                clear.textContent = 'Show all ' + total + ' titles';
                clear.addEventListener('click', function () { setQuery(''); renderList(); focusSearch(); });
                empty.appendChild(clear);
            }
            els.grid.appendChild(empty);
        }

        renderPager();
        updateSortButtons();
        setStatus(state.query
            ? state.items.length + ' / ' + total + ' titles'
            : total + ' titles');
    }

    function productUrl(item) {
        if (!item || !item.u) return '';
        return /^https?:/i.test(item.u) ? item.u : PRODUCT_BASE + item.u;
    }

    function createCard(item, index) {
        var files = mediaFiles(item);
        var link = files.length ? '' : productUrl(item);
        var restricted = !!item.k;
        var card;
        if (link) {
            // No hosted image: the card is a plain link to the product page so
            // the click (and middle-click) behaves like any other web link.
            card = document.createElement('a');
            card.href = link;
            card.target = '_blank';
            card.rel = 'noopener noreferrer';
            card.className = 'lib-card is-unavailable lib-card-link';
            card.title = formatLabel(item) + (restricted
                ? ' - not distributed (copyrights declined); opens the World of SAM product page'
                : ' - no downloadable media; opens the World of SAM product page');
        } else {
            card = document.createElement('button');
            card.type = 'button';
            card.className = 'lib-card' + (files.length ? '' : ' is-unavailable');
            card.title = formatLabel(item) + (files.length ? '' : ' - no downloadable media');
        }
        card.setAttribute('data-index', String(index));

        var shot = document.createElement('span');
        shot.className = 'lib-card-shot';
        if (item.s) {
            var img = document.createElement('img');
            img.decoding = 'async';
            img.alt = '';
            img.src = item.s;
            img.addEventListener('error', function () {
                img.remove();
                shot.classList.add('no-art');
            });
            shot.appendChild(img);
        } else {
            shot.classList.add('no-art');
        }

        var meta = document.createElement('span');
        meta.className = 'lib-card-meta';

        var title = document.createElement('span');
        title.className = 'lib-card-title';
        title.textContent = item.t;

        var year = document.createElement('span');
        year.className = 'lib-card-year';
        year.textContent = item.y ? '(' + item.y + ')' : '';

        meta.appendChild(title);
        meta.appendChild(year);

        if (!files.length) {
            var badge = document.createElement('span');
            badge.className = 'lib-card-badge';
            badge.textContent = (restricted ? 'Restricted ' : 'No download ') + '\u2197';
            meta.appendChild(badge);
        }

        card.appendChild(shot);
        card.appendChild(meta);
        return card;
    }

    function renderPager() {
        els.prev.disabled = state.page <= 0;
        els.next.disabled = state.page >= state.pages - 1;

        els.pages.innerHTML = '';

        var label = document.createElement('span');
        label.className = 'lib-page-label';
        label.textContent = 'Page ' + (state.page + 1) + ' / ' + state.pages;
        els.pages.appendChild(label);

        var tabs = document.createElement('span');
        tabs.className = 'lib-page-tabs';

        windowedPages(state.page, state.pages, 6).forEach(function (entry) {
            if (entry === ELLIPSIS) {
                var gap = document.createElement('span');
                gap.className = 'lib-page-gap';
                gap.textContent = ELLIPSIS;
                tabs.appendChild(gap);
                return;
            }
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lib-page-tab' + (entry === state.page ? ' is-current' : '');
            btn.textContent = String(entry + 1);
            btn.setAttribute('data-page', String(entry));
            btn.setAttribute('aria-label', 'Go to page ' + (entry + 1));
            btn.addEventListener('click', function () {
                state.page = entry;
                renderList();
            });
            tabs.appendChild(btn);
        });

        els.pages.appendChild(tabs);
    }

    /** [0, ellipsis, 3,4,5, ellipsis, 27] style window around the current page. */
    function windowedPages(current, total, radius) {
        if (total <= radius + 3) {
            return Array.from({ length: total }, function (_, i) { return i; });
        }
        var pages = [0];
        var start = Math.max(1, current - radius);
        var end = Math.min(total - 2, current + radius);
        if (start > 1) pages.push(ELLIPSIS);
        for (var i = start; i <= end; i++) pages.push(i);
        if (end < total - 2) pages.push(ELLIPSIS);
        pages.push(total - 1);
        return pages;
    }

    function updateSortButtons() {
        Array.prototype.forEach.call(els.sorts.querySelectorAll('.lib-sort-btn'), function (btn) {
            btn.classList.toggle('is-active', btn.getAttribute('data-sort') === state.sort);
        });
    }

    /* ------------------------------------------------------------------ */
    /* Views                                                               */
    /* ------------------------------------------------------------------ */

    function openCategory(key) {
        state.view = 'list';
        state.category = key;
        state.page = 0;
        setQuery('');
        measureGrid();
        renderList();
    }

    function showCategories() {
        state.view = 'categories';
        state.category = null;
        state.page = 0;
        measureGrid();
        renderCategories();
    }

    function relayout() {
        if (state.view !== 'list') { measureGrid(); return; }
        var firstIndex = state.page * state.pageSize;
        measureGrid();
        state.page = Math.max(0, Math.floor(firstIndex / state.pageSize));
        renderList();
    }

    function openPanel() {
        if (!hasData()) {
            var msg = 'Library data is missing. Regenerate it with: node tools/build-library.mjs';
            if (typeof customAlert === 'function') customAlert(msg, 'Library Data Missing');
            else alert(msg);
            return;
        }

        els.panel.classList.add('active');
        els.panel.setAttribute('aria-hidden', 'false');
        hideToast();

        // A launch that is still finishing must not yank the panel shut again.
        if (closeTimer) { window.clearTimeout(closeTimer); closeTimer = null; }

        // The startup About window must not sit on top of the library.
        try {
            var about = byId('aboutModal');
            if (about && about.style.display === 'block' && typeof closeAbout === 'function') closeAbout();
        } catch (e) { /* ignore */ }

        pausedBeforeLibrary = engineReady() ? getEngineOption('pause') : null;
        if (engineReady() && !pausedBeforeLibrary) setEnginePause(true);

        showCategories();
    }

    function closePanel() {
        els.panel.classList.remove('active');
        els.panel.setAttribute('aria-hidden', 'true');
        hideToast();
        hideChooser();
        state.view = 'closed';

        if (pausedBeforeLibrary === 0) setEnginePause(false);
        pausedBeforeLibrary = null;

        try { document.getElementById('canvas').focus(); } catch (e) { }
    }

    function togglePanel() {
        if (els.panel && els.panel.classList.contains('active')) closePanel();
        else openPanel();
    }

    /* ------------------------------------------------------------------ */
    /* File chooser (multi-disk / multi-version entries)                   */
    /* ------------------------------------------------------------------ */

    function chooseFile(item, files) {
        return new Promise(function (resolve) {
            if (closeTimer) { window.clearTimeout(closeTimer); closeTimer = null; }
            els.dialogTitle.textContent = formatLabel(item);
            els.dialogBody.innerHTML = '';

            var hint = document.createElement('div');
            hint.className = 'lib-dialog-hint';
            hint.textContent = files.length + ' downloadable images - pick the one to load:';
            els.dialogBody.appendChild(hint);

            files.forEach(function (file) {
                var row = document.createElement('button');
                row.type = 'button';
                row.className = 'lib-dialog-file';

                var name = document.createElement('span');
                name.className = 'lib-dialog-name';
                name.textContent = file.n;

                var ext = document.createElement('span');
                ext.className = 'lib-dialog-ext';
                ext.textContent = (file.t || '').toUpperCase();

                row.appendChild(name);
                row.appendChild(ext);
                row.addEventListener('click', function () {
                    hideChooser();
                    resolve(file);
                });
                els.dialogBody.appendChild(row);
            });

            els.dialogCancel.onclick = function () {
                hideChooser();
                resolve(null);
            };
            els.dialog.classList.add('active');
        });
    }

    function hideChooser() {
        if (els.dialog) els.dialog.classList.remove('active');
    }

    /* ------------------------------------------------------------------ */
    /* Remote media loading                                                */
    /* ------------------------------------------------------------------ */

    function writeVfs(name, data) {
        try { FS.mkdir('/tmp'); } catch (e) { /* already exists */ }
        FS.writeFile('/tmp/' + name, data);
        return '/tmp/' + name;
    }

    /* ------------------------------------------------------------------ */
    /* Hard-disk hand-off across the interface switch                      */
    /* ------------------------------------------------------------------ */

    // A .hdf only attaches once the AtomLite ROM is running, which costs a page
    // reload. Park the unpacked image in IndexedDB so the reload - and any
    // archive it came from - does not have to be downloaded a second time.
    var HDF_DB = 'samcoupeweb_hdf_cache';
    var HDF_STORE = 'images';

    function idbOpen() {
        return new Promise(function (resolve, reject) {
            if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
            var req = window.indexedDB.open(HDF_DB, 1);
            req.onupgradeneeded = function () {
                var db = req.result;
                if (!db.objectStoreNames.contains(HDF_STORE)) db.createObjectStore(HDF_STORE);
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error || new Error('IndexedDB open failed')); };
        });
    }

    function idbPut(key, value) {
        return idbOpen().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(HDF_STORE, 'readwrite');
                tx.objectStore(HDF_STORE).put(value, key);
                tx.oncomplete = function () { resolve(); };
                tx.onerror = function () { reject(tx.error); };
            });
        });
    }

    function idbTake(key) {
        return idbOpen().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(HDF_STORE, 'readwrite');
                var store = tx.objectStore(HDF_STORE);
                var value = null;
                var req = store.get(key);
                req.onsuccess = function () { value = req.result || null; store.delete(key); };
                tx.oncomplete = function () { resolve(value); };
                tx.onerror = function () { reject(tx.error); };
            });
        });
    }

    async function fetchBytes(url, onProgress) {
        // Same-origin files load directly; everything else is mirrored through a
        // CORS proxy. Corsfix is tried first (it caches and streams large HDFs);
        // the second proxy rescues publishers that Corsfix cannot pull at all
        // (outsoftware.it answers the proxy with HTTP 500).
        var absolute = url;
        try { absolute = new URL(url, window.location.href).toString(); } catch (e) { /* keep raw */ }
        var targets = absolute.indexOf(window.location.origin + '/') === 0
            ? [{ url: absolute, headers: {} }]
            : [
                { url: CORS_PROXY + absolute, headers: { 'x-corsfix-cache': '1h' } },
                { url: CORS_PROXY_FALLBACK + encodeURIComponent(absolute), headers: {} },
            ];

        var lastErr = null;

        for (var t = 0; t < targets.length; t++) {
            var target = targets[t];
            var controller = (typeof AbortController === 'function') ? new AbortController() : null;
            var stallTimer = null;

            // Only abort once the transfer genuinely stalls: a 256 MB image can take
            // minutes through the CORS proxy and must not be cut off mid-way.
            var armStall = function () {
                if (!controller) return;
                if (stallTimer) window.clearTimeout(stallTimer);
                stallTimer = window.setTimeout(function () { controller.abort(); }, 45000);
            };

            armStall();
            try {
                var response = await fetch(target.url, controller
                    ? { headers: target.headers, signal: controller.signal }
                    : { headers: target.headers });
                if (!response.ok) {
                    try { await response.body?.cancel(); } catch (ignore) { /* ignore */ }
                    throw new Error('HTTP ' + response.status);
                }

                var total = parseInt(response.headers.get('content-length') || '0', 10) || 0;

                if (!response.body || typeof response.body.getReader !== 'function') {
                    var whole = new Uint8Array(await response.arrayBuffer());
                    if (onProgress) onProgress(whole.length, total || whole.length);
                    return whole;
                }

                var reader = response.body.getReader();
                var chunks = [];
                var received = 0;

                for (;;) {
                    var step = await reader.read();
                    if (step.done) break;
                    armStall();
                    chunks.push(step.value);
                    received += step.value.length;
                    if (onProgress) onProgress(received, total);
                }

                var out = new Uint8Array(total && total >= received ? total : received);
                var offset = 0;
                for (var i = 0; i < chunks.length; i++) {
                    out.set(chunks[i], offset);
                    offset += chunks[i].length;
                }
                return offset === out.length ? out : out.slice(0, offset);
            } catch (e) {
                lastErr = e && e.name === 'AbortError'
                    ? new Error('download stalled (no data for 45 s)')
                    : e;
                if (t === targets.length - 1) throw lastErr;
            } finally {
                if (stallTimer) window.clearTimeout(stallTimer);
            }
        }
        throw lastErr || new Error('download failed');
    }

    async function extractArchive(name, data) {
        var ext = (name.match(/\.(7z|zip|gz)$/i) || [, 'zip'])[1].toLowerCase();
        var mod = await import('https://cdn.jsdelivr.net/npm/7z-wasm@1.2.0/+esm');
        var SevenZipWasm = mod.default || mod;
        var sevenZip = await SevenZipWasm();

        var archiveName = 'input.' + ext;
        sevenZip.FS.writeFile(archiveName, data);
        sevenZip.callMain(['e', archiveName, '-y']);

        var entries = sevenZip.FS.readdir('/');
        var found = entries.find(function (entry) {
            return entry !== '.' && entry !== '..' && entry !== archiveName &&
                !sevenZip.FS.isDir(sevenZip.FS.stat(entry).mode);
        });
        if (!found) throw new Error('Archive contains no files');

        return { name: found, data: sevenZip.FS.readFile(found) };
    }

    function updateMediaLabel(drive, name) {
        try {
            var savedInterface = parseInt(localStorage.getItem('samcoupeweb_interface') || '0');
            mediaNames[drive] = name;
            if (drive === 0) statElements[0].innerText = 'D1: ' + truncatePath(name);
            else if (drive === 1) statElements[1].innerText = (savedInterface === 0 ? 'D2: ' : 'Pri: ') + truncatePath(name);
            else if (drive === 3) statElements[3].innerText = 'Sec: ' + truncatePath(name);
            else if (drive === 2) statElements[2].innerText = 'Tape: ' + truncatePath(name);
            if (typeof updateMenuChecks === 'function') updateMenuChecks();
        } catch (e) { /* labels are cosmetic */ }
    }

    function insertMedia(name, data, opts) {
        var ext = (name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
        var isTape = ext === 'tap' || ext === 'tzx';
        var isHdf = ext === 'hdf';
        var drive = isTape ? 2 : (isHdf ? 1 : 0);

        var path = writeVfs(name, data);
        var res;

        if (isTape) {
            res = Module.ccall('EMS_InsertTape', 'number', ['string'], [path]);
        } else {
            res = Module.ccall('EMS_InsertDisk', 'number', ['number', 'string'], [drive, path]);
        }

        if (!res) {
            setStatus('The emulator rejected ' + name);
            setGlobalStatus('Media rejected: ' + name);
            return false;
        }

        updateMediaLabel(drive, name);

        // Cold boot from the freshly inserted media: HDF resets the machine,
        // floppy/tape boots through the AutoLoad path.
        window.setTimeout(function () {
            try {
                if (isHdf) Module.ccall('EMS_Reset', null, [], []);
                else Module.ccall('EMS_Boot', null, ['number'], [isTape ? 2 : 1]);
            } catch (e) { }
        }, opts && opts.bootDelay != null ? opts.bootDelay : 450);

        return true;
    }

    // Switching the hardware interface needs a reload, so park the bytes the
    // machine must mount afterwards in IndexedDB: the reload must not force a
    // second download (a 256 MB Time Gal image is bad enough once).
    var PENDING_DEFAULT_LIFETIME = 5 * 60 * 1000;

    function switchInterface(item, file, opts) {
        opts = opts || {};
        var iface = opts.iface != null ? opts.iface : 2;
        var pending = {
            at: Date.now(),
            title: item && item.t,
            file: file,
            src: opts.src || null,
            iface: iface,
            stash: !!opts.stash,
            key: opts.key || (file && file.n) || null,
            extra: opts.extra || null
        };
        sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
        localStorage.setItem('samcoupeweb_interface', String(iface));
        try { if (typeof clearUrlParams === 'function') clearUrlParams(); } catch (e) { }
        var label = iface === 0 ? 'Floppy' : 'AtomLite';
        setGlobalStatus('Switching to the ' + label + ' interface for ' + (item && item.t) + '...');
        showToast('Switching to ' + label + ' for ' + formatLabel(item) + '\u2026');
        window.location.reload();
    }

    // A library launch always matches the interface to the media: .hdf needs
    // AtomLite, while a floppy or tape title belongs in Floppy mode. Leaving
    // AtomLite selected meant the next floppy title still booted the HDF that
    // was attached as Primary Master (Time Gal), which is never what was asked.
    function floppyCompanion(item, chosen) {
        var files = mediaFiles(item);
        if (files.length !== 2) return null;
        var other = files.find(function (f) { return f.u !== chosen.u; });
        if (!other || /^(zip|7z|gz|hdf|tap|tzx)$/.test((other.t || '').toLowerCase())) return null;
        return other;
    }

    function dirtyHardDiskDrive() {
        var itf = parseInt(localStorage.getItem('samcoupeweb_interface') || '0');
        if (itf <= 0) return 0;
        var drives = [1, 3];
        for (var i = 0; i < drives.length; i++) {
            var drive = drives[i];
            if (!mediaNames[drive]) continue;
            try {
                if (Module.ccall('EMS_IsDiskModified', 'number', ['number'], [drive])) return drive;
            } catch (e) { /* dirty tracking is best-effort */ }
        }
        return 0;
    }

    function switchToFloppyFor(item, file, data, srcFile) {
        var extra = floppyCompanion(item, file);
        var pending = { n: file.n, u: file.u, t: (file.t || 'dsk') };
        var finish = function () {
            switchInterface(item, pending, {
                iface: 0, stash: true, key: file.n, extra: extra, src: srcFile || null
            });
        };
        var store = function () {
            idbPut(file.n, data).then(finish, finish);
        };

        var dirty = dirtyHardDiskDrive();
        if (!dirty || typeof showModal !== 'function') { store(); return; }

        var driveLabel = dirty === 1 ? 'Primary Master' : 'Secondary Master';
        showModal('Save the hard disk?',
            'The ' + driveLabel + ' image (' + escapeHtml(mediaNames[dirty]) + ') has unsaved changes.' +
            '<br><br>Switching back to Floppy for <strong>' + escapeHtml(item.t) +
            '</strong> will eject it. Save a copy to your computer first?',
            [
                {
                    text: 'Save & Switch', primary: true, callback: function () {
                        try { if (typeof saveMedia === 'function') saveMedia(dirty); } catch (e) { }
                        window.setTimeout(store, 700); // let the download start
                    }
                },
                { text: 'Discard & Switch', callback: store },
                { text: 'Cancel', callback: function () { } }
            ]);
    }

    async function launchFile(item, file) {
        if (!engineReady() || typeof Module === 'undefined') {
            if (typeof customAlert === 'function') {
                customAlert('The emulator is still starting up. Please wait a moment and try again.', 'Please Wait');
            } else {
                setGlobalStatus('Emulator still starting - please try again in a moment.');
            }
            return;
        }

        var ext = (file.t || '').toLowerCase();
        var isArchive = /^(zip|7z|gz)$/.test(ext);
        var currentItf = parseInt(localStorage.getItem('samcoupeweb_interface') || '0');

        if (ext === 'hdf' && currentItf !== 2) {
            switchInterface(item, file, { iface: 2 });
            return;
        }

        if (state.busy) return;
        state.busy = true;
        showToast('Downloading ' + file.n + ' from worldofsam.org\u2026');

        try {
            var lastPct = -1;
            var lastChunk = 0;
            var data = await fetchBytes(file.u, function (got, total) {
                var mb = (got / 1048576).toFixed(1);
                if (total > 0) {
                    var pct = Math.min(100, Math.floor(got * 100 / total));
                    if (pct === lastPct) return;
                    lastPct = pct;
                    showToast('Downloading ' + file.n + ' - ' + pct + '% (' +
                        mb + ' / ' + (total / 1048576).toFixed(1) + ' MB)');
                } else {
                    if (got - lastChunk < 262144) return;
                    lastChunk = got;
                    showToast('Downloading ' + file.n + ' - ' + mb + ' MB');
                }
            });
            var name = file.n;
            var innerExt = ext;

            if (isArchive) {
                showToast('Extracting ' + name + '\u2026');
                var extracted = await extractArchive(name, data);
                name = extracted.name;
                data = extracted.data;
                innerExt = (name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
                if (innerExt === 'hdf' && currentItf !== 2) {
                    // Needs the AtomLite ROM: stash the unpacked image, then
                    // reload once and let the pending launch attach it.
                    try { await idbPut(name, data); } catch (e) { }
                    switchInterface(item, { n: name, u: file.u, t: 'hdf' },
                        { iface: 2, stash: true, key: name, src: file });
                    return;
                }
            }

            // A floppy/tape title must not inherit the Atom machine that a
            // previous hard-disk title left behind.
            var floppyLike = /^(dsk|mgt|sad|tap|tzx)$/.test(innerExt);
            if (currentItf > 0 && floppyLike) {
                switchToFloppyFor(item, { n: name, u: file.u, t: innerExt }, data, isArchive ? file : null);
                return;
            }

            // Make sure a paused machine wakes up for the boot.
            pausedBeforeLibrary = null;
            setEnginePause(false);

            var mounted = insertMedia(name, data, {});

            if (mounted) {
                showToast('Booting ' + formatLabel(item) + ' from worldofsam.org\u2026');
                try { if (typeof hasBooted !== 'undefined') hasBooted = true; } catch (e) { }

                // Multi-disk sets: park the second floppy image in Disk 2 / Sec. Master.
                var other = floppyCompanion(item, file);
                if (other) {
                    window.setTimeout(function () { loadSecondaryDisk(other); }, 900);
                }

                closeTimer = window.setTimeout(function () {
                    closeTimer = null;
                    if (!els.dialog.classList.contains('active')) closePanel();
                }, 1200);
            }
        } catch (e) {
            console.error('Library load failed:', e);
            showToast('Download failed: ' + e.message, true);
            if (typeof customAlert === 'function') {
                customAlert('Failed to download this title from worldofsam.org (CORS proxy).<br>Please try again in a moment.', 'Download Failed');
            }
        } finally {
            state.busy = false;
        }
    }

    async function loadSecondaryDisk(file) {
        try {
            var data = await fetchBytes(file.u);
            var savedInterface = parseInt(localStorage.getItem('samcoupeweb_interface') || '0');
            var drive = savedInterface === 0 ? 1 : 3; // D2 in floppy mode, Sec. Master in Atom mode
            var path = writeVfs(file.n, data);
            var res = Module.ccall('EMS_InsertDisk', 'number', ['number', 'string'], [drive, path]);
            if (res) {
                updateMediaLabel(drive, file.n);
                setGlobalStatus('Second disk inserted: ' + file.n);
            }
        } catch (e) {
            console.warn('Secondary disk insert failed:', e);
        }
    }

    function playItem(item) {
        if (!item) return;
        var files = mediaFiles(item);
        if (!files.length) {
            var url = productUrl(item);
            if (url) {
                window.open(url, '_blank', 'noopener');
            } else if (typeof customAlert === 'function') {
                customAlert('<strong>' + escapeHtml(formatLabel(item)) + '</strong><br><br>' +
                    'World of SAM does not host a downloadable image for this title ' +
                    '(copyright restricted or not archived).', 'No Download Available');
            }
            return;
        }
        if (files.length === 1) {
            launchFile(item, files[0]);
            return;
        }
        chooseFile(item, files).then(function (chosen) {
            if (chosen) launchFile(item, chosen);
        });
    }

    /* ------------------------------------------------------------------ */
    /* Pending launch (after an interface switch reload)                   */
    /* ------------------------------------------------------------------ */

    function consumePendingLaunch() {
        var raw = sessionStorage.getItem(PENDING_KEY);
        if (!raw) return;
        sessionStorage.removeItem(PENDING_KEY);

        var pending;
        try { pending = JSON.parse(raw); } catch (e) { return; }
        if (!pending || !pending.file || !pending.file.u) return;
        if (Date.now() - (pending.at || 0) > PENDING_DEFAULT_LIFETIME) return; // stale

        var item = { t: pending.title || pending.file.n, y: null, d: [pending.file] };
        var fallback = function () { launchFile(item, pending.src || pending.file); };

        window.setTimeout(function () {
            var f = pending.file;
            if (!pending.stash) { fallback(); return; }

            var isHdf = (f.t === 'hdf');
            showToast((isHdf ? 'Attaching ' + f.n + ' to the AtomLite hard disk'
                : 'Mounting ' + f.n) + ELLIPSIS);

            idbTake(pending.key || f.n).then(function (bytes) {
                if (!bytes) {
                    // Stash gone (private window, storage eviction): re-download
                    // the image, or the archive it came from and unpack again.
                    fallback();
                    return;
                }
                var data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
                if (insertMedia(f.n, data, {})) {
                    showToast('Booting ' + (pending.title || f.n) + ' from worldofsam.org' + ELLIPSIS);
                    try { if (typeof hasBooted !== 'undefined') hasBooted = true; } catch (e) { }
                    if (pending.extra) {
                        window.setTimeout(function () { loadSecondaryDisk(pending.extra); }, 900);
                    }
                } else {
                    showToast('The emulator rejected ' + f.n, true);
                }
            }).catch(function () { fallback(); });
        }, 900);
    }

    /* ------------------------------------------------------------------ */
    /* Wiring                                                             */
    /* ------------------------------------------------------------------ */

    function buildSortButtons() {
        SORTS.forEach(function (sort) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lib-sort-btn';
            btn.setAttribute('data-sort', sort.id);
            btn.textContent = sort.label;
            btn.addEventListener('click', function () {
                if (state.sort === sort.id) return;
                state.sort = sort.id;
                try { localStorage.setItem(SORT_KEY, sort.id); } catch (e) { }
                state.page = 0;
                renderList();
            });
            els.sorts.appendChild(btn);
        });
    }

    function bind() {
        els.panel = byId('library-panel');
        if (!els.panel) return;

        els.stage = byId('lib-stage');
        els.categories = byId('lib-categories');
        els.grid = byId('lib-grid');
        els.count = byId('lib-count');
        els.searchWrap = byId('lib-search-wrap');
        els.search = byId('lib-search');
        els.searchClear = byId('lib-search-clear');
        els.toast = byId('lib-toast');
        els.footer = byId('lib-footer');
        els.prev = byId('lib-prev');
        els.next = byId('lib-next');
        els.pages = byId('lib-pages');
        els.crumbTitle = byId('lib-crumb-title');
        els.back = byId('lib-back');
        els.sorts = byId('lib-sorts');
        els.dialog = byId('lib-dialog');
        els.dialogTitle = byId('lib-dialog-title');
        els.dialogBody = byId('lib-dialog-body');
        els.dialogCancel = byId('lib-dialog-cancel');

        var savedSort = null;
        try { savedSort = localStorage.getItem(SORT_KEY); } catch (e) { }
        if (SORTS.some(function (s) { return s.id === savedSort; })) state.sort = savedSort;

        els.back.addEventListener('click', showCategories);
        byId('lib-close').addEventListener('click', closePanel);

        els.prev.addEventListener('click', function () {
            if (state.page > 0) { state.page--; renderList(); }
        });
        els.next.addEventListener('click', function () {
            if (state.page < state.pages - 1) { state.page++; renderList(); }
        });

        els.grid.addEventListener('click', function (ev) {
            var card = ev.target.closest ? ev.target.closest('.lib-card') : null;
            if (!card || card.tagName === 'A') return; // anchors open the product page themselves
            var index = parseInt(card.getAttribute('data-index'), 10);
            var item = state.items[index];
            if (item) playItem(item);
        });

        els.dialog.addEventListener('click', function (ev) {
            if (ev.target === els.dialog) hideChooser();
        });

        // Title filter
        if (els.search) {
            els.search.addEventListener('input', function () {
                setQuery(els.search.value);
                if (state.view === 'list') renderList();
            });
            els.search.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                    // Enter launches the first match; anchors still open their page.
                    var first = els.grid.querySelector('.lib-card');
                    if (first) { ev.preventDefault(); first.click(); }
                }
            });

            // The SDL keyboard bridge listens on window and calls preventDefault()
            // for every key, which made this field impossible to type in. Letting
            // the events stop at the field keeps them away from that bridge, so
            // normal typing, IME and paste all behave again.
            ['keydown', 'keypress', 'keyup'].forEach(function (name) {
                els.search.addEventListener(name, function (ev) { ev.stopPropagation(); });
            });
        }
        if (els.searchClear) {
            els.searchClear.addEventListener('click', function () {
                setQuery('');
                if (state.view === 'list') renderList();
                focusSearch();
            });
        }

        // Keyboard: Esc closes, arrows / PgUp PgDn flip pages while browsing.
        window.addEventListener('keydown', function (ev) {
            if (!ev || !els.panel || !els.panel.classList.contains('active')) return;
            var typing = ev.target && (ev.target === els.search || ev.target.tagName === 'INPUT');
            if (ev.key === 'Escape') {
                ev.stopImmediatePropagation();
                ev.preventDefault();
                if (typing) {
                    // First Esc clears the filter, a second one leaves the field.
                    if (els.search.value) { setQuery(''); renderList(); }
                    else els.search.blur();
                    return;
                }
                if (els.dialog.classList.contains('active')) hideChooser();
                else closePanel();
                return;
            }
            if (els.dialog.classList.contains('active')) return;
            if (state.view !== 'list') return;
            if (typing) return;

            if (ev.key === '/' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
                focusSearch();
                ev.stopImmediatePropagation();
                ev.preventDefault();
                return;
            }

            var handled = false;
            if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') {
                if (state.page > 0) { state.page--; renderList(); handled = true; }
            } else if (ev.key === 'ArrowRight' || ev.key === 'PageDown') {
                if (state.page < state.pages - 1) { state.page++; renderList(); handled = true; }
            }
            if (handled) {
                ev.stopImmediatePropagation();
                ev.preventDefault();
            }
        }, true);

        window.addEventListener('resize', function () {
            if (!els.panel.classList.contains('active')) return;
            window.clearTimeout(layoutTimer);
            layoutTimer = window.setTimeout(relayout, 150);
        });

        // Poll for engine readiness so a pending launch can resume after a reload.
        window.setInterval(function () {
            if (engineReady() && !state.engineReady) {
                state.engineReady = true;
                consumePendingLaunch();
            }
        }, 500);
    }

    function boot() {
        bind();
        if (!els.panel) return;
        buildSortButtons();
        if (engineReady()) state.engineReady = true;
    }

    // Public API used by index.html.
    window.SamLibrary = {
        open: openPanel,
        close: closePanel,
        toggle: togglePanel,
        showCategories: showCategories,
        // Look a title up in the bundled catalogue and start it.
        playTitle: function (title) {
            var item = (window.SAM_LIBRARY && window.SAM_LIBRARY.items || []).find(function (i) {
                return i.t === title;
            });
            if (item) playItem(item);
            return !!item;
        },
        // Start an explicit {title, file} pair (used by automation and deep links).
        playFile: function (item, file) {
            if (item && file) launchFile(item, file);
        },
        onEngineReady: function () {
            state.engineReady = true;
            consumePendingLaunch();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
