// momentry UI: plain JS, no build step, no dependencies. Talks only to the local momentry process (same origin).
(() => {
  'use strict';

  // ---------- tiny helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const main = $('#main');
  const enc = encodeURIComponent;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const usd = (n) => (n == null ? '–' : n < 0.005 && n > 0 ? '< 0.01 USD' : `${n.toFixed(2)} USD`);
  const fmtDate = (s) => {
    if (!s) return '';
    const d = new Date(s.length === 10 ? `${s}T12:00:00` : s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  };
  const fmtWhen = (s) => {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  const ICON = {
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.3L12 17.1l-5.7 3.1 1.2-6.3L2.8 9.5l6.4-.8z"/></svg>',
    edit: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>',
    copy: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
    chat: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    back: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    chev: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    x: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    check: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
    shield: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
    search: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>',
    plus: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    download: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  };

  // ---------- token and API ----------
  const TOKEN_KEY = 'momentry.token';
  let token = null;
  {
    // the key arrives once in the address (#t=… or #/route?t=…); it moves to this tab's storage and leaves the address
    const m = /(^#|[?&])t=([A-Za-z0-9_-]{16,})/.exec(location.hash);
    if (m) {
      token = m[2];
      store.set(TOKEN_KEY, token);
      let rest = location.hash.replace(m[0], m[1] === '#' ? '#' : m[1]).replace(/[?&]$/, '').replace('?&', '?');
      if (rest === '#' || rest === '') rest = '#/';
      history.replaceState(null, '', `${location.pathname}${rest}`);
    } else token = store.get(TOKEN_KEY);
  }

  class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

  async function api(method, path, body) {
    let res;
    try {
      res = await fetch(path, { method, headers: { 'x-momentry-token': token ?? '', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new ApiError('momentry is not running any more. Open it again from your agent, or run: momentry ui', 0);
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) throw new ApiError(data?.error ?? 'Something went wrong.', res.status);
    return data;
  }

  // keep the process alive while a tab is open; it stops itself a few minutes after the last tab closes
  setInterval(() => { api('GET', '/api/ping').catch(() => {}); }, 60000);

  // ---------- toasts ----------
  function toast(msg, { error = false, action, onAction, ms = 5000 } = {}) {
    const box = $('.toasts');
    const t = document.createElement('div');
    t.className = `toast${error ? ' is-err' : ''}`;
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
    if (action) t.querySelector('button').addEventListener('click', () => { t.remove(); onAction?.(); });
    box.append(t);
    setTimeout(() => t.remove(), ms);
  }
  const fail = (e) => toast(e.message, { error: true, ms: 8000 });

  // ---------- shared bits ----------
  let overview = null;
  async function getOverview(force = false) {
    if (!overview || force) overview = await api('GET', '/api/overview');
    $('[data-version]').textContent = `momentry v${overview.version}`;
    const c = $('[data-count]');
    c.hidden = !overview.counts.unread;
    c.textContent = overview.counts.unread;
    c.setAttribute('aria-label', `${overview.counts.unread} new`);
    return overview;
  }
  const onProjects = () => (overview?.projects ?? []).filter((p) => p.observed && !p.error);
  // a project paused on this machine: named in project pickers so an empty wall is not a surprise
  const projectLabel = (p) => `${p.name}${p.paused ? ' · Paused' : ''}`;
  const PAUSED_TAG = '<span class="tag">Paused</span>';

  const stars = (n) => `<span class="stars" role="img" aria-label="${n} of 3 stars">${[1, 2, 3].map((i) => `<span class="${i <= n ? '' : 'off'}">${ICON.star}</span>`).join('')}</span>`;
  const spinner = '<span class="spin" aria-hidden="true"></span>';

  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `${spinner}${esc(label ?? 'Working…')}`; }
    else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  }

  /** Applies data-w / data-h sizes (inline styles are blocked by the page's security policy). */
  function applySizes(root = main) {
    for (const el of $$('[data-w]', root)) el.style.width = `${el.dataset.w}%`;
    for (const el of $$('[data-h]', root)) el.style.height = `${el.dataset.h}%`;
  }

  function skeletonWall() {
    return `<div class="page-head"><div class="skel skel-line"></div></div><div class="wall" aria-hidden="true">${'<div class="skel skel-card"></div>'.repeat(6)}</div><p class="sr-only">Loading stories…</p>`;
  }

  function errorPage(e) {
    const expired = e.status === 401 || e.status === 0;
    main.innerHTML = `<div class="empty"><div class="note"><span class="hand">${expired ? 'this tab lost its key' : 'hmm'}</span><h2>${expired ? 'Open momentry again' : 'This page could not load'}</h2><p>${esc(e.message)}</p>${expired ? '<p class="mono">momentry ui</p>' : '<button class="btn btn-primary" type="button" data-action="reload">Try again</button>'}</div></div>`;
  }

  // ---------- router ----------
  function parseHash() {
    const h = location.hash.replace(/^#/, '') || '/';
    const [p, qs] = h.split('?');
    return { path: p || '/', q: new URLSearchParams(qs ?? '') };
  }
  const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
  function setQuery(q) {
    const { path } = parseHash();
    const s = q.toString();
    history.replaceState(null, '', `#${path}${s ? `?${s}` : ''}`);
  }

  const VIEWS = [
    [/^\/$/, 'stories', viewStories],
    [/^\/story\/([^/]+)\/([^/]+)$/, 'stories', viewStory],
    [/^\/series$/, 'series', viewSeries],
    [/^\/privacy$/, 'privacy', viewPrivacy],
    [/^\/cost$/, 'cost', viewCost],
    [/^\/health$/, 'health', viewHealth],
    [/^\/settings$/, 'settings', viewSettings],
    [/^\/setup$/, null, viewSetup],
  ];
  const TITLES = { stories: 'Stories', series: 'Series', privacy: 'Privacy', cost: 'Cost', health: 'Health', settings: 'Settings' };

  let renderSeq = 0;
  async function render() {
    if (!token) { errorPage(new ApiError('This tab has no access key. Open momentry from your agent, or run: momentry ui', 401)); return; }
    const seq = ++renderSeq;
    const { path, q } = parseHash();
    const hit = VIEWS.find(([re]) => re.test(path)) ?? VIEWS[0];
    const args = path.match(hit[0])?.slice(1) ?? [];
    for (const a of $$('[data-nav]')) { if (a.dataset.nav === hit[1]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
    document.title = hit[1] ? `${TITLES[hit[1]]} · momentry` : 'Set up · momentry';
    try {
      await hit[2]({ q, args, isCurrent: () => seq === renderSeq });
    } catch (e) {
      if (seq === renderSeq) errorPage(e);
    }
  }
  window.addEventListener('hashchange', () => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); render(); main.focus({ preventScroll: true }); window.scrollTo(0, 0); });

  // ---------- Stories (the wall) ----------
  let storiesCache = null;
  const FILTERS = [['all', 'All'], ['week', 'This week'], ['unread', 'Unread'], ['later', 'Later'], ['picked', 'Picked']];
  function weekStart() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
  function matches(s, view) {
    switch (view) {
      case 'week': return s.date && new Date(`${s.date}T12:00:00`) >= weekStart();
      case 'unread': return !s.seen && s.status === 'raw';
      case 'later': return s.later;
      case 'picked': return ['picked', 'drafted', 'published'].includes(s.status);
      default: return true;
    }
  }

  function cardHtml(s, { top = false, showRank = true } = {}) {
    const cls = ['card', s.status === 'picked' || s.status === 'drafted' || s.status === 'published' ? 'is-picked' : '', s.status === 'dropped' ? 'is-dropped' : '', top ? 'is-top' : ''].filter(Boolean).join(' ');
    const meta = [showRank ? `#${s.rank}` : null, s.code, s.projectName, s.twist].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('<span class="sep">·</span>');
    const tags = [
      s.status !== 'raw' ? `<span class="tag ${s.status === 'dropped' ? '' : 'tag-pick'}">${esc(s.statusWord)}</span>` : '',
      s.later && s.status === 'raw' ? '<span class="tag tag-mint">Later</span>' : '',
      s.byHand ? '<span class="tag">Your note</span>' : '',
      s.forYou ? `<span class="tag tag-mint" title="${esc(s.tasteWhy || 'Like stories you chose to use')}">Your kind</span>` : '',
      ...s.signals.slice(0, 2).map((x) => `<span class="tag" title="${esc(x)}">${esc(x)}</span>`),
    ].filter(Boolean).join('');
    const used = ['picked', 'drafted', 'published'].includes(s.status);
    return `<article class="${cls}" data-key="${esc(s.key)}">
      ${!s.seen && s.status === 'raw' ? '<span class="new-flag" aria-label="unread">new!</span>' : ''}
      <div class="card-meta">${meta}</div>
      ${s.angle
        ? `<h3 class="card-title card-angle"><a href="#/story/${esc(s.key)}">${esc(s.angle)}</a></h3>
      <p class="card-event">${esc(s.title)}</p>
      ${s.audience ? `<p class="card-aud">For ${esc(s.audience)}</p>` : ''}`
        : `<h3 class="card-title"><a href="#/story/${esc(s.key)}">${esc(s.title)}</a></h3>
      ${s.summary ? `<p class="card-sum">${esc(s.summary)}</p>` : ''}`}
      ${tags ? `<div class="card-signals">${tags}</div>` : ''}
      <div class="card-foot">
        <span class="row">${stars(s.stars)}<span class="mono">${esc(fmtDate(s.date))}</span></span>
        <div class="card-actions" role="group" aria-label="Decide">
          <button class="act" type="button" data-action="mark" data-mark="${used ? 'restore' : 'use'}" aria-pressed="${used}">Use</button>
          <button class="act" type="button" data-action="mark" data-mark="${s.later ? 'unlater' : 'later'}" aria-pressed="${s.later}">Later</button>
          <button class="act" type="button" data-action="mark" data-mark="${s.status === 'dropped' ? 'restore' : 'drop'}" aria-pressed="${s.status === 'dropped'}">Drop</button>
        </div>
      </div>
    </article>`;
  }

  async function viewStories({ q, isCurrent }) {
    if (!storiesCache) main.innerHTML = skeletonWall();
    const [ov, stories] = await Promise.all([getOverview(true), api('GET', '/api/stories')]);
    if (!isCurrent()) return;
    storiesCache = stories;
    if (!ov.setupDone && !store.get('momentry.setup-seen')) { store.set('momentry.setup-seen', '1'); go('#/setup'); return; }
    drawWall(q);
  }

  function drawWall(q = parseHash().q) {
    const ov = overview;
    const projects = onProjects();
    const view = FILTERS.some(([k]) => k === q.get('view')) ? q.get('view') : 'all';
    const proj = projects.some((p) => p.id === q.get('project')) ? q.get('project') : '';
    const dropped = q.get('dropped') === '1';
    const pool = storiesCache.filter((s) => !proj || s.project === proj);
    const list = pool.filter((s) => matches(s, view) && (dropped || s.status !== 'dropped'));
    const count = (k) => pool.filter((s) => matches(s, k) && s.status !== 'dropped').length;
    const droppedN = pool.filter((s) => s.status === 'dropped').length;

    if (!projects.length) {
      main.innerHTML = `<div class="empty"><div class="note"><span class="hand">your wall is empty</span><h2>Turn on a project to start</h2><p>momentry reads your agent sessions after they end and pins the moments worth telling here. Setup takes about a minute.</p><a class="btn btn-primary btn-lg" href="#/setup">Set up momentry</a></div></div>`;
      return;
    }
    const paused = projects.filter((p) => p.paused && (!proj || p.id === proj));
    const pausedNote = paused.length ? `<p class="hint paused-note">${PAUSED_TAG} No new stories are gathered from ${esc(paused.map((p) => p.name).join(', '))} on this machine. <a href="#/settings">Turn gathering back on</a></p>` : '';
    const head = `<div class="page-head">
      <div><span class="hand">best ones on top</span><h1>Your story wall</h1>
      <p class="lede">${storiesCache.length ? `${plural(pool.filter((s) => s.status !== 'dropped').length, 'story', 'stories')}${projects.length > 1 && !proj ? ` across ${plural(projects.length, 'project', 'projects')}` : ''}. Use the ones worth telling, keep some for later, drop the rest.` : 'Nothing pinned yet. Find stories in your recent sessions, or jot one down yourself.'}</p></div>
      ${pausedNote}</div>
      <button class="btn btn-marker" type="button" data-action="find">${ICON.search}Find new stories</button>
    </div>`;
    const toolbar = `<div class="toolbar">
      <div class="seg" role="group" aria-label="Show">${FILTERS.map(([k, label]) => `<button type="button" data-action="filter" data-view="${k}" aria-pressed="${k === view}">${label}<span class="n">${count(k)}</span></button>`).join('')}</div>
      <div class="row">
        ${projects.length > 1 ? `<label class="sr-only" for="proj-filter">Project</label><select class="select" id="proj-filter" data-action="project-filter"><option value="">All projects</option>${projects.map((p) => `<option value="${esc(p.id)}"${p.id === proj ? ' selected' : ''}>${esc(projectLabel(p))}</option>`).join('')}</select>` : ''}
        ${droppedN ? `<label class="switch"><input type="checkbox" data-action="show-dropped"${dropped ? ' checked' : ''}><span class="track" aria-hidden="true"></span><span class="hint">Show dropped (${droppedN})</span></label>` : ''}
      </div>
    </div>`;
    let body;
    if (!list.length) {
      const words = {
        all: ['nothing here yet', 'No stories yet', 'Stories appear after a session ends. You can also look through your recent sessions now.'],
        week: ['quiet week', 'Nothing new this week', 'Stories from earlier weeks are under All.'],
        unread: ['all caught up', 'You have read everything', 'New stories show up here with a blue "new!" mark.'],
        later: ['no backlog', 'Nothing saved for later', 'Press Later on a card to keep it here without deciding yet.'],
        picked: ['none picked', 'No stories picked yet', 'Press Use on a card you want to tell. It turns yellow.'],
      }[view];
      body = `<div class="empty"><div class="note"><span class="hand">${words[0]}</span><h2>${words[1]}</h2><p>${words[2]}</p>${view === 'all' ? `<div class="row"><button class="btn btn-primary" type="button" data-action="find">${ICON.search}Find stories</button><button class="btn btn-quiet" type="button" data-action="note">${ICON.plus}Quick note</button></div>` : ''}</div></div>`;
    } else {
      const topOk = view !== 'later' && list[0].status !== 'dropped';
      body = `<div class="wall">${list.map((s, i) => cardHtml({ ...s, rank: i + 1 }, { top: topOk && i === 0 })).join('')}</div>`;
    }
    main.innerHTML = head + toolbar + body;
  }

  async function mark(key, action, { quiet = false } = {}) {
    const [pid, id] = key.split('/');
    const before = storiesCache?.find((s) => s.key === key);
    const prev = before ? { status: before.status, later: before.later } : null;
    const s = await api('POST', `/api/stories/${enc(pid)}/${enc(id)}/mark`, { action });
    if (storiesCache) { const i = storiesCache.findIndex((x) => x.key === key); if (i >= 0) storiesCache[i] = { ...storiesCache[i], status: s.status, statusWord: s.statusWord, later: s.later }; }
    if (!quiet && prev) {
      const msg = { use: 'Picked. It is yellow on your wall now.', later: 'Saved for later.', drop: 'Dropped. The file stays, marked as dropped.', restore: 'Moved back to new.', unlater: 'Removed from later.' }[action] ?? `Marked ${s.statusWord}.`;
      toast(msg, { action: 'Undo', onAction: async () => {
        try {
          if (action === 'later') await mark(key, 'unlater', { quiet: true });
          else if (action === 'unlater') await mark(key, 'later', { quiet: true });
          else await mark(key, prev.status, { quiet: true });
          render();
        } catch (e) { fail(e); }
      } });
    }
    return s;
  }

  // ---------- Story ----------
  let current = null;
  async function viewStory({ args, isCurrent }) {
    const [pid, id] = args.map(decodeURIComponent);
    main.innerHTML = `<div class="reader"><div class="sheet"><div class="skel skel-line"></div><div class="skel skel-block"></div></div></div><p class="sr-only">Loading the story…</p>`;
    const s = await api('GET', `/api/stories/${enc(pid)}/${enc(id)}`);
    if (!isCurrent()) return;
    current = s;
    if (storiesCache) { const c = storiesCache.find((x) => x.key === s.key); if (c) c.seen = true; }
    drawStory();
    getOverview(true).catch(() => {});
  }

  function sectionHtml(s, key) {
    const text = s.sections[key];
    if (!text && key === 'outsider') return '';
    return `<section class="section is-${key}" data-section="${key}">
      <div class="section-head"><h2 class="section-label">${esc(s.sectionLabels[key])}</h2>
      <button class="btn btn-ghost btn-sm edit-btn" type="button" data-action="edit" data-field="${key}" aria-label="Edit ${esc(s.sectionLabels[key])}">${ICON.edit}${text ? 'Edit' : 'Add'}</button></div>
      <p class="section-text${text ? '' : ' is-empty'}">${text ? esc(text) : `No ${esc(s.sectionLabels[key].toLowerCase())} yet.`}</p>
    </section>`;
  }

  function drawStory() {
    const s = current;
    const used = ['picked', 'drafted', 'published'].includes(s.status);
    const meta = [`#${s.rank ?? ''}`.replace(/^#$/, ''), s.code, s.projectName, s.twist, fmtDate(s.date)].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('<span class="sep">·</span>');
    main.innerHTML = `<a class="back" href="#/">${ICON.back}All stories</a>
    <div class="reader">
      <div>
        <article class="sheet${used ? ' is-picked' : ''}">
          <div class="card-meta">${meta}</div>
          ${s.angle ? `<p class="sheet-angle">${esc(s.angle)}</p>${s.audience ? `<p class="sheet-aud">For ${esc(s.audience)}</p>` : ''}${angleCheckHtml(s)}`
    : `<div class="angle-ask"><p class="hint">${s.angleNone ? 'Claude read this story and found no angle worth telling.' : 'No angle yet: momentry writes one for the top stories of each session only.'}</p>
            <button class="btn btn-quiet btn-sm" type="button" data-action="write-angle">${s.angleNone ? 'Try again' : 'Write the angle'}</button><span class="hint">about $0.004, 25 seconds</span></div>`}
          ${outlineHtml(s)}
          <div class="title-row${s.angle ? ' is-sub' : ''}" data-section="title">
            <h1 class="sheet-title">${esc(s.title)}</h1>
            <button class="btn btn-ghost btn-sm edit-btn" type="button" data-action="edit" data-field="title" aria-label="Edit title">${ICON.edit}</button>
          </div>
          ${['context', 'what', 'lesson', 'artefact', 'outsider'].map((k) => sectionHtml(s, k)).join('')}
        </article>
        <div class="source" data-source></div>
      </div>
      <aside class="side" aria-label="About this story">
        <div class="panel stack">
          <div class="label">Will you tell it?</div>
          <div class="decide" role="group" aria-label="Decide">
            <button class="btn btn-quiet btn-sm" type="button" data-action="mark-one" data-mark="${used ? 'restore' : 'use'}" aria-pressed="${used}">Use</button>
            <button class="btn btn-quiet btn-sm" type="button" data-action="mark-one" data-mark="${s.later ? 'unlater' : 'later'}" aria-pressed="${s.later}">Later</button>
            <button class="btn btn-quiet btn-sm" type="button" data-action="mark-one" data-mark="${s.status === 'dropped' ? 'restore' : 'drop'}" aria-pressed="${s.status === 'dropped'}">Drop</button>
          </div>
          <div class="field"><label for="stage">Stage</label>
            <select class="select square" id="stage" data-action="stage">${s.statuses.map((x) => `<option value="${x.value}"${x.value === s.status ? ' selected' : ''}>${esc(x.word)}</option>`).join('')}</select></div>
        </div>
        <div class="panel">
          <dl>
            <dt>Strength</dt><dd>${stars(s.stars)}</dd>
            <dt>Project</dt><dd>${esc(s.projectName)}</dd>
            <dt>Date</dt><dd>${esc(fmtDate(s.date))}</dd>
            ${s.twist ? `<dt>Twist</dt><dd>${esc(s.twist)}</dd>` : ''}
            <dt>Found by</dt><dd>${s.byHand ? 'You' : 'momentry'}</dd>
            ${s.signals.length ? `<dt>Signals</dt><dd><div class="chips">${s.signals.map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div></dd>` : ''}
            ${s.threads.length ? `<dt>Series</dt><dd>${s.threads.map((t) => `<a href="#/series">${esc(t)}</a>`).join(', ')}</dd>` : ''}
            ${s.links.length ? `<dt>Related</dt><dd class="stack">${s.links.map((l) => (l.exists ? `<a href="#/story/${esc(l.key)}">${esc(l.title)}</a>` : `<span class="hint">${esc(l.title)} (missing)</span>`)).join('')}</dd>` : ''}
          </dl>
        </div>
        <div class="panel stack">
          <button class="btn btn-quiet" type="button" data-action="copy-story">${ICON.copy}Copy as text</button>
          ${s.hasSource ? `<button class="btn btn-quiet" type="button" data-action="show-source">${ICON.chat}Show where it came from</button>` : ''}
          <div><div class="label">File</div><div class="path">${esc(s.file)}</div></div>
        </div>
      </aside>
    </div>`;
  }

  /** The angle check: is it a story you can tell, and is it clear without asking more. Clicking a pressed answer takes it back. */
  const VERDICT_WORDS = [['tellable', 'I can tell this'], ['no-story', 'True, but no story'], ['invented', 'Made up']];
  const ANSWER_WORDS = [['yes', 'Yes'], ['no', 'No']];
  function angleCheckHtml(s) {
    const btn = (field, [v, w], cur) => `<button class="btn btn-quiet btn-sm" type="button" data-action="angle-check" data-field="${field}" data-value="${v}" aria-pressed="${cur === v}">${w}</button>`;
    return `<div class="angle-check">
      <div class="decide" role="group" aria-label="Is this angle a story you can tell?">${VERDICT_WORDS.map((x) => btn('verdict', x, s.verdict)).join('')}</div>
      <div class="decide" role="group" aria-label="Clear after reading, no need to ask more?"><span class="hint">Clear without asking more?</span>${ANSWER_WORDS.map((x) => btn('understood', x, s.understood)).join('')}</div>
    </div>`;
  }

  /** The outline the angle was built on: one line per filled slot, folded until opened. */
  function outlineHtml(s) {
    if (!s.outline?.length) return '';
    return `<details class="outline"><summary>Story outline <span class="hint">${s.outline.length} of 7 parts</span></summary>
      <dl>${s.outline.map((o) => `<dt>${esc(o.word)}</dt><dd>${esc(o.text)}${o.lines.length ? ` <span class="ln">${esc(o.lines.join(', '))}</span>` : ''}</dd>`).join('')}</dl>
    </details>`;
  }

  function storyText(s) {
    const parts = [s.title, ''];
    if (s.outline?.length) parts.push(...s.outline.map((o) => `${o.word}: ${o.text}`), '');
    for (const k of ['context', 'what', 'lesson', 'artefact', 'outsider']) if (s.sections[k]) parts.push(`${s.sectionLabels[k]}: ${s.sections[k]}`, '');
    return parts.join('\n').trim();
  }

  function startEdit(field) {
    const s = current;
    const host = $(`[data-section="${field}"]`);
    if (!host || host.querySelector('.edit-box')) return;
    const value = field === 'title' ? s.title : s.sections[field];
    const label = field === 'title' ? 'Title' : s.sectionLabels[field];
    const box = document.createElement('div');
    box.className = 'edit-box';
    box.innerHTML = `<label class="sr-only" for="edit-${field}">${esc(label)}</label>
      ${field === 'title' ? `<input class="input" id="edit-${field}" value="${esc(value)}" maxlength="200">` : `<textarea class="textarea" id="edit-${field}">${esc(value)}</textarea>`}
      <p class="err-text" hidden></p>
      <div class="row"><span class="hint hide-sm">Ctrl+Enter saves · Esc cancels</span><button class="btn btn-ghost btn-sm" type="button" data-action="edit-cancel">Cancel</button><button class="btn btn-primary btn-sm" type="button" data-action="edit-save" data-field="${field}">Save</button></div>`;
    const keep = [...host.children];
    keep.forEach((c) => { c.hidden = true; });
    host.append(box);
    const input = box.querySelector('input,textarea');
    if (input.tagName === 'TEXTAREA') { input.style.height = `${Math.max(120, Math.min(420, input.scrollHeight + 4))}px`; }
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); drawStory(); }
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey || field === 'title')) { ev.preventDefault(); box.querySelector('[data-action="edit-save"]').click(); }
    });
  }

  async function saveEdit(btn) {
    const field = btn.dataset.field;
    const box = btn.closest('.edit-box');
    const input = box.querySelector('input,textarea');
    const err = box.querySelector('.err-text');
    busy(btn, true, 'Saving…');
    try {
      const [pid, id] = current.key.split('/');
      current = await api('PATCH', `/api/stories/${enc(pid)}/${enc(id)}`, field === 'title' ? { title: input.value } : { section: field, text: input.value });
      storiesCache = null;
      drawStory();
      toast('Saved to the markdown file.');
    } catch (e) {
      busy(btn, false);
      err.hidden = false;
      err.textContent = e.message;
      input.setAttribute('aria-invalid', 'true');
    }
  }

  async function showSource(btn) {
    const host = $('[data-source]');
    busy(btn, true, 'Reading…');
    try {
      const [pid, id] = current.key.split('/');
      const r = await api('GET', `/api/stories/${enc(pid)}/${enc(id)}/source`);
      const who = { user: 'You', assistant: 'Agent', tool: 'Tool', result: 'Result' };
      host.innerHTML = `<div class="panel-head"><div><span class="hand">straight from the session</span><h2>Where it came from</h2><p>Read from the conversation file on this machine. Highlighted lines are the ones the story was built from.</p></div></div>
        ${r.sessions.map((ss) => `<div class="stack"><div class="mono">${esc(ss.host)} session ${esc(ss.sid)}</div>
          ${ss.available ? `<div class="convo">${ss.entries.map((e) => (e.gap ? '<div class="gap">· · ·</div>' : `<div class="line kind-${esc(e.kind)}${e.marked ? ' is-marked' : ''}"><span class="who">${esc(who[e.kind] ?? e.kind)}${e.name ? `<br>${esc(e.name)}` : ''}</span><div class="what">${esc(e.text)}</div></div>`)).join('')}</div>` : '<p class="hint">This session file is not on this machine any more.</p>'}</div>`).join('')}`;
      btn.remove();
      host.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    } catch (e) { busy(btn, false); fail(e); }
  }

  // ---------- Series ----------
  async function viewSeries({ isCurrent }) {
    const series = await api('GET', '/api/series');
    if (!isCurrent()) return;
    const head = `<div class="page-head"><div><span class="hand">one thread, many posts</span><h1>Series</h1><p class="lede">Stories that share a thread line up here in date order, ready to tell as a run of posts.</p></div></div>`;
    if (!series.length) {
      main.innerHTML = `${head}<div class="empty"><div class="note"><span class="hand">no threads yet</span><h2>No series yet</h2><p>When two or more stories belong to the same thread, they are grouped here. A story joins a thread through the <span class="mono">threads</span> line at the top of its markdown file.</p><a class="btn btn-quiet" href="#/">Back to stories</a></div></div>`;
      return;
    }
    main.innerHTML = `${head}<div class="series">${series.map((t) => `<section aria-labelledby="t-${esc(t.key)}">
      <div class="thread-head"><h2 id="t-${esc(t.key)}">${esc(t.title)}</h2><span class="mono">${esc(t.projectName)} · ${plural(t.stories.length, 'story', 'stories')}</span></div>
      <div class="string">${t.stories.map((s) => cardHtml(s, { showRank: false })).join('')}</div></section>`).join('')}</div>`;
  }

  // ---------- Privacy ----------
  async function viewPrivacy({ isCurrent }) {
    const v = await api('GET', '/api/privacy');
    if (!isCurrent()) return;
    drawPrivacy(v);
  }

  function drawPrivacy(v) {
    main.innerHTML = `<div class="page-head"><div><span class="hand">what stays, what goes</span><h1>Privacy</h1></div></div>
    <div class="promise">${ICON.shield}<div><strong>No momentry server.</strong><p>Your sessions go from this machine straight to Claude through your own login. Stories are plain files on your disk. Nothing passes through us.</p></div></div>
    <div class="grid-2">
      <section class="panel">
        <div class="panel-head"><div><h2>Private names</h2><p>People, clients and secret project names. A story that mentions one is held back on this machine and never reaches your wall or your repo.</p></div></div>
        ${v.names.length ? `<div class="chips">${v.names.map((n) => `<span class="name-chip">${esc(n)}<button type="button" data-action="remove-name" data-name="${esc(n)}" aria-label="Remove ${esc(n)}">${ICON.x}</button></span>`).join('')}</div>` : '<p class="hint">No names yet. Until you add some, new stories are held back because they cannot be checked.</p>'}
        <form class="add-row" data-form="names"><label class="sr-only" for="name-in">Name to keep private</label><input class="input" id="name-in" name="names" placeholder="e.g. Jane Doe, Project Falcon" autocomplete="off"><button class="btn btn-primary" type="submit">Add</button></form>
        ${v.privateProjects.length ? `<p class="hint">Private mode: <strong>${v.privateProjects.map((p) => esc(p.name)).join(', ')}</strong>. Change it per project in <a href="#/settings">Settings</a>.</p>` : ''}
        <p class="hint">Separate several names with commas.${v.otherLists ? ` ${plural(v.otherLists, 'other name list is', 'other name lists are')} also in use.` : ''}</p>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h2>Held back</h2><p>Stories kept on this machine instead of your wall, with the reason.</p></div></div>
        ${v.held.length ? `<ul class="list">${v.held.map((h) => `<li><div class="grow"><div class="title">${esc(h.title)}</div><div class="sub">${esc(h.reason)}</div><div class="mono">${esc(h.projectName)} · ${esc(fmtWhen(h.at))}</div></div><button class="btn btn-quiet btn-sm" type="button" data-action="release" data-project="${esc(h.project)}" data-id="${esc(h.id)}">Check again and release</button></li>`).join('')}</ul>` : '<p class="hint">Nothing is held back. Every story so far passed the check.</p>'}
      </section>
    </div>
    <section class="panel">
      <div class="panel-head"><div><h2>Sent to Claude</h2><p>Each time momentry read a session, which lines it sent to Claude for reading. ${v.sentTotal > v.sent.length ? `Showing the latest ${v.sent.length} of ${v.sentTotal}.` : ''}</p></div></div>
      ${v.sent.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Project</th><th>Session</th><th class="num">Lines</th><th>Result</th></tr></thead><tbody>${v.sent.map((x) => `<tr><td>${esc(fmtWhen(x.at))}</td><td>${esc(x.projectName)}</td><td><span class="mono">${esc(x.host)} ${esc(x.sid.split(':')[1] ?? x.sid)}</span></td><td class="num">${esc(x.from)}–${esc(x.to)}</td><td>${x.ok ? 'Read' : 'Failed'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Nothing has been sent yet.</p>'}
    </section>`;
  }

  // ---------- Cost ----------
  async function viewCost({ isCurrent }) {
    const c = await api('GET', '/api/cost');
    if (!isCurrent()) return;
    const max = Math.max(0.01, ...c.weeks.map((w) => w.usd));
    const pmax = Math.max(0.01, ...c.byProject.map((p) => p.usd));
    main.innerHTML = `<div class="page-head"><div><span class="hand">your own Claude login</span><h1>Cost</h1><p class="lede">What reading your sessions cost, as reported by Claude. On a Pro or Max plan this is usage of your plan, not a bill.</p></div></div>
    <section class="panel">
      <div class="stat-row">
        <div class="stat"><div class="label">This week</div><div class="big-num">${c.thisWeek.toFixed(2)}<small>USD</small></div></div>
        <div class="stat"><div class="label">Today${c.budget ? ` of ${usd(c.budget)}` : ''}</div><div class="val">${usd(c.today)}</div>${c.budget ? `<div class="hbar"><span data-w="${Math.min(100, Math.round((c.today / c.budget) * 100))}"></span></div>` : ''}</div>
        <div class="stat"><div class="label">Last week</div><div class="val">${usd(c.lastWeek)}</div></div>
        <div class="stat"><div class="label">All time</div><div class="val">${usd(c.total)}</div></div>
      </div>
      <div class="bars" role="img" aria-label="Spend per week for the last 8 weeks">${c.weeks.map((w, i) => `<div class="bar${i === 7 ? ' is-now' : ''}"><span class="v">${w.usd ? w.usd.toFixed(2) : ''}</span><span class="fill" data-h="${Math.round((w.usd / max) * 100)}"></span><span class="w">${i === 7 ? 'This wk' : esc(fmtDate(w.start))}</span></div>`).join('')}</div>
      <p class="hint budget-line">${c.budget ? `Sessions are read automatically until today's spend reaches ${usd(c.budget)}; the rest wait for the next day.` : 'No daily limit for automatic reading.'} ${c.waiting ? `<strong>${plural(c.waiting, 'session is', 'sessions are')} waiting for tomorrow.</strong>` : ''} <a href="#/settings">Change the budget</a></p>
      ${c.unknownReads ? `<p class="hint">${plural(c.unknownReads, 'read has', 'reads have')} no cost reported and ${c.unknownReads === 1 ? 'is' : 'are'} not counted.</p>` : ''}
    </section>
    <div class="grid-2">
      <section class="panel"><div class="panel-head"><div><h2>By project</h2></div></div>
        ${c.byProject.length ? `<ul class="list">${c.byProject.map((p) => `<li><div class="grow"><div class="row"><span class="title">${esc(p.name)}</span><span class="mono">${usd(p.usd)}</span></div><div class="hbar"><span data-w="${Math.round((p.usd / pmax) * 100)}"></span></div></div></li>`).join('')}</ul>` : '<p class="hint">No sessions read yet.</p>'}
      </section>
      <section class="panel"><div class="panel-head"><div><h2>By session</h2><p>Latest first.</p></div></div>
        ${c.sessions.length ? `<div class="table-wrap"><table><thead><tr><th>Session</th><th>Project</th><th class="num">Cost</th></tr></thead><tbody>${c.sessions.map((s) => `<tr><td><span class="mono">${esc(s.host)} ${esc(s.sid.split(':')[1] ?? s.sid)}</span><div class="hint">${esc(fmtWhen(s.last))}</div></td><td>${esc(s.projectName)}</td><td class="num">${usd(s.usd)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">No sessions read yet.</p>'}
      </section>
    </div>
    ${c.measures ? measuresHtml(c.measures) : ''}`;
    applySizes();
  }

  /** Seconds as a rough duration: minutes, hours and minutes, or days. */
  function duration(sec) {
    const m = Math.round(sec / 60);
    if (m < 1) return 'Under a minute';
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
    return plural(Math.round(h / 24), 'day', 'days');
  }

  /** The two local measures: time from install to the first story, and how many top-5 stories were used. */
  function measuresHtml(m) {
    const f = m.firstStory, t = m.top5;
    const first = f.state === 'measured' ? [duration(f.seconds), 'From installing momentry to the first story it found.']
      : f.state === 'waiting' ? ['Not yet', 'Counting from install until momentry finds its first story.']
        : ['Unknown', 'momentry was already in use here before it began measuring this, so the install time is not on record.'];
    const top = t.enough ? [`${Math.round(t.rate * 100)}%`, `Of ${t.decided} stories you decided on while they were in the top 5: ${t.use} used, ${t.later} for later, ${t.drop} dropped.`]
      : ['Not enough data', `Shown once you have decided on ${t.needed} stories while they were in the top 5 (${t.decided} so far).`];
    return `<section class="panel measures">
      <div class="panel-head"><div><h2>How it is going</h2><p>Measured on this machine only. Nothing is sent anywhere.</p></div></div>
      <div class="stat-row">
        <div class="stat"><div class="label">Time to first story</div><div class="val">${esc(first[0])}</div><p class="hint">${esc(first[1])}</p></div>
        <div class="stat"><div class="label">Top 5 stories used</div><div class="val">${esc(top[0])}</div><p class="hint">${esc(top[1])}</p></div>
      </div>
    </section>`;
  }

  // ---------- Health ----------
  async function viewHealth({ q, isCurrent }) {
    main.innerHTML = `<div class="page-head"><div><span class="hand">quick check-up</span><h1>Health</h1></div></div><div class="panel"><p class="hint">${spinner} Checking…</p></div>`;
    await getOverview();
    const h = await api('GET', `/api/health${q.get('project') ? `?project=${encodeURIComponent(q.get('project'))}` : ''}`);
    if (!isCurrent()) return;
    drawHealth(h);
  }

  function drawHealth(h) {
    const bad = [...h.checks.filter((c) => c.status === 'fail' || c.status === 'warn'), ...(h.agents.some((x) => x.ok) ? [] : h.agents.slice(0, 1))];
    $('[data-health-dot]').hidden = h.ok && !bad.length;
    const paused = !!h.project?.paused;
    const projects = overview.projects.filter((p) => !p.error);
    main.innerHTML = `<div class="page-head"><div><span class="hand">quick check-up</span><h1>Health</h1></div>
      ${projects.length > 1 ? `<div><label class="sr-only" for="health-proj">Project</label><select class="select" id="health-proj" data-action="health-project">${projects.map((p) => `<option value="${esc(p.id)}"${p.id === h.project?.id ? ' selected' : ''}>${esc(projectLabel(p))}</option>`).join('')}</select></div>` : ''}</div>
    <div class="banner ${bad.length ? 'bad' : 'ok'}"><span class="light" aria-hidden="true"></span><div class="grow"><strong>${bad.length ? `${plural(bad.length, 'thing needs', 'things need')} attention` : 'All good'}</strong><p>${bad.length ? (h.agents.some((x) => x.ok) ? 'Each line below says what is wrong and how to fix it.' : 'No agent is connected yet, so sessions are not read automatically. Connect one on the right.') : paused ? `Gathering is paused for ${esc(h.project.name)} on this machine, so no new stories arrive. Its stories stay on your wall.` : `momentry is ready${h.project ? ` for ${esc(h.project.name)}` : ''}. Stories are found after each session ends.`}</p></div>
      ${bad.some((c) => c.canFix) ? '<button class="btn btn-primary" type="button" data-action="fix-all">Fix it</button>' : ''}</div>
    <div class="grid-2">
      <section class="panel"><div class="panel-head"><div><h2>Checks</h2>${h.project ? `<p>For ${esc(h.project.name)}.${paused ? ` ${PAUSED_TAG}` : ''}</p>` : ''}</div></div>
        <div>${h.checks.map((c) => `<div class="check-row"><span class="light-sm ${esc(c.status)}" aria-label="${{ ok: 'OK', warn: 'Warning', fail: 'Problem', skip: 'Skipped', info: 'Note' }[c.status]}"></span>
          <div><div class="title">${esc(c.title)}</div>${c.why ? `<p class="why">${esc(c.why)}</p>` : ''}<details class="tech"><summary>Technical detail</summary><pre>${esc(c.detail)}</pre></details></div>
          ${c.canFix ? '<button class="btn btn-quiet btn-sm" type="button" data-action="fix-all">Fix it</button>' : c.code === 'privacy.sources' && c.status !== 'ok' ? '<a class="btn btn-quiet btn-sm" href="#/privacy">Add names</a>' : c.code === 'project.paused' && c.status === 'info' ? '<a class="btn btn-quiet btn-sm" href="#/settings">Settings</a>' : '<span></span>'}</div>`).join('')}</div>
      </section>
      <section class="panel"><div class="panel-head"><div><h2>Agents</h2><p>Where momentry listens for finished sessions.</p></div></div>
        ${h.agents.length ? `<ul class="list">${h.agents.map((a) => `<li><div class="grow"><div class="title">${esc(a.label)}</div><div class="sub">${esc(a.words)}</div></div>${a.ok ? `<span class="ok-text">${ICON.check}Connected</span>` : `<button class="btn btn-quiet btn-sm" type="button" data-action="connect" data-name="${esc(a.name)}">Connect</button>`}</li>`).join('')}</ul>` : '<p class="hint">No supported agent found on this machine. momentry works with Claude Code, Codex, pi, omp and Antigravity.</p>'}
      </section>
    </div>
    ${tasteHtml(h.taste)}`;
  }

  /** How well the wall's top 5 matches what you use, from your own decisions on this machine. */
  function tasteHtml(t) {
    if (!t) return '';
    const line = t.enough
      ? `Top 5: you used ${t.used} of ${t.decided} stories you decided on.${t.meanUsedRank !== null ? ` Stories you use sit at rank ${t.meanUsedRank.toFixed(1)} on average.` : ''}`
      : `Needs ${plural(t.missing, 'more decision', 'more decisions')} on top-5 stories (Use, Later or Drop) before this is shown.`;
    return `<section class="panel taste"><div class="panel-head"><div><h2>Your picks</h2><p>Counted on this machine only. Nothing is sent anywhere.</p></div></div><p data-taste>${esc(line)}</p></section>`;
  }

  // ---------- Settings ----------
  const SOURCE_WORDS = (src) => (src === 'mặc định' ? 'Default' : src === 'người dùng' ? 'Set by you' : src === 'repo' ? 'Set for this project' : String(src).startsWith('env ') ? `Set by ${String(src).slice(4)}; change it there` : src);

  function controlHtml(f, cur, scope, project) {
    const id = `set-${scope}-${project ?? 'u'}-${f.key.replace(/\W/g, '-')}`;
    const v = cur?.value;
    const locked = String(cur?.source ?? '').startsWith('env ');
    const data = `data-key="${esc(f.key)}" data-scope="${scope}"${project ? ` data-project="${esc(project)}"` : ''}`;
    let ctrl;
    if (f.type === 'bool') ctrl = `<label class="switch"><input type="checkbox" id="${id}" data-action="setting" ${data}${v ? ' checked' : ''}${locked ? ' disabled' : ''}><span class="track" aria-hidden="true"></span><span class="sr-only">${esc(f.label)}</span></label>`;
    else if (f.suggest) {
      const opts = [...new Set([...f.suggest, ...(v && !f.suggest.includes(v) ? [v] : [])])];
      ctrl = `<div class="seg" role="group" aria-labelledby="${id}-l">${opts.map((o) => `<button type="button" data-action="setting-pick" ${data} data-value="${esc(o)}" aria-pressed="${o === v}"${locked ? ' disabled' : ''}>${esc(o)}</button>`).join('')}</div>`;
    } else if (f.type === 'int' || f.type === 'number') ctrl = `<input class="input" type="number" inputmode="${f.type === 'int' ? 'numeric' : 'decimal'}" id="${id}" min="${f.min ?? 0}" step="${f.type === 'int' ? 1 : 0.5}" value="${esc(v ?? '')}" data-action="setting" data-type="${f.type}" ${data}${locked ? ' disabled' : ''}>`;
    else ctrl = `<input class="input" type="text" id="${id}" value="${esc(v ?? '')}" placeholder="${esc(f.default ?? '')}" data-action="setting" ${data}${locked ? ' disabled' : ''}>`;
    const src = cur?.source;
    const canReset = (scope === 'user' && src === 'người dùng') || (scope === 'project' && src === 'repo');
    return `<div class="set-row"><div><label class="label" id="${id}-l" for="${id}">${esc(f.label)}</label><p class="hint">${esc(f.desc)}</p>
      <div class="from"><span>${esc(SOURCE_WORDS(src))}</span>${canReset ? `<button type="button" data-action="setting-reset" ${data}>Reset to default</button>` : ''}<span data-saved hidden class="ok-text">${ICON.check}Saved</span></div></div>
      <div class="set-ctrl">${ctrl}<p class="err-text" hidden></p></div></div>`;
  }

  async function viewSettings({ isCurrent }) {
    const v = await api('GET', '/api/settings');
    if (!isCurrent()) return;
    drawSettings(v);
  }

  let settingsCache = null;
  function drawSettings(v, { keepAdvOpen = false } = {}) {
    settingsCache = v;
    const general = v.schema.filter((f) => f.tier === 'general' && !f.hidden);
    const adv = v.schema.filter((f) => f.tier === 'advanced' && !f.hidden);
    const proj = v.schema.filter((f) => f.tier === 'project' && !f.hidden);
    const advOpen = keepAdvOpen || $('details.adv')?.open;
    main.innerHTML = `<div class="page-head"><div><span class="hand">set once, forget</span><h1>Settings</h1><p class="lede">Changes save as you make them, into the same files the command line uses.</p></div>
      <a class="btn btn-quiet" href="#/setup">Run setup again</a></div>
    <section class="panel"><div class="panel-head"><div><h2>General</h2><p>For every project on this machine.</p></div></div>
      ${general.map((f) => controlHtml(f, v.user[f.key], 'user')).join('')}
      <div class="set-row"><div><div class="label">Private names</div><p class="hint">Names that must never reach a story.</p></div><div class="set-ctrl"><a class="btn btn-quiet" href="#/privacy">Manage names</a></div></div>
      <div class="set-row"><div><div class="label">Agents</div><p class="hint">Which coding agents tell momentry when a session ends.</p></div><div class="set-ctrl"><a class="btn btn-quiet" href="#/health">See connected agents</a></div></div>
      <div class="set-row"><div><div class="label">Updates</div><p class="hint">You have momentry v${esc(v.version)}.</p><p class="hint" data-update-msg></p></div><div class="set-ctrl"><button class="btn btn-quiet" type="button" data-action="check-update">Check for updates</button></div></div>
    </section>
    <section class="panel"><div class="panel-head"><div><h2>Projects</h2><p>Each project keeps its own stories and settings.</p></div></div>
      ${v.projects.length ? v.projects.map((p) => `<div class="project-card"><h3>${esc(p.name)}${p.paused ? ` ${PAUSED_TAG}` : ''}</h3><p class="path">${esc(p.root)}</p>
        <div class="set-row"><div><label class="label" for="ga-${esc(p.id)}">Gather stories</label><p class="hint">Off pauses this project on this machine: its sessions are not read and no new stories arrive. Its stories stay readable.</p></div><div class="set-ctrl"><label class="switch"><input type="checkbox" id="ga-${esc(p.id)}" data-action="gather" data-project="${esc(p.id)}"${p.paused ? '' : ' checked'}><span class="track" aria-hidden="true"></span><span class="sr-only">Gather stories</span></label></div></div>
        ${proj.map((f) => controlHtml(f, p.values[f.key], 'project', p.id)).join('')}
        ${p.boxInRepo ? `<div class="set-row"><div><label class="label" for="gi-${esc(p.id)}">Keep stories out of git</label><p class="hint">Adds the story folder to .gitignore so stories never get pushed.${p.remote ? ' This repo has a remote.' : ''}</p></div><div class="set-ctrl"><label class="switch"><input type="checkbox" id="gi-${esc(p.id)}" data-action="gitignore" data-project="${esc(p.id)}"${p.ignored ? ' checked' : ''}><span class="track" aria-hidden="true"></span><span class="sr-only">Keep stories out of git</span></label></div></div>` : ''}
        <div class="set-row"><div><label class="label" for="pm-${esc(p.id)}">Private mode</label><p class="hint">Stories of this project are never used for post drafts and never counted in shared labels. Nothing leaves your machine today; this keeps it that way when those features arrive.</p></div><div class="set-ctrl"><label class="switch"><input type="checkbox" id="pm-${esc(p.id)}" data-action="private-mode" data-project="${esc(p.id)}"${p.privateMode ? ' checked' : ''}><span class="track" aria-hidden="true"></span><span class="sr-only">Private mode</span></label></div></div>
        <div class="set-row"><div><label class="label" for="pb-${esc(p.id)}">Daily budget for this project (USD)</label><p class="hint">Extra limit for this project alone, on top of the general one. Empty means only the general budget applies.</p>
          <div class="from">${p.budget === null ? '<span>Uses the general budget</span>' : `<span>Set by you</span><button type="button" data-action="project-budget-reset" data-project="${esc(p.id)}">Remove</button>`}<span data-saved hidden class="ok-text">${ICON.check}Saved</span></div></div>
          <div class="set-ctrl"><input class="input" type="number" inputmode="decimal" min="0" step="0.5" id="pb-${esc(p.id)}" value="${p.budget ?? ''}" placeholder="${esc(v.user['budget.dailyUsd']?.value ?? '')}" data-action="project-budget" data-project="${esc(p.id)}"><p class="err-text" hidden></p></div></div>
        <div class="set-row"><div><div class="label">Export</div><p class="hint">Every story of this project in one markdown file.</p></div><div class="set-ctrl"><button class="btn btn-quiet" type="button" data-action="export" data-project="${esc(p.id)}">${ICON.download}Download markdown</button></div></div>
        <div class="danger"><h4>Delete this project's data</h4><p class="hint">Removes the story folder, held stories, session history and the project's momentry file. Your code and conversations are not touched.</p>
          <form class="add-row" data-form="delete" data-project="${esc(p.id)}" data-name="${esc(p.name)}"><label class="sr-only" for="del-${esc(p.id)}">Type ${esc(p.name)} to confirm</label><input class="input" id="del-${esc(p.id)}" name="confirm" placeholder="Type ${esc(p.name)} to confirm" autocomplete="off"><button class="btn btn-danger" type="submit">Delete data</button></form></div>
      </div>`).join('') : '<p class="hint">No project is turned on yet. <a href="#/setup">Set one up</a>.</p>'}
      ${v.missing.map((p) => `<div class="project-card"><h3>${esc(p.name)} <span class="tag">Folder gone</span></h3><p class="path">${esc(p.root)}</p>
        <p class="hint">${esc(p.error)}</p>
        <div class="danger"><h4>Remove from momentry</h4><p class="hint">Takes it off the list and removes what is left of it: stories kept outside the repo, held stories and session history.</p>
          <form class="add-row" data-form="delete" data-project="${esc(p.id)}" data-name="${esc(p.name)}"><label class="sr-only" for="del-${esc(p.id)}">Type ${esc(p.name)} to confirm</label><input class="input" id="del-${esc(p.id)}" name="confirm" placeholder="Type ${esc(p.name)} to confirm" autocomplete="off"><button class="btn btn-danger" type="submit">Remove</button></form></div>
      </div>`).join('')}
    </section>
    <details class="adv panel"${advOpen ? ' open' : ''}><summary>${ICON.chev}Advanced</summary><p class="hint">Models, retries and limits. The defaults suit most people.</p>
      ${adv.map((f) => controlHtml(f, v.user[f.key], 'user')).join('')}
    </details>
    <p class="hint">Settings file: <span class="path">${esc(v.userFile)}</span></p>`;
  }

  async function saveSetting(el, value) {
    const row = el.closest('.set-row');
    const err = row.querySelector('.err-text');
    const focusId = document.activeElement?.id || null;
    const ctlId = row.querySelector('.set-ctrl [id]')?.id ?? null;
    try {
      const v = await api('PUT', '/api/settings', { key: el.dataset.key, value, scope: el.dataset.scope, project: el.dataset.project });
      drawSettings(v, { keepAdvOpen: !!el.closest('details.adv') });
      const sel = `[data-key="${CSS.escape(el.dataset.key)}"][data-scope="${el.dataset.scope}"]${el.dataset.project ? `[data-project="${CSS.escape(el.dataset.project)}"]` : ''}`;
      const ok = $(sel)?.closest('.set-row')?.querySelector('[data-saved]');
      if (ok) { ok.hidden = false; setTimeout(() => { ok.hidden = true; }, 2200); }
      (document.getElementById(focusId) ?? document.getElementById(ctlId) ?? $(sel))?.focus({ preventScroll: true });
    } catch (e) {
      err.hidden = false;
      err.textContent = e.message;
      el.setAttribute?.('aria-invalid', 'true');
    }
  }

  // ---------- Setup ----------
  const STEPS = ['Agents', 'Projects', 'Private names', 'Budget', 'First stories'];
  async function viewSetup({ q, isCurrent }) {
    const step = Math.min(4, Math.max(0, Number(q.get('step')) || 0));
    const ov = await getOverview(true);
    if (!isCurrent()) return;
    const stepper = `<ol class="steps" aria-label="Setup steps">${STEPS.map((s, i) => `<li class="${i < step ? 'is-done' : i === step ? 'is-now' : ''}"${i === step ? ' aria-current="step"' : ''}>${i + 1}. ${s}</li>`).join('')}</ol>`;
    const foot = (next, { label = 'Continue', back = true } = {}) => `<div class="setup-foot"><div class="row">${back && step ? `<a class="btn btn-ghost" href="#/setup?step=${step - 1}">${ICON.back}Back</a>` : ''}<button class="btn btn-ghost" type="button" data-action="setup-skip">Skip setup</button></div><button class="btn btn-primary btn-lg" type="button" data-action="${next}">${label}</button></div>`;
    let body = '';
    if (step === 0) {
      const agents = await api('GET', '/api/agents');
      if (!isCurrent()) return;
      const found = agents.filter((a) => a.found);
      body = `<span class="hand">step one</span><h1>Which agents do you use?</h1><p class="lede">momentry listens for the end of each session in these agents, then reads it for stories. It also adds a short command to jot a story down mid-session.</p>
        <div class="pick-list">${agents.map((a) => `<label class="pick${a.found ? '' : ' is-off'}"><input type="checkbox" name="agent" value="${esc(a.name)}"${a.found && !a.connected ? ' checked' : ''}${!a.found || a.connected ? ' disabled' : ''}${a.connected ? ' checked' : ''}><span class="grow"><span class="title">${esc(a.label)}</span><span class="sub">${a.connected ? 'Already connected' : a.found ? `Found on this machine${a.profiles > 1 ? ` (${a.profiles} profiles)` : ''}` : 'Not found on this machine'}</span></span>${a.connected ? `<span class="ok-text">${ICON.check}</span>` : ''}</label>`).join('')}</div>
        ${found.length ? '' : '<p class="hint">No supported agent found. Install Claude Code, Codex, pi, omp or Antigravity, then run setup again.</p>'}
        ${foot('setup-agents', { label: 'Connect and continue' })}`;
    } else if (step === 1) {
      const projects = ov.projects.filter((p) => !p.error);
      const anyRemote = projects.some((p) => p.remote);
      body = `<span class="hand">step two</span><h1>Which projects should it watch?</h1><p class="lede">Each project keeps its own stories in a folder inside the repo. Only projects you turn on are read.</p>
        <div class="pick-list">${projects.map((p) => `<label class="pick"><input type="checkbox" name="project" value="${esc(p.root)}"${p.observed ? ' checked disabled' : ''}><span class="grow"><span class="title">${esc(p.name)}</span><span class="sub">${esc(p.root)}</span></span>${p.observed ? `<span class="ok-text">${ICON.check}On</span>` : ''}</label>`).join('') || '<p class="hint">No projects found yet. Add one below.</p>'}</div>
        <form class="add-row" data-form="add-project"><label class="sr-only" for="proj-path">Project folder</label><input class="input" id="proj-path" name="root" placeholder="/path/to/another/repo" autocomplete="off"><button class="btn btn-quiet" type="submit">Add project</button></form>
        <label class="check"><input type="checkbox" name="keep-out"${anyRemote ? ' checked' : ''}><span><span class="title">Keep stories out of git</span><span class="hint">Adds the story folder to .gitignore, so stories stay on this machine even when you push.${anyRemote ? ' Ticked because a repo has a remote.' : ''}</span></span></label>
        ${foot('setup-projects')}`;
    } else if (step === 2) {
      const v = await api('GET', '/api/privacy');
      if (!isCurrent()) return;
      body = `<span class="hand">step three</span><h1>Names to keep private</h1><p class="lede">People, clients, secret projects. A story that mentions one stays on this machine and never reaches your wall. You can change the list any time.</p>
        <div class="chips" data-names>${v.names.map((n) => `<span class="name-chip">${esc(n)}<button type="button" data-action="remove-name" data-name="${esc(n)}" aria-label="Remove ${esc(n)}">${ICON.x}</button></span>`).join('')}</div>
        <form class="add-row" data-form="names"><label class="sr-only" for="name-in">Name to keep private</label><input class="input" id="name-in" name="names" placeholder="e.g. Jane Doe, Project Falcon" autocomplete="off"><button class="btn btn-quiet" type="submit">Add</button></form>
        <p class="hint">${v.names.length ? `${plural(v.names.length, 'name', 'names')} on the list.` : 'With no names, stories cannot be checked and are held back until you add some.'}</p>
        ${foot('setup-names')}`;
    } else if (step === 3) {
      const v = await api('GET', '/api/settings');
      if (!isCurrent()) return;
      const cur = v.user['budget.dailyUsd']?.value ?? 3;
      const opts = [[1, '1 USD'], [3, '3 USD'], [5, '5 USD'], [10, '10 USD'], [0, 'No limit']];
      body = `<span class="hand">step four</span><h1>A daily budget</h1><p class="lede">After each session momentry reads it with your own Claude login, about 1 USD per long session. Pick how much it may spend per day. Sessions over the limit wait for the next day; nothing is lost.</p>
        <div class="seg" role="group" aria-label="Daily budget">${opts.map(([n, l]) => `<button type="button" data-action="budget-pick" data-value="${n}" aria-pressed="${n === cur}">${l}</button>`).join('')}</div>
        <p class="hint" data-budget-msg>${cur ? `Now: up to ${usd(cur)} a day.` : 'Now: no daily limit.'} On a Pro or Max plan this counts against your plan's usage instead.</p>
        ${foot('setup-budget')}`;
    } else {
      const projects = onProjects();
      body = `<span class="hand">last step</span><h1>Find your first stories</h1><p class="lede">momentry reads your most recent sessions now. Later it does this by itself after each session ends.</p>
        ${projects.length ? findForm(projects, 3) : '<p class="hint">Turn on a project first.</p>'}
        <div class="setup-foot"><div class="row"><a class="btn btn-ghost" href="#/setup?step=3">${ICON.back}Back</a></div><button class="btn btn-quiet" type="button" data-action="setup-finish">${projects.length ? 'Skip, go to my wall' : 'Go to my wall'}</button></div>`;
    }
    main.innerHTML = `<div class="setup">${stepper}<div class="setup-card">${body}</div></div>`;
    if (step === 4) resumeFind();
  }

  // ---------- Find stories (wizard step and dialog) ----------
  function findForm(projects, n) {
    return `<form class="stack" data-form="find">
      ${projects.length > 1 ? `<div class="field"><label for="find-proj">Project</label><select class="select square" id="find-proj" name="project">${projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></div>` : `<input type="hidden" name="project" value="${esc(projects[0].id)}"><p class="hint">Project: <strong>${esc(projects[0].name)}</strong></p>`}
      <input type="hidden" name="max" value="${n}">
      <button class="btn btn-marker btn-lg" type="submit" data-find-btn>${ICON.search}${n === 1 ? "Find stories in your last session (about 1 USD)" : `Find stories in your last ${n} sessions (about ${n} USD)`}</button>
      <p class="hint">About 1 USD per session through your own Claude login, or usage of your plan on Pro and Max.</p>
      <div data-find-progress hidden><div class="progress"><span data-bar></span></div><p class="hint" data-find-msg aria-live="polite"></p></div>
    </form>`;
  }

  let findTimer = null;
  async function runFind(form) {
    const pid = form.elements.project.value;
    const btn = form.querySelector('[data-find-btn]');
    busy(btn, true, 'Reading your sessions…');
    try {
      await api('POST', '/api/find', { project: pid, max: Number(form.elements.max.value) });
      store.set('momentry.find', pid);
      pollFind(form, pid);
    } catch (e) { busy(btn, false); fail(e); }
  }

  function pollFind(form, pid) {
    clearTimeout(findTimer);
    const box = form.querySelector('[data-find-progress]');
    const bar = form.querySelector('[data-bar]');
    const msg = form.querySelector('[data-find-msg]');
    const btn = form.querySelector('[data-find-btn]');
    box.hidden = false;
    const tick = async () => {
      if (!form.isConnected) return;
      let j;
      try { j = await api('GET', `/api/find/${enc(pid)}`); } catch { findTimer = setTimeout(tick, 3000); return; }
      if (j.running) {
        const pct = j.target ? Math.min(95, Math.round((j.sessionsRead / j.target) * 100)) : 0;
        box.querySelector('.progress').classList.toggle('is-busy', !j.sessionsRead);
        bar.style.width = `${pct}%`;
        msg.textContent = j.sessionsRead ? `Read ${j.sessionsRead} of ${j.target} sessions…` : 'Reading the first session. This takes a minute or two.';
        if (!btn.disabled) busy(btn, true, 'Reading your sessions…');
        findTimer = setTimeout(tick, 2000);
        return;
      }
      if (!j.state) { box.hidden = true; return; }
      box.querySelector('.progress').classList.remove('is-busy');
      bar.style.width = '100%';
      msg.textContent = j.message ?? '';
      busy(btn, false);
      store.set('momentry.find', '');
      storiesCache = null;
      if (j.state === 'done') {
        btn.outerHTML = `<a class="btn btn-primary btn-lg" href="#/" data-action="setup-finish-link">Open your wall</a>`;
        toast(j.message ?? 'Done.');
      }
    };
    tick();
  }

  function resumeFind() {
    const pid = store.get('momentry.find');
    const form = $('form[data-form="find"]');
    if (pid && form && form.elements.project.value === pid) pollFind(form, pid);
  }

  // ---------- dialogs ----------
  let genDialog = null;
  function openDialog(html) {
    genDialog?.remove();
    genDialog = document.createElement('dialog');
    genDialog.innerHTML = `<div class="dialog-card"><button class="btn btn-ghost btn-sm x" type="button" data-action="close-dialog" aria-label="Close">${ICON.x}</button>${html}</div>`;
    document.body.append(genDialog);
    genDialog.addEventListener('close', () => { genDialog?.remove(); genDialog = null; });
    genDialog.showModal();
    return genDialog;
  }

  async function openFind() {
    await getOverview();
    const projects = onProjects();
    if (!projects.length) { go('#/setup?step=1'); return; }
    const d = openDialog(`<div><span class="hand">look back</span><h2>Find new stories</h2><p class="hint">Reads sessions that have not been read yet, newest first.</p></div>
      <div class="field"><div class="label" id="find-n-l">How many sessions</div><div class="seg" role="group" aria-labelledby="find-n-l">${[1, 3, 5].map((n) => `<button type="button" data-action="find-n" data-n="${n}" aria-pressed="${n === 3}">${n}</button>`).join('')}</div></div>
      <div data-find-host>${findForm(projects, 3)}</div>`);
    const pid = store.get('momentry.find');
    const form = d.querySelector('form[data-form="find"]');
    if (pid && projects.some((p) => p.id === pid)) { if (form.elements.project.tagName === 'SELECT') form.elements.project.value = pid; pollFind(form, pid); }
  }

  async function openNote() {
    await getOverview();
    const projects = onProjects();
    if (!projects.length) { toast('Turn on a project first.', { action: 'Set up', onAction: () => go('#/setup?step=1') }); return; }
    const dlg = $('#note-dialog');
    const host = $('[data-note-project]', dlg);
    host.innerHTML = projects.length > 1
      ? `<label for="note-p">Project</label><select class="select square" id="note-p" name="project">${projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>`
      : `<input type="hidden" name="project" value="${esc(projects[0].id)}"><p class="hint">Saves to <strong>${esc(projects[0].name)}</strong></p>`;
    const draft = store.get('momentry.note');
    if (draft) { try { const d = JSON.parse(draft); dlg.querySelector('#note-t').value = d.title ?? ''; dlg.querySelector('#note-b').value = d.note ?? ''; } catch { /* old draft */ } }
    $('[data-note-err]', dlg).hidden = true;
    dlg.showModal();
    dlg.querySelector('#note-t').focus();
  }

  // ---------- palette ----------
  const PALETTE = [
    ['Stories', () => go('#/')], ['Unread stories', () => go('#/?view=unread')], ['Picked stories', () => go('#/?view=picked')],
    ['Series', () => go('#/series')], ['Privacy', () => go('#/privacy')], ['Private names', () => go('#/privacy')],
    ['Cost', () => go('#/cost')], ['Health', () => go('#/health')], ['Settings', () => go('#/settings')],
    ['Quick note', () => openNote()], ['Find new stories', () => openFind()], ['Run setup again', () => go('#/setup')],
  ];
  function openPalette() {
    const dlg = $('#palette');
    const input = $('#palette-q');
    const list = $('#palette-list');
    let sel = 0;
    let items = PALETTE;
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      items = PALETTE.filter(([n]) => n.toLowerCase().includes(q));
      sel = Math.min(sel, Math.max(0, items.length - 1));
      list.innerHTML = items.length ? items.map(([n], i) => `<li><button type="button" role="option" id="pal-${i}" aria-selected="${i === sel}" data-i="${i}">${esc(n)}</button></li>`).join('') : '<li class="none">Nothing matches.</li>';
      input.setAttribute('aria-activedescendant', items.length ? `pal-${sel}` : '');
    };
    const pick = (i) => { const it = items[i]; if (!it) return; dlg.close(); it[1](); };
    input.value = '';
    draw();
    input.oninput = () => { sel = 0; draw(); };
    input.onkeydown = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, items.length); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % Math.max(1, items.length); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
    };
    list.onclick = (e) => { const b = e.target.closest('button[data-i]'); if (b) pick(Number(b.dataset.i)); };
    dlg.showModal();
    input.focus();
  }

  // ---------- events ----------
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    try {
      switch (a) {
        case 'reload': render(); break;
        case 'note': openNote(); break;
        case 'find': openFind(); break;
        case 'palette': openPalette(); break;
        case 'close-dialog': el.closest('dialog')?.close(); break;
        case 'filter': { const q = parseHash().q; if (el.dataset.view === 'all') q.delete('view'); else q.set('view', el.dataset.view); setQuery(q); drawWall(q); break; }
        case 'mark': {
          e.preventDefault();
          const card = el.closest('[data-key]');
          el.disabled = true;
          await mark(card.dataset.key, el.dataset.mark);
          drawWall();
          getOverview(true).catch(() => {});
          break;
        }
        case 'angle-check': {
          el.disabled = true;
          const [pid, id] = current.key.split('/');
          const field = el.dataset.field;
          const value = current[field] === el.dataset.value ? null : el.dataset.value;
          current = { ...current, ...(await api('PUT', `/api/stories/${enc(pid)}/${enc(id)}/angle-check`, { [field]: value })) };
          drawStory();
          break;
        }
        case 'mark-one': { el.disabled = true; current = { ...current, ...(await mark(current.key, el.dataset.mark)) }; drawStory(); break; }
        case 'edit': startEdit(el.dataset.field); break;
        case 'edit-cancel': drawStory(); break;
        case 'edit-save': await saveEdit(el); break;
        case 'copy-story':
          await navigator.clipboard.writeText(storyText(current));
          toast('Copied. Paste it wherever you write.');
          break;
        case 'show-source': await showSource(el); break;
        case 'write-angle': {
          busy(el, true, 'Writing…');
          const [pid, id] = current.key.split('/');
          const r = await api('POST', `/api/stories/${enc(pid)}/${enc(id)}/angle`);
          current = { ...current, ...r };
          drawStory();
          toast(r.message, { error: !r.wrote });
          storiesCache = null;
          break;
        }
        case 'remove-name': {
          const v = await api('DELETE', '/api/privacy/names', { name: el.dataset.name });
          if (parseHash().path === '/setup') render(); else drawPrivacy(v);
          toast(`Removed ${el.dataset.name}.`);
          break;
        }
        case 'release': {
          busy(el, true, 'Checking…');
          const r = await api('POST', '/api/privacy/release', { project: el.dataset.project, id: el.dataset.id });
          drawPrivacy(r.view);
          toast(r.message, { error: !r.released });
          storiesCache = null;
          break;
        }
        case 'fix-all': {
          busy(el, true, 'Fixing…');
          const h = await api('POST', '/api/health/fix', { project: parseHash().q.get('project') || $('#health-proj')?.value || undefined });
          drawHealth(h);
          toast(h.fixed ? `Fixed ${plural(h.fixed, 'thing', 'things')}.` : 'Nothing could be fixed automatically. See the lines below.', { error: !h.fixed });
          break;
        }
        case 'connect': {
          busy(el, true, 'Connecting…');
          const r = await api('POST', '/api/agents/connect', { names: [el.dataset.name] });
          if (r.failed.length) toast(`${r.failed[0].name}: ${r.failed[0].why}`, { error: true });
          else toast('Connected. Start a new session in that agent to use it.');
          render();
          break;
        }
        case 'setting-pick': { await saveSetting(el, el.dataset.value); break; }
        case 'setting-reset': { await saveSetting(el, null); break; }
        case 'export': {
          busy(el, true, 'Preparing…');
          const res = await fetch(`/api/projects/${enc(el.dataset.project)}/export`, { headers: { 'x-momentry-token': token ?? '' } });
          if (!res.ok) throw new ApiError((await res.json().catch(() => null))?.error ?? 'Export failed.', res.status);
          const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'stories.md';
          const href = URL.createObjectURL(await res.blob());
          const a2 = document.createElement('a');
          a2.href = href; a2.download = name; document.body.append(a2); a2.click(); a2.remove();
          setTimeout(() => URL.revokeObjectURL(href), 5000);
          busy(el, false);
          toast(`Saved ${name} to your downloads.`);
          break;
        }
        case 'check-update': {
          busy(el, true, 'Checking…');
          const r = await api('GET', '/api/update');
          busy(el, false);
          $('[data-update-msg]').textContent = r.message ?? (r.newer ? `${r.latest} is out. Update with: momentry update --yes` : `You have the latest version (${r.current}).`);
          break;
        }
        case 'find-n': {
          const n = Number(el.dataset.n);
          for (const b of $$('[data-action="find-n"]')) b.setAttribute('aria-pressed', String(b === el));
          const host = el.closest('dialog').querySelector('[data-find-host]');
          const pid = host.querySelector('[name="project"]').value;
          host.innerHTML = findForm(onProjects(), n);
          const sel = host.querySelector('select[name="project"]');
          if (sel) sel.value = pid;
          break;
        }
        case 'setup-skip': case 'setup-finish': case 'setup-finish-link': {
          if (a !== 'setup-finish-link') e.preventDefault();
          await api('POST', '/api/setup/done');
          store.set('momentry.setup-seen', '1');
          overview = null;
          if (a !== 'setup-finish-link') go('#/');
          break;
        }
        case 'setup-agents': {
          const names = $$('input[name="agent"]:checked:not(:disabled)').map((i) => i.value);
          busy(el, true, 'Connecting…');
          if (names.length) {
            const r = await api('POST', '/api/agents/connect', { names });
            if (r.failed.length) { busy(el, false); toast(r.failed.map((f) => `${f.name}: ${f.why}`).join(' '), { error: true, ms: 9000 }); return; }
          }
          go('#/setup?step=1');
          break;
        }
        case 'setup-projects': {
          const roots = $$('input[name="project"]:checked:not(:disabled)').map((i) => i.value);
          const keepOut = $('input[name="keep-out"]')?.checked;
          busy(el, true, 'Turning on…');
          for (const root of roots) await api('POST', '/api/projects/on', { root, keepOutOfGit: keepOut });
          overview = null;
          go('#/setup?step=2');
          break;
        }
        case 'project-budget-reset': {
          drawSettings(await api('PUT', '/api/projects/budget', { project: el.dataset.project, usd: null }));
          toast('This project now uses the general budget.');
          break;
        }
        case 'setup-names': go('#/setup?step=3'); break;
        case 'setup-budget': go('#/setup?step=4'); break;
        case 'budget-pick': {
          const n = Number(el.dataset.value);
          await api('PUT', '/api/settings', { key: 'budget.dailyUsd', value: n, scope: 'user' });
          for (const b of $$('[data-action="budget-pick"]')) b.setAttribute('aria-pressed', String(b === el));
          $('[data-budget-msg]').textContent = `${n ? `Now: up to ${usd(n)} a day.` : 'Now: no daily limit.'} On a Pro or Max plan this counts against your plan's usage instead.`;
          break;
        }
        default: break;
      }
    } catch (err) {
      if (el.disabled && el.dataset.label) busy(el, false);
      el.disabled = false;
      fail(err);
    }
  });

  document.addEventListener('change', async (e) => {
    const el = e.target;
    const a = el.dataset?.action;
    try {
      if (a === 'project-filter') { const q = parseHash().q; if (el.value) q.set('project', el.value); else q.delete('project'); setQuery(q); drawWall(q); }
      else if (a === 'show-dropped') { const q = parseHash().q; if (el.checked) q.set('dropped', '1'); else q.delete('dropped'); setQuery(q); drawWall(q); }
      else if (a === 'stage') { current = { ...current, ...(await mark(current.key, el.value)) }; drawStory(); }
      else if (a === 'health-project') { go(`#/health?project=${encodeURIComponent(el.value)}`); }
      else if (a === 'setting') {
        let v;
        if (el.type === 'checkbox') v = el.checked;
        else if (el.type === 'number') { v = el.value === '' ? null : Number(el.value); if (v !== null && (el.dataset.type === 'int' ? !Number.isInteger(v) : !Number.isFinite(v))) { const err = el.closest('.set-row').querySelector('.err-text'); err.hidden = false; err.textContent = el.dataset.type === 'int' ? 'Use a whole number.' : 'Use a number.'; return; } }
        else v = el.value.trim() === '' ? null : el.value.trim();
        await saveSetting(el, v);
      } else if (a === 'private-mode') {
        const v = await api('PUT', '/api/projects/private', { project: el.dataset.project, on: el.checked });
        drawSettings(v);
        document.getElementById(el.id)?.focus();
        toast(el.checked ? 'Private mode on for this project.' : 'Private mode off.');
      } else if (a === 'gather') {
        const v = await api('PUT', '/api/projects/gather', { project: el.dataset.project, on: el.checked });
        drawSettings(v);
        document.getElementById(el.id)?.focus();
        overview = null;
        toast(el.checked ? 'Gathering stories again for this project.' : 'Paused. No new stories from this project until you turn it back on.');
      } else if (a === 'project-budget') {
        const row = el.closest('.set-row');
        const usd = el.value === '' ? null : Number(el.value);
        if (usd !== null && (!Number.isFinite(usd) || usd < 0)) { const err = row.querySelector('.err-text'); err.hidden = false; err.textContent = 'Use a number of at least 0.'; return; }
        drawSettings(await api('PUT', '/api/projects/budget', { project: el.dataset.project, usd }));
        const ok = document.getElementById(el.id)?.closest('.set-row')?.querySelector('[data-saved]');
        if (ok) { ok.hidden = false; setTimeout(() => { ok.hidden = true; }, 2200); }
      } else if (a === 'gitignore') {
        const v = await api('POST', '/api/projects/gitignore', { project: el.dataset.project, on: el.checked });
        drawSettings(v);
        toast(el.checked ? 'Stories will stay out of git.' : 'Stories can be committed again.');
      }
    } catch (err) { fail(err); }
  });

  document.addEventListener('submit', async (e) => {
    const form = e.target;
    const kind = form.dataset.form;
    if (!kind) return;
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    try {
      if (kind === 'names') {
        const names = form.elements.names.value.split(',').map((s) => s.trim()).filter(Boolean);
        if (!names.length) { form.elements.names.focus(); return; }
        busy(btn, true, 'Adding…');
        await api('POST', '/api/privacy/names', { names });
        toast(`Added ${plural(names.length, 'name', 'names')}.`);
        if (parseHash().path === '/setup') { await render(); $('#name-in')?.focus(); } else { drawPrivacy(await api('GET', '/api/privacy')); $('#name-in')?.focus(); }
      } else if (kind === 'note') {
        const err = $('[data-note-err]');
        busy(btn, true, 'Saving…');
        const r = await api('POST', '/api/notes', { project: form.elements.project.value, title: form.elements.title.value, note: form.elements.note.value });
        busy(btn, false);
        store.set('momentry.note', '');
        form.reset();
        $('#note-dialog').close();
        storiesCache = null;
        if (r.saved) toast(r.message, { action: 'Open', onAction: () => go(`#/story/${r.key}`) });
        else toast(r.message, { error: true, action: 'Privacy', onAction: () => go('#/privacy'), ms: 10000 });
        if (parseHash().path === '/') render();
        err.hidden = true;
      } else if (kind === 'find') {
        await runFind(form);
      } else if (kind === 'add-project') {
        const root = form.elements.root.value.trim();
        if (!root) { form.elements.root.focus(); return; }
        busy(btn, true, 'Adding…');
        await api('POST', '/api/projects/on', { root, keepOutOfGit: $('input[name="keep-out"]')?.checked });
        toast('Project turned on.');
        overview = null;
        render();
      } else if (kind === 'delete') {
        if (form.elements.confirm.value.trim() !== form.dataset.name) { toast(`Type ${form.dataset.name} exactly to confirm.`, { error: true }); form.elements.confirm.focus(); return; }
        busy(btn, true, 'Deleting…');
        await api('POST', '/api/projects/delete', { project: form.dataset.project, confirm: form.elements.confirm.value });
        toast(`Deleted momentry data of ${form.dataset.name}.`);
        overview = null; storiesCache = null;
        drawSettings(await api('GET', '/api/settings'));
      }
    } catch (err) {
      busy(btn, false);
      if (kind === 'note') { const el = $('[data-note-err]'); el.hidden = false; el.textContent = err.message; } else fail(err);
    }
  });

  // keep an unsent note across reloads
  document.addEventListener('input', (e) => {
    const f = e.target.form;
    if (f?.dataset.form === 'note') store.set('momentry.note', JSON.stringify({ title: f.elements.title.value, note: f.elements.note.value }));
  });

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '') || document.activeElement?.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && document.activeElement?.form?.dataset.form === 'note') { e.preventDefault(); document.activeElement.form.requestSubmit(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (e.key === 'n') { e.preventDefault(); openNote(); }
  });

  // health dot in the nav, checked once in the background
  async function healthDot() {
    try { const h = await api('GET', '/api/health'); $('[data-health-dot]').hidden = h.checks.every((c) => ['ok', 'skip', 'info'].includes(c.status)); } catch { /* shown on the page itself */ }
  }

  render().then(() => { if (token) setTimeout(healthDot, 800); });
})();
