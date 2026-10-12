/* Vdvoem — Telegram Mini App calendar for two. Vanilla JS, no build step. */
(function () {
  'use strict';

  // ---------- Environment ----------
  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  const IN_TG = !!(tg && tg.initData);
  const PARAMS = new URLSearchParams(location.search);
  const MOCK = PARAMS.get('mock') === '1';
  const VERSION = '0.1.0';
  const APP_NAME_DEFAULT = 'Вдвоём';
  const HOUR_PX = 48;
  const QUICK_TITLES = ['Английский', 'Муай-тай', 'Психолог', 'Вокал', 'Зал', 'Работа', 'Созвон'];
  const BEST_TIME = { morning: 'утро', day: 'день', sunset: 'закат', evening: 'вечер', night: 'ночь', any: 'когда угодно' };
  const GEN = { yana: 'Яны', vova: 'Вовы' };
  const ACC = { yana: 'Яну', vova: 'Вову' };

  // ---------- Utilities ----------
  const pad = (n) => String(n).padStart(2, '0');
  const fmtMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const parseHHMM = (s) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(s || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const fmtDur = (min) => { const h = Math.floor(min / 60), m = min % 60; return h && m ? `${h} ч ${m} мин` : h ? `${h} ч` : `${m} мин`; };
  const weekdayOf = (d) => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7;
  const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const mondayOf = (d) => addDays(d, -weekdayOf(d));
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const WD_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const fmtDateRu = (d, withWd = true) => { const [, m, dd] = d.split('-').map(Number); const base = `${dd} ${MONTHS[m - 1]}`; return withWd ? `${WD[weekdayOf(d)]}, ${base}` : base; };
  const plural = (n, f) => { const a = Math.abs(n) % 100, b = a % 10; return f[(a > 10 && a < 20) ? 2 : (b > 1 && b < 5) ? 1 : b === 1 ? 0 : 2]; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round15 = (m) => Math.round(m / 15) * 15;

  function tzParts(tz) {
    try {
      const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
      const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
      return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
    } catch (e) {
      const d = new Date();
      return { date: d.toISOString().slice(0, 10), minutes: d.getHours() * 60 + d.getMinutes() };
    }
  }

  const ICON = {
    heart: (cls) => `<svg class="${cls || ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.4-9.5A5.3 5.3 0 0 1 12 6.6a5.3 5.3 0 0 1 9.4 4.9C19.5 16.4 12 21 12 21z" fill="currentColor"/></svg>`,
    heartO: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-7-4.3-8.8-8.9A4.9 4.9 0 0 1 12 7.2a4.9 4.9 0 0 1 8.8 4.2C19 16 12 20.3 12 20.3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
    cal: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    calWeek: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7 14h3M14 14h3M7 17.5h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    bulb: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6.5 6.5 0 0 1 4 11.6c-.6.5-1 1.1-1 1.9H9c0-.8-.4-1.4-1-1.9A6.5 6.5 0 0 1 12 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    more: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="16" cy="12" r="1.3" fill="currentColor"/></svg>`,
    left: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    right: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
    spark: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" fill="currentColor"/></svg>`,
  };

  // ---------- State ----------
  const S = {
    me: null, locked: false, loadError: null,
    tab: 'week', view: null,          // view: null | 'invite' | 'success'
    today: null, weekStart: null, selectedDate: null,
    weeks: {},                        // weekStart -> week payload
    weekLoading: false,
    dates: null, datesSeg: 'pending',
    ideas: null, ideaCat: 'all',
    sheet: null,                      // {kind, ...}
    form: null, invite: null, counter: null,
    primary: null,
    petInput: '',
  };

  // ---------- Telegram glue ----------
  function haptic(style) { try { tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred(style || 'light'); } catch (e) { /* noop */ } }
  function hapticNotify(type) { try { tg && tg.HapticFeedback && tg.HapticFeedback.notificationOccurred(type || 'success'); } catch (e) { /* noop */ } }
  function hapticSelect() { try { tg && tg.HapticFeedback && tg.HapticFeedback.selectionChanged(); } catch (e) { /* noop */ } }

  function confirmDialog(message) {
    return new Promise((resolve) => {
      if (tg && typeof tg.showConfirm === 'function' && IN_TG) {
        try { tg.showConfirm(message, (ok) => resolve(!!ok)); return; } catch (e) { /* fall through */ }
      }
      resolve(window.confirm(message));
    });
  }

  function openExternal(url) {
    if (tg && typeof tg.openLink === 'function' && IN_TG) { try { tg.openLink(url); return; } catch (e) { /* fall through */ } }
    window.open(url, '_blank', 'noopener');
  }

  function setPrimary(label, fn, disabled) { S.primary = fn ? { label, fn, disabled: !!disabled } : null; }

  function syncButtons() {
    if (!IN_TG) return;
    try {
      const mb = tg.MainButton;
      if (S.primary && !S.locked) {
        mb.setParams({ text: S.primary.label, is_visible: true, is_active: !S.primary.disabled });
      } else {
        mb.hide();
      }
      const needBack = !!(S.sheet || S.view);
      if (needBack) tg.BackButton.show(); else tg.BackButton.hide();
    } catch (e) { /* noop */ }
  }

  function goBack() {
    if (S.sheet) { closeSheet(); return; }
    if (S.view === 'invite') {
      if (S.invite && S.invite.step > (S.invite.minStep || 1)) { S.invite.step -= 1; render(); return; }
      S.view = null; S.invite = null; render(); return;
    }
    if (S.view) { S.view = null; render(); }
  }

  // ---------- API ----------
  async function api(path, opts = {}) {
    if (MOCK) return mockApi(path, opts);
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': tg ? (tg.initData || '') : '' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401 || res.status === 403) { S.locked = true; render(); throw Object.assign(new Error('locked'), { status: res.status, silent: true }); }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) throw Object.assign(new Error((data && (data.message || data.error)) || `Ошибка ${res.status}`), { status: res.status });
    return data || {};
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(msg, kind) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show' + (kind === 'err' ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 2400);
  }
  function fail(e) { if (e && e.silent) return; console.error(e); hapticNotify('error'); toast(e && e.message ? e.message : 'Что-то пошло не так', 'err'); }

  // ---------- Data loading ----------
  async function loadMe() {
    const me = await api('/api/me');
    S.me = me;
    S.today = me.today || tzParts(me.tz).date;
    if (!S.selectedDate) S.selectedDate = S.today;
    S.weekStart = mondayOf(S.selectedDate);
    document.title = me.appName || APP_NAME_DEFAULT;
  }
  async function loadWeek(start, force) {
    if (!force && S.weeks[start]) return S.weeks[start];
    S.weekLoading = true;
    try {
      const w = await api(`/api/week?start=${start}`);
      S.weeks[start] = w;
      return w;
    } finally { S.weekLoading = false; }
  }
  async function refreshWeeks() {
    const keys = Object.keys(S.weeks);
    S.weeks = {};
    await Promise.all(keys.map((k) => loadWeek(k, true).catch(() => null)));
  }
  async function loadDates(force) {
    if (S.dates && !force) return S.dates;
    const r = await api('/api/dates');
    S.dates = r.dates || [];
    return S.dates;
  }
  async function loadIdeas() {
    if (S.ideas) return S.ideas;
    const r = await api('/api/ideas');
    S.ideas = { categories: r.categories || [], ideas: r.ideas || [] };
    return S.ideas;
  }

  // ---------- Derived helpers ----------
  const now = () => tzParts(S.me && S.me.tz);
  const awake = () => (S.me && S.me.awake) || { start: 480, end: 1380 };
  const appName = () => (S.me && S.me.appName) || APP_NAME_DEFAULT;
  const user = (key) => (S.me && S.me.me && S.me.me.key === key) ? S.me.me : (S.me && S.me.partner && S.me.partner.key === key) ? S.me.partner : { key, name: key === 'yana' ? 'Яна' : 'Вова', color: key === 'yana' ? '#E8557A' : '#3E8EF7' };
  const myKey = () => (S.me && S.me.me && S.me.me.key) || 'yana';
  const partnerKey = () => (S.me && S.me.partner && S.me.partner.key) || (myKey() === 'yana' ? 'vova' : 'yana');
  const callPartner = () => (S.me && S.me.callPartner) || user(partnerKey()).name;
  const gen = (key) => GEN[key] || user(key).name;

  function dayOf(date) {
    const w = S.weeks[mondayOf(date)];
    return w && w.days ? w.days.find((d) => d.date === date) : null;
  }
  function pendingToMe() { return (S.dates || []).filter((d) => d.status === 'pending' && d.toKey === myKey() && !isPastDate(d)); }
  function isPastDate(d) { const n = now(); return d.date < S.today || (d.date === S.today && d.end <= n.minutes); }
  function eveningTogether(day) {
    return (day.commonFree || []).some((w) => Math.min(w.end, 1380) - Math.max(w.start, 1080) >= 90);
  }
  function busyMinutes(day, key) { return ((day.busy && day.busy[key]) || []).reduce((s, b) => s + Math.max(0, b.end - b.start), 0); }

  // Upcoming common-free windows for the next 7 days (built from week payloads).
  async function upcomingWindows() {
    const n = now();
    const starts = [mondayOf(S.today), mondayOf(addDays(S.today, 7))];
    await Promise.all(starts.map((s) => loadWeek(s).catch(() => null)));
    const out = [];
    for (let i = 0; i <= 7; i++) {
      const date = addDays(S.today, i);
      const day = dayOf(date);
      if (!day) continue;
      (day.commonFree || []).forEach((w) => {
        let start = w.start;
        if (date === S.today) start = Math.max(start, round15(n.minutes + 15));
        if (w.end - start >= 60) out.push({ date, start, end: w.end });
      });
    }
    return out;
  }

  // ---------- Rendering ----------
  function render() {
    const app = document.getElementById('app');
    const header = document.getElementById('header');
    const view = document.getElementById('view');
    const tabs = document.getElementById('tabs');
    const fab = document.getElementById('fab');
    S.primary = null;

    if (S.locked) {
      header.innerHTML = '';
      view.innerHTML = `<div class="lock"><div class="big">💔</div><h1>Этот уголок только для двоих</h1><p>Похоже, ты не Яна и не Вова. Если это ошибка — открой приложение из чата с ботом.</p></div>`;
      tabs.innerHTML = ''; fab.hidden = true;
      closeSheetDom(); syncButtons(); return;
    }
    if (!S.me) {
      header.innerHTML = '';
      view.innerHTML = S.loadError
        ? `<div class="lock"><div class="big">🌧️</div><h1>Не достучались до сервера</h1><p>${esc(S.loadError)}</p><button class="btn btn-primary" style="margin-top:18px;width:auto" data-action="reload">Попробовать ещё раз</button></div>`
        : `<div class="loading"><div class="spinner"></div>Загружаем ваш календарь…</div>`;
      tabs.innerHTML = ''; fab.hidden = true; return;
    }

    if (S.view === 'invite') {
      header.innerHTML = '';
      view.className = 'view flow';
      view.innerHTML = renderInvite();
      tabs.innerHTML = ''; fab.hidden = true;
    } else if (S.view === 'success') {
      header.innerHTML = '';
      view.className = 'view flow';
      view.innerHTML = renderSuccess();
      tabs.innerHTML = ''; fab.hidden = true;
    } else {
      view.className = 'view';
      header.innerHTML = renderHeader();
      view.innerHTML = S.tab === 'week' ? renderWeek() : S.tab === 'dates' ? renderDates() : S.tab === 'ideas' ? renderIdeas() : renderMore();
      tabs.innerHTML = renderTabs();
      fab.hidden = !(S.tab === 'week' || S.tab === 'dates');
    }
    renderSheet();
    syncButtons();
  }

  function renderHeader() {
    const me = S.me;
    const demo = MOCK ? `<span class="demo-chip">demo</span>` : '';
    if (S.tab !== 'week') {
      const titles = { dates: 'Свидания', ideas: 'Идеи для Пхукета', more: 'Ещё' };
      return `<div class="wrap"><div class="h-top"><div class="h-simple">${titles[S.tab]}</div>${demo}</div></div>`;
    }
    const d = S.today;
    const greet = `${cap(WD_FULL[weekdayOf(d)])}, ${fmtDateRu(d, false)} · ты и <b>${esc(callPartner())}</b>`;
    const cds = (me.countdowns || []).map((c) => `<span class="cd-chip"><span>${esc(c.emoji || '📅')}</span><b>${esc(c.label)}</b><span class="n">${c.daysLeft === 0 ? 'сегодня!' : `через ${c.daysLeft} ${plural(c.daysLeft, ['день', 'дня', 'дней'])}`}</span></span>`).join('');
    return `<div class="wrap">
      <div class="h-top">
        <div>
          <div class="h-title"><span class="h-logo">${ICON.heart()}</span>${esc(appName())}${demo}</div>
          <div class="h-greet">${greet}</div>
        </div>
        <span class="avatar ${esc(me.me.key)}" title="${esc(me.me.name)}">${esc(me.me.name[0])}</span>
      </div>
      ${cds ? `<div class="countdowns">${cds}</div>` : '<div style="height:10px"></div>'}
    </div>`;
  }

  function renderTabs() {
    const pend = pendingToMe().length;
    const items = [
      ['week', 'Неделя', ICON.calWeek], ['dates', 'Свидания', ICON.heartO, pend], ['ideas', 'Идеи', ICON.bulb], ['more', 'Ещё', ICON.more],
    ];
    return `<div class="inner">${items.map(([k, l, ic, b]) => `<button class="tab ${S.tab === k ? 'active' : ''}" data-action="tab" data-tab="${k}" aria-label="${l}">${ic}<span>${l}</span>${b ? `<span class="badge">${b}</span>` : ''}</button>`).join('')}</div>`;
  }

  // ----- Week screen -----
  function renderWeek() {
    const w = S.weeks[S.weekStart];
    const days = [];
    for (let i = 0; i < 7; i++) days.push(addDays(S.weekStart, i));
    const wkEnd = addDays(S.weekStart, 6);
    const [, m1] = S.weekStart.split('-').map(Number); const [, m2] = wkEnd.split('-').map(Number);
    const wkTitle = m1 === m2 ? `${+S.weekStart.slice(8)}–${+wkEnd.slice(8)} <span>${MONTHS[m1 - 1]}</span>` : `${+S.weekStart.slice(8)} ${MONTHS[m1 - 1]} – ${+wkEnd.slice(8)} ${MONTHS[m2 - 1]}`;
    const isCur = S.weekStart === mondayOf(S.today);
    const strip = `<div class="wrap weekstrip" id="weekstrip">
      <div class="weeknav">
        <button class="iconbtn" data-action="week-prev" aria-label="Предыдущая неделя">${ICON.left}</button>
        <div class="wk-title">${wkTitle}${isCur ? '' : ` <button class="btn-text" style="padding:0 6px;min-height:0;font-size:13px" data-action="week-today">сегодня</button>`}</div>
        <button class="iconbtn" data-action="week-next" aria-label="Следующая неделя">${ICON.right}</button>
      </div>
      <div class="days">${days.map((d, i) => {
        const day = w ? w.days[i] : null;
        const marks = day ? `${(day.busy && day.busy.yana && day.busy.yana.length) ? '<i class="yana"></i>' : ''}${(day.busy && day.busy.vova && day.busy.vova.length) ? '<i class="vova"></i>' : ''}${(day.dates || []).some((x) => x.status === 'accepted') ? ICON.heart() : ''}` : '';
        return `<button class="day ${d === S.today ? 'today' : ''} ${d === S.selectedDate ? 'sel' : ''} ${d < S.today ? 'past' : ''}" data-action="select-day" data-date="${d}"><span class="wd">${WD[i]}</span><span class="num">${+d.slice(8)}</span><span class="marks">${marks}</span></button>`;
      }).join('')}</div>
    </div>`;

    let body;
    if (!w) {
      body = `<div class="wrap"><div class="skeleton" style="margin-top:12px"></div></div>`;
    } else {
      const day = w.days.find((d) => d.date === S.selectedDate) || w.days[0];
      body = `<div class="wrap">${renderTimeline(day)}${renderOverview(w)}</div>`;
    }
    return strip + body;
  }

  function layoutColumns(blocks) {
    const sorted = blocks.slice().sort((a, b) => a.start - b.start || b.end - a.end);
    let cluster = [], clusterEnd = -1;
    const flush = () => {
      const cols = [];
      cluster.forEach((b) => {
        let i = cols.findIndex((end) => end <= b.start);
        if (i < 0) { i = cols.length; cols.push(0); }
        cols[i] = b.end; b._col = i;
      });
      cluster.forEach((b) => { b._n = cols.length; });
      cluster = [];
    };
    sorted.forEach((b) => {
      if (cluster.length && b.start >= clusterEnd) flush();
      cluster.push(b); clusterEnd = Math.max(clusterEnd, b.end);
    });
    if (cluster.length) flush();
    return sorted;
  }

  function renderTimeline(day) {
    const aw = awake();
    const total = (aw.end - aw.start) / 60 * HOUR_PX;
    const y = (m) => (clamp(m, aw.start, aw.end) - aw.start) / 60 * HOUR_PX;
    let hours = '', lines = '';
    for (let m = aw.start; m <= aw.end; m += 60) {
      hours += `<div class="tl-hour" style="top:${y(m)}px">${fmtMin(m)}</div>`;
      lines += `<div class="tl-line" style="top:${y(m)}px"></div>`;
      if (m + 30 < aw.end) lines += `<div class="tl-line half" style="top:${y(m + 30)}px"></div>`;
    }
    const n = now();
    const nowline = (day.date === S.today && n.minutes >= aw.start && n.minutes <= aw.end) ? `<div class="nowline" style="top:${y(n.minutes)}px"></div>` : '';

    const dayDates = (day.dates || []).filter((d) => d.status === 'accepted' || d.status === 'pending');
    const free = (day.commonFree || []).map((f) => {
      const h = y(f.end) - y(f.start);
      if (h < 14) return '';
      const avail = day.date < S.today || (day.date === S.today && f.end <= n.minutes);
      // A date card sitting over the middle of the band would hide the label; pin it to the top then.
      const mid = (f.start + f.end) / 2;
      const covered = dayDates.some((d) => d.start - 20 < mid && d.end + 20 > mid);
      return `<button class="free ${h < 34 ? 'tiny' : ''} ${covered ? 'top' : ''}" style="top:${y(f.start)}px;height:${h}px" data-action="free" data-date="${day.date}" data-start="${f.start}" data-end="${f.end}" ${avail ? 'disabled' : ''} aria-label="Свободны вместе ${fmtDur(f.end - f.start)}"><span class="fl">${ICON.heart()}<span>вместе ${fmtDur(f.end - f.start)}</span></span></button>`;
    }).join('');

    const laneHtml = (key) => {
      const blocks = layoutColumns(((day.busy && day.busy[key]) || []).filter((b) => b.source !== 'date' && b.end > aw.start && b.start < aw.end));
      return `<div class="lane ${key}">${blocks.map((b) => {
        const top = y(b.start), h = Math.max(16, y(b.end) - top);
        const n_ = b._n || 1, col = b._col || 0;
        const width = `calc((100% - 6px) / ${n_} - ${n_ > 1 ? 2 : 0}px)`;
        const left = `calc(3px + (100% - 6px) / ${n_} * ${col})`;
        const g = b.source === 'google';
        const cls = `blk ${key} ${g ? 'google' : ''} ${b.editable ? 'editable' : ''} ${h < 34 ? 'short' : ''}`;
        return `<button class="${cls}" style="top:${top}px;height:${h}px;left:${left};right:auto;width:${width}" data-action="block" data-id="${esc(b.id)}" data-date="${day.date}" title="${esc(b.title)}"><div class="t">${g ? ICON.cal : ''}<span>${esc(b.title || 'Занято')}</span></div><div class="tm">${fmtMin(b.start)}–${fmtMin(b.end)}</div></button>`;
      }).join('')}</div>`;
    };

    const spans = (day.dates || []).filter((d) => (d.status === 'accepted' || d.status === 'pending') && d.end > aw.start && d.start < aw.end).map((d) => {
      const top = y(d.start), h = Math.max(30, y(d.end) - top);
      const pend = d.status === 'pending';
      return `<button class="dspan ${pend ? 'pending' : ''}" style="top:${top}px;height:${h}px" data-action="date-open" data-id="${d.id}"><div class="t">${ICON.heart()}<span>${esc(d.emoji || '')} ${esc(d.title)}</span></div><div class="tm">${fmtMin(d.start)}–${fmtMin(d.end)}${pend ? ` · ${d.fromKey === myKey() ? 'ждём ответа' : 'ждёт твоего ответа'}` : ' · свидание'}</div></button>`;
    }).join('');

    const sub = day.date === S.today ? 'сегодня' : day.date === addDays(S.today, 1) ? 'завтра' : day.date === addDays(S.today, -1) ? 'вчера' : '';
    const freeTotal = (day.commonFree || []).reduce((s, f) => s + (f.end - f.start), 0);
    return `<section class="card tl-card">
      <div class="tl-date"><span>${cap(WD_FULL[day.weekday != null ? day.weekday : weekdayOf(day.date)])}, ${fmtDateRu(day.date, false)}</span><span class="sub">${sub ? sub + ' · ' : ''}${freeTotal ? `вместе ${fmtDur(freeTotal)}` : 'свободных окон нет'}</span></div>
      <div class="lane-head"><div></div><div class="lh yana"><i class="dot"></i>${esc(user('yana').name)}</div><div class="lh vova"><i class="dot"></i>${esc(user('vova').name)}</div></div>
      <div class="timeline" style="height:${total}px">
        <div class="tl-hours">${hours}</div>${lines}
        <div class="lanes" style="height:${total}px">${free}${laneHtml('yana')}${laneHtml('vova')}${spans}</div>
        ${nowline}
      </div>
    </section>`;
  }

  function renderOverview(w) {
    const maxMin = 8 * 60;
    const cols = w.days.map((day) => {
      const by = busyMinutes(day, 'yana'), bv = busyMinutes(day, 'vova');
      const hy = Math.round(clamp(by / maxMin, 0, 1) * 100), hv = Math.round(clamp(bv / maxMin, 0, 1) * 100);
      const ev = eveningTogether(day);
      return `<button class="ov-col ${day.date === S.selectedDate ? 'sel' : ''} ${day.date === S.today ? 'today' : ''}" data-action="select-day" data-date="${day.date}" aria-label="${fmtDateRu(day.date)}">
        <div class="ov-bars"><i class="yana ${by ? '' : 'zero'}" style="height:${Math.max(8, hy)}%"></i><i class="vova ${bv ? '' : 'zero'}" style="height:${Math.max(8, hv)}%"></i></div>
        <span class="ov-heart ${ev ? 'on' : ''}">${ICON.heart()}</span>
        <span class="ov-wd">${WD[day.weekday != null ? day.weekday : weekdayOf(day.date)]}</span>
      </button>`;
    }).join('');
    const nights = w.days.filter(eveningTogether).length;
    return `<section class="card pad">
      <div class="card-title"><span>Неделя вдвоём</span><span class="hint">${nights ? `${nights} ${plural(nights, ['свободный вечер', 'свободных вечера', 'свободных вечеров'])}` : 'вечера заняты'}</span></div>
      <div class="ov-grid">${cols}</div>
      <div class="ov-legend"><span><i style="background:var(--yana)"></i>${esc(user('yana').name)}</span><span><i style="background:var(--vova)"></i>${esc(user('vova').name)}</span><span>${ICON.heart()}вечер свободен у обоих</span></div>
    </section>`;
  }

  // ----- Dates screen -----
  function renderDates() {
    if (!S.dates) { loadDates().then(render).catch(fail); return `<div class="loading"><div class="spinner"></div></div>`; }
    const all = S.dates;
    const groups = {
      pending: all.filter((d) => d.status === 'pending' && !isPastDate(d)),
      accepted: all.filter((d) => d.status === 'accepted' && !isPastDate(d)).sort((a, b) => (a.date + pad(a.start / 60)).localeCompare(b.date + pad(b.start / 60))),
      past: all.filter((d) => isPastDate(d) || d.status === 'declined' || d.status === 'cancelled'),
    };
    const seg = `<div class="seg">${[['pending', 'Ожидают', groups.pending.filter((d) => d.toKey === myKey()).length], ['accepted', 'Запланированы'], ['past', 'Прошедшие']].map(([k, l, c]) => `<button class="${S.datesSeg === k ? 'on' : ''}" data-action="dates-seg" data-seg="${k}">${l}${c ? `<span class="cnt">${c}</span>` : ''}</button>`).join('')}</div>`;
    const list = groups[S.datesSeg] || [];
    const empties = {
      pending: ['💌', 'Приглашений пока нет', `Нажми «+» и позови ${ACC[partnerKey()] || callPartner()} куда-нибудь.`],
      accepted: ['🗓️', 'Пока ничего не запланировано', 'Свободные окна подсвечены в календаре — нажми на любое.'],
      past: ['🌙', 'Здесь появятся прошедшие свидания', 'Хорошие воспоминания копятся сами.'],
    };
    const e = empties[S.datesSeg];
    const body = list.length ? list.map((d) => renderDateCard(d)).join('') : `<div class="empty"><div class="big">${e[0]}</div><div style="font-weight:600;color:var(--text)">${e[1]}</div><div style="margin-top:4px;font-size:14px">${e[2]}</div>${S.datesSeg !== 'past' ? `<button class="btn btn-love" data-action="invite-new">Позвать на свидание</button>` : ''}</div>`;
    return `<div class="wrap" style="padding-top:12px">${seg}${body}</div>`;
  }

  function renderDateCard(d, compact) {
    const mine = d.fromKey === myKey();
    const past = isPastDate(d);
    const from = user(d.fromKey);
    const days = daysBetween(S.today, d.date);
    const soon = !past && d.status === 'accepted' ? (days === 0 ? 'сегодня' : days === 1 ? 'завтра' : `через ${days} ${plural(days, ['день', 'дня', 'дней'])}`) : '';
    let status = '';
    if (d.status === 'accepted') status = past ? `<span class="status">было</span>` : `<span class="status soon">${ICON.heart()} ${soon}</span>`;
    else if (d.status === 'pending') status = past ? `<span class="status">истекло</span>` : mine ? `<span class="status wait">⏳ ждём ответа</span>` : `<span class="status wait">ждёт твоего ответа</span>`;
    else if (d.status === 'declined') status = `<span class="status no">не получилось</span>`;
    else if (d.status === 'cancelled') status = `<span class="status">отменено</span>`;
    let acts = '';
    if (!past && d.status === 'pending' && !compact) {
      acts = mine
        ? `<button class="btn btn-sm btn-text danger" data-action="date-cancel" data-id="${d.id}">Отменить приглашение</button>`
        : `<button class="btn btn-sm btn-love" data-action="date-accept" data-id="${d.id}">Да! 💛</button><button class="btn btn-sm btn-ghost" data-action="date-counter" data-id="${d.id}">Другое время</button><button class="btn btn-sm btn-text" data-action="date-decline" data-id="${d.id}">Не получится</button>`;
    } else if (!past && d.status === 'accepted' && !compact) {
      acts = `<button class="btn btn-sm btn-text danger" data-action="date-cancel" data-id="${d.id}">Отменить</button>`;
    }
    return `<div class="dcard ${past || d.status === 'declined' || d.status === 'cancelled' ? 'past' : ''}" data-id="${d.id}">
      <div class="em">${esc(d.emoji || '💌')}</div>
      <div class="body">
        <div class="ttl"><span>${esc(d.title)}</span>${status}</div>
        <div class="when"><b>${cap(fmtDateRu(d.date))}</b> · ${fmtMin(d.start)}–${fmtMin(d.end)}</div>
        ${d.note ? `<div class="note">«${esc(d.note)}»</div>` : ''}
        <div class="meta"><span class="avatar av ${esc(d.fromKey)}">${esc(from.name[0])}</span>${mine ? 'ты пригласил' + (myKey() === 'yana' ? 'а' : '') : `приглашение от ${esc(gen(d.fromKey))}`} · ${fmtDur(d.end - d.start)}</div>
        ${acts ? `<div class="acts">${acts}</div>` : ''}
      </div>
    </div>`;
  }

  // ----- Ideas screen -----
  function renderIdeas() {
    if (!S.ideas) { loadIdeas().then(render).catch(fail); return `<div class="loading"><div class="spinner"></div></div>`; }
    const { categories, ideas } = S.ideas;
    const cats = `<div class="cats"><button class="chip sm ${S.ideaCat === 'all' ? 'on' : ''}" data-action="idea-cat" data-cat="all">Все</button>${categories.map((c) => `<button class="chip sm ${S.ideaCat === c.key ? 'on' : ''}" data-action="idea-cat" data-cat="${esc(c.key)}">${esc(c.emoji || '')} ${esc(c.label)}</button>`).join('')}</div>`;
    const list = ideas.filter((i) => S.ideaCat === 'all' || i.category === S.ideaCat);
    const cards = list.map((i) => `<div class="icard">
      <div class="top"><div class="em">${esc(i.emoji || '✨')}</div><div style="flex:1;min-width:0"><div class="ttl">${esc(i.title)}</div>
        <div class="meta">${i.area ? `<span class="tag">📍 ${esc(i.area)}</span>` : ''}${i.duration ? `<span class="tag">⏱ ${fmtDur(i.duration)}</span>` : ''}${i.bestTime ? `<span class="tag best">${esc(BEST_TIME[i.bestTime] || i.bestTime)}</span>` : ''}</div></div></div>
      ${i.description ? `<div class="desc">${esc(i.description)}</div>` : ''}
      <div class="acts"><button class="btn btn-sm btn-tint" data-action="idea-invite" data-id="${esc(i.id)}">${ICON.heart()}&nbsp;Позвать сюда</button></div>
    </div>`).join('');
    return `${cats}<div class="wrap" style="padding-top:8px">${cards || `<div class="empty">Тут пока пусто</div>`}</div>`;
  }

  // ----- More screen -----
  function renderMore() {
    const me = S.me;
    const p = me.partner || {};
    const pets = me.petNames || [];
    const opts = me.petNameOptions || [];
    const g = me.google || {};
    const petSection = `<div class="section-title">Как я зову ${esc(ACC[p.key] || p.name || 'партнёра')}</div>
      <div class="card pad">
        ${pets.length ? `<div class="chips">${pets.map((n) => `<span class="chip">${esc(n)}<button class="x" data-action="pet-remove" data-name="${esc(n)}" aria-label="Удалить">${ICON.close}</button></span>`).join('')}</div>`
          : `<div class="muted" style="margin-bottom:10px">Пока без ласковых имён. Выбери, как звать ${esc(ACC[p.key] || p.name)} — бот будет использовать их в сообщениях.</div>`}
        ${(!pets.length && opts.length) ? `<div class="chips">${opts.map((n) => `<button class="chip sugg" data-action="pet-add" data-name="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div>` : ''}
        <div class="add-row"><input class="input" data-form="more" data-field="petInput" value="${esc(S.petInput)}" placeholder="своё слово" maxlength="24" enterkeyhint="done" data-enter="pet-add-input"><button class="btn btn-tint" data-action="pet-add-input">Добавить</button></div>
      </div>`;
    const gStatus = g.connected ? `подключён${g.email ? ` · ${esc(g.email)}` : ''}` : 'не подключён';
    const gAction = g.canConnect
      ? (g.connected ? `<button class="btn-text danger" data-action="google-disconnect">Отключить</button>` : `<button class="btn btn-sm btn-primary" style="width:auto" data-action="google-connect">Подключить</button>`)
      : (me.me.key === (g.owner || 'yana') && g.configured === false)
        ? `<span class="r muted">задай GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET на сервере</span>`
        : `<span class="r">${g.connected ? 'календарь ' + esc(gen(g.owner || 'yana')) : 'подключает ' + esc(user(g.owner || 'yana').name)}</span>`;
    const google = `<div class="section-title">Google Календарь</div>
      <div class="list"><div class="li"><span class="ic">📆</span><div class="b"><div class="t">Календарь ${esc(gen(g.owner || 'yana'))}</div><div class="s">${gStatus}</div></div>${gAction}</div></div>`;
    const cds = `<div class="section-title">Важные даты</div><div class="list">${(me.countdowns || []).map((c) => `<div class="li"><span class="ic">${esc(c.emoji || '📅')}</span><div class="b"><div class="t">${esc(c.label)}</div><div class="s">${cap(fmtDateRu(c.date))}</div></div><span class="r accent">${c.daysLeft === 0 ? 'сегодня' : `${c.daysLeft} ${plural(c.daysLeft, ['день', 'дня', 'дней'])}`}</span></div>`).join('') || `<div class="li"><div class="b muted">Дат пока нет</div></div>`}</div>`;
    const howto = `<div class="section-title">Как пользоваться</div><div class="card pad howto">
      <p><span class="k" style="background:var(--yana)"></span><span class="k" style="background:var(--vova)"></span> Две дорожки — ваши занятия. Штриховкой отмечены события из Google.</p>
      <p>${ICON.heart('heart-ic')} Розовые окна — свободны оба. Нажми на окно, и бот подскажет, куда сходить.</p>
      <p>«+» добавляет занятие любому из вас; нажми на блок, чтобы изменить или удалить.</p>
      <p>Приглашения дублируются карточкой в общий чат, ответить можно там или здесь.</p>
    </div>`;
    return `<div class="wrap" style="padding-top:12px">
      <div class="card profile"><span class="avatar ${esc(me.me.key)}">${esc(me.me.name[0])}</span><div><div class="names">${esc(me.me.name)} <span class="plus">${ICON.heart()}</span> ${esc(p.name || '')} <span>· ${esc(me.tz || 'Asia/Bangkok')}</span></div>${pets.length ? `<div class="muted">${esc(callPartner())} — так ты зовёшь ${esc(ACC[p.key] || p.name || '')} сейчас</div>` : `<div class="muted">вместе в одном календаре</div>`}</div></div>
      ${petSection}${google}${cds}${howto}
      <div class="version">${esc(appName())} · версия ${VERSION}${MOCK ? ' · demo' : ''}</div>
    </div>`;
  }

  // ----- Invite flow -----
  function startInvite(prefill) {
    const slot = prefill && prefill.slot ? Object.assign({}, prefill.slot) : null;
    if (slot && slot.date === S.today) slot.start = Math.max(slot.start, Math.min(slot.end - 30, round15(now().minutes + 15)));
    S.invite = {
      step: prefill && prefill.idea ? 2 : 1, minStep: 1,
      slot, slotMode: slot ? 'slot' : null, picked: null, line: '', pickLoading: true,
      idea: prefill && prefill.idea ? prefill.idea : null,
      custom: false, customTitle: '', customEmoji: '💌',
      date: slot ? slot.date : '', start: slot ? fmtMin(slot.start) : '', end: slot ? fmtMin(slot.end) : '',
      windows: null, note: '', sending: false,
    };
    if (prefill && prefill.idea) applyIdeaDuration();
    S.view = 'invite';
    render();
    upcomingWindows().then((ws) => {
      if (!S.invite) return;
      S.invite.windows = ws;
      if (!S.invite.slot && ws.length && !S.invite.date) { S.invite.slot = ws[0]; S.invite.slotMode = 'slot'; S.invite.date = ws[0].date; S.invite.start = fmtMin(ws[0].start); S.invite.end = fmtMin(ws[0].end); applyIdeaDuration(); }
      const s = S.invite.slot || { date: S.today, start: awake().start, end: awake().end };
      return api(`/api/ideas/pick?date=${s.date}&start=${s.start}&end=${s.end}`).then((r) => {
        if (!S.invite) return;
        S.invite.picked = r.ideas || []; S.invite.line = r.line || '';
      }).catch(() => { if (S.invite) S.invite.picked = []; });
    }).catch(() => { if (S.invite) { S.invite.windows = []; S.invite.picked = []; } }).finally(() => { if (S.invite) { S.invite.pickLoading = false; render(); } });
  }

  // When an idea has a duration, trim the end of the chosen slot to it (sunset ideas aim at ~17:45).
  function applyIdeaDuration() {
    const inv = S.invite; if (!inv || !inv.idea || !inv.slot) return;
    const dur = inv.idea.duration || 120;
    let start = inv.slot.start;
    if (inv.idea.bestTime === 'sunset' && inv.slot.start <= 1065 && inv.slot.end >= 1140) start = Math.max(inv.slot.start, 1065);
    else if (inv.idea.bestTime === 'evening' && inv.slot.start < 1080 && inv.slot.end >= 1080 + Math.min(dur, 90)) start = 1080;
    inv.start = fmtMin(start);
    inv.end = fmtMin(Math.min(inv.slot.end, start + dur));
  }

  function inviteIdea() {
    const inv = S.invite;
    if (inv.custom) return inv.customTitle.trim() ? { id: null, title: inv.customTitle.trim(), emoji: (inv.customEmoji || '💌').trim().slice(0, 4) || '💌' } : null;
    return inv.idea;
  }

  function renderInvite() {
    const inv = S.invite;
    const back = `<button class="iconbtn" data-action="back" aria-label="Назад">${IN_TG ? '' : ICON.left}</button>`;
    const head = `<div class="flow-head">${back}<h1>Позвать на свидание</h1><button class="iconbtn" data-action="invite-close" aria-label="Закрыть">${ICON.close}</button></div>
      <div class="steps">${[1, 2, 3].map((i) => `<i class="${i === inv.step ? 'on' : i < inv.step ? 'done' : ''}"></i>`).join('')}</div>`;
    let body = '', label = 'Дальше', disabled = false, action = () => { inv.step += 1; render(); };

    if (inv.step === 1) {
      const idea = inviteIdea();
      disabled = !idea;
      const opts = (inv.picked || []).map((i) => `<button class="opt ${!inv.custom && inv.idea && inv.idea.id === i.id ? 'on' : ''}" data-action="pick-idea" data-id="${esc(i.id)}"><span class="em">${esc(i.emoji || '✨')}</span><span class="b"><span class="ttl">${esc(i.title)}</span><span class="sub">${[i.area, i.duration ? fmtDur(i.duration) : '', BEST_TIME[i.bestTime] || ''].filter(Boolean).map(esc).join(' · ')}</span></span><span class="rad"></span></button>`).join('');
      body = `<div class="flow-title">Куда зовём?</div><div class="flow-sub">Три идеи под ${inv.slot ? `окно ${WD[weekdayOf(inv.slot.date)]}, ${fmtMin(inv.slot.start)}–${fmtMin(inv.slot.end)}` : 'ближайшее свободное окно'} и своя.</div>
        <div class="wrap">
        ${inv.line ? `<div class="botline"><span class="bot">${ICON.spark}</span><em>${esc(inv.line)}</em></div>` : ''}
        ${inv.pickLoading && !inv.picked ? `<div class="loading" style="padding:24px"><div class="spinner"></div>Бот подбирает идеи…</div>` : opts}
        ${inv.idea && !inv.custom && !(inv.picked || []).some((i) => i.id === inv.idea.id) ? `<button class="opt on" data-action="pick-idea-keep"><span class="em">${esc(inv.idea.emoji || '✨')}</span><span class="b"><span class="ttl">${esc(inv.idea.title)}</span><span class="sub">выбрано из идей</span></span><span class="rad"></span></button>` : ''}
        <button class="opt ${inv.custom ? 'on' : ''}" data-action="pick-custom"><span class="em">✏️</span><span class="b"><span class="ttl">Своё</span><span class="sub">придумать что-то особенное</span></span><span class="rad"></span></button>
        ${inv.custom ? `<div class="opt-extra" data-form="invite"><div class="custom-row"><input class="input emoji-in" data-field="customEmoji" value="${esc(inv.customEmoji)}" maxlength="4" aria-label="Эмодзи"><input class="input" data-field="customTitle" value="${esc(inv.customTitle)}" placeholder="Например: пикник на Най Харн" maxlength="60" autofocus></div></div>` : ''}
        </div>`;
    } else if (inv.step === 2) {
      const ws = inv.windows;
      const idea = inviteIdea();
      const s = parseHHMM(inv.start), e = parseHHMM(inv.end);
      disabled = !inv.date || s == null || e == null || e <= s;
      const list = ws == null ? `<div class="loading" style="padding:20px"><div class="spinner"></div></div>`
        : ws.length ? ws.slice(0, 10).map((w, i) => {
          const on = inv.slotMode === 'slot' && inv.slot && inv.slot.date === w.date && inv.slot.start < w.end && inv.slot.end > w.start;
          return `<button class="opt ${on ? 'on' : ''}" data-action="pick-slot" data-i="${i}"><span class="em">${ICON.heart('heart-ic')}</span><span class="b"><span class="ttl">${cap(fmtDateRu(w.date))}${w.date === S.today ? ' · сегодня' : w.date === addDays(S.today, 1) ? ' · завтра' : ''}</span><span class="sub">${fmtMin(w.start)}–${fmtMin(w.end)} · вместе ${fmtDur(w.end - w.start)}</span></span><span class="rad"></span></button>`;
        }).join('') : `<div class="muted" style="padding:4px 2px 10px">На ближайшую неделю общих окон не нашлось — выбери время вручную, вдруг получится подвинуться.</div>`;
      body = `<div class="flow-title">Когда?</div><div class="flow-sub">${idea ? `${esc(idea.emoji || '')} ${esc(idea.title)}${idea.duration ? ` · обычно ${fmtDur(idea.duration)}` : ''}` : 'Свободные окна на ближайшие 7 дней'}</div>
        <div class="wrap">${list}
        <button class="opt ${inv.slotMode === 'manual' ? 'on' : ''}" data-action="pick-manual"><span class="em">🗓️</span><span class="b"><span class="ttl">Другое время</span><span class="sub">выбрать дату и время самим</span></span><span class="rad"></span></button>
        <div class="card pad" data-form="invite" style="margin-top:4px">
          <div class="stack">
            ${inv.slotMode === 'manual' ? `<div class="field"><label>Дата</label><input class="input" type="date" data-field="date" value="${esc(inv.date)}" min="${S.today}"></div>` : `<div class="lbl">${inv.date ? cap(fmtDateRu(inv.date)) : 'Дата не выбрана'}</div>`}
            <div class="times"><div class="field"><label>Начало</label><input class="input" type="time" step="900" data-field="start" value="${esc(inv.start)}"></div><span class="dash">—</span><div class="field"><label>Конец</label><input class="input" type="time" step="900" data-field="end" value="${esc(inv.end)}"></div></div>
            ${inv.slotMode === 'slot' && inv.slot ? `<div class="muted">Окно ${fmtMin(inv.slot.start)}–${fmtMin(inv.slot.end)}, можно сдвинуть время внутри него.</div>` : ''}
          </div>
        </div></div>`;
    } else {
      const idea = inviteIdea();
      label = 'Отправить приглашение';
      disabled = inv.sending;
      action = sendInvite;
      body = `<div class="flow-title">Пара слов</div><div class="flow-sub">Записка полетит вместе с карточкой в чат.</div>
        <div class="wrap">
          <div class="summary"><span class="em">${esc(idea ? idea.emoji : '💌')}</span><div><div class="ttl">${esc(idea ? idea.title : '')}</div><div class="when">${cap(fmtDateRu(inv.date))} · ${esc(inv.start)}–${esc(inv.end)}</div></div></div>
          <div class="card pad" data-form="invite"><textarea class="input" data-field="note" placeholder="${myKey() === 'yana' ? 'например: соскучилась, хочу смотреть на закат рядом с тобой' : 'например: соскучился, хочу смотреть на закат рядом с тобой'}" maxlength="300">${esc(inv.note)}</textarea></div>
          <div class="muted" style="margin-top:10px">${esc(user(partnerKey()).name)} получит приглашение в общий чат и сможет ответить там или здесь.</div>
        </div>`;
    }
    setPrimary(label, disabled ? null : action, disabled);
    const foot = IN_TG ? '' : `<div class="flow-foot"><div class="inner"><button class="btn btn-primary" data-action="primary" ${disabled ? 'disabled' : ''}>${label}</button></div></div>`;
    return head + body + foot;
  }

  async function sendInvite() {
    const inv = S.invite; if (!inv || inv.sending) return;
    const idea = inviteIdea();
    const start = parseHHMM(inv.start), end = parseHHMM(inv.end);
    if (!idea || !inv.date || start == null || end == null || end <= start) { toast('Проверь время и место', 'err'); return; }
    inv.sending = true; render();
    try {
      const r = await api('/api/dates', { method: 'POST', body: { title: idea.title, emoji: idea.emoji || '💌', date: inv.date, start, end, note: inv.note.trim() || undefined, ideaId: idea.id || undefined } });
      hapticNotify('success');
      S.dates = null; await refreshWeeks().catch(() => null);
      S.lastSent = r.date || null;
      S.view = 'success'; S.invite = null; render();
    } catch (e) { inv.sending = false; render(); fail(e); }
  }

  function renderSuccess() {
    setPrimary('К свиданиям', () => { S.view = null; S.tab = 'dates'; S.datesSeg = 'pending'; render(); });
    const d = S.lastSent;
    return `<div class="success">
      <div class="sparks"><i></i><i></i><i></i><i></i></div>
      <div class="heart">${ICON.heart()}</div>
      <h2>Приглашение отправлено</h2>
      <p>${esc(callPartner())} уже получает карточку в чат${d ? `: ${esc(d.emoji || '')} ${esc(d.title)}, ${fmtDateRu(d.date)} в ${fmtMin(d.start)}` : ''}. Осталось дождаться ответа.</p>
      ${IN_TG ? '' : `<button class="btn btn-primary" style="width:auto;padding:12px 28px" data-action="primary">К свиданиям</button>`}
    </div>`;
  }

  // ----- Sheets -----
  function openSheet(sheet) { S.sheet = sheet; render(); }
  function closeSheet() { S.sheet = null; S.form = null; S.counter = null; render(); }
  function closeSheetDom() { const root = document.getElementById('sheet-root'); root.className = ''; root.innerHTML = ''; }

  function renderSheet() {
    const root = document.getElementById('sheet-root');
    if (!S.sheet) { closeSheetDom(); return; }
    const wasOpen = root.classList.contains('open');
    let inner = '';
    if (S.sheet.kind === 'activity') inner = renderActivitySheet();
    else if (S.sheet.kind === 'info') inner = renderInfoSheet();
    else if (S.sheet.kind === 'date') inner = renderDateSheet();
    else if (S.sheet.kind === 'counter') inner = renderCounterSheet();
    else if (S.sheet.kind === 'decline') inner = renderDeclineSheet();
    root.innerHTML = `<div class="backdrop" data-action="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true"><div class="handle"></div>${inner}</div>`;
    root.className = 'sheet-root' + (wasOpen ? ' open' : '');
    if (!wasOpen) requestAnimationFrame(() => { root.classList.add('open'); });
  }

  function primaryHtml(label, disabled) { return IN_TG ? '' : `<button class="btn btn-primary" data-action="primary" ${disabled ? 'disabled' : ''}>${label}</button>`; }

  function openActivity(block, date) {
    const f = { id: null, userKey: myKey(), title: '', kind: 'recurring', weekdays: [weekdayOf(date || S.selectedDate)], date: date || S.selectedDate, start: '18:00', end: '19:00' };
    if (block) {
      const idNum = String(block.id).replace(/^a:/, '');
      Object.assign(f, { id: idNum, userKey: block.userKey, title: block.title || '', kind: block.kind === 'once' ? 'once' : 'recurring', weekdays: [weekdayOf(date)], date, start: fmtMin(block.start), end: fmtMin(block.end) });
    } else {
      const n = now();
      if (date === S.today) { const s = round15(n.minutes + 30); if (s + 60 <= awake().end) { f.start = fmtMin(s); f.end = fmtMin(s + 60); } }
    }
    S.form = f;
    openSheet({ kind: 'activity' });
  }

  function renderActivitySheet() {
    const f = S.form;
    const edit = !!f.id;
    const s = parseHHMM(f.start), e = parseHHMM(f.end);
    const valid = f.title.trim() && s != null && e != null && e > s && (f.kind === 'once' ? !!f.date : f.weekdays.length > 0);
    setPrimary(edit ? 'Сохранить' : 'Добавить', valid ? saveActivity : null, !valid);
    return `<div class="sheet-head"><h2>${edit ? 'Изменить занятие' : 'Новое занятие'}</h2><button class="iconbtn" data-action="sheet-close" aria-label="Закрыть">${ICON.close}</button></div>
    <div class="stack" data-form="form">
      <div class="who">${['yana', 'vova'].map((k) => `<button class="${k} ${f.userKey === k ? 'on' : ''}" data-action="form-who" data-key="${k}"><span class="avatar ${k}">${esc(user(k).name[0])}</span>${esc(user(k).name)}</button>`).join('')}</div>
      <div class="field"><input class="input" data-field="title" value="${esc(f.title)}" placeholder="Что за занятие?" maxlength="60" enterkeyhint="done">
        <div class="chips" style="margin-top:8px">${QUICK_TITLES.map((t) => `<button class="chip sm ${f.title === t ? 'on' : ''}" data-action="form-title" data-title="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
      <div class="seg in-card"><button class="${f.kind === 'recurring' ? 'on' : ''}" data-action="form-kind" data-kind="recurring">Каждую неделю</button><button class="${f.kind === 'once' ? 'on' : ''}" data-action="form-kind" data-kind="once">Один раз</button></div>
      ${f.kind === 'recurring'
        ? `<div class="field"><label>${edit ? 'День недели' : 'Дни недели (можно несколько)'}</label><div class="wdays">${WD.map((w, i) => `<button class="${f.weekdays.includes(i) ? 'on' : ''}" data-action="form-wd" data-i="${i}">${w}</button>`).join('')}</div></div>`
        : `<div class="field"><label>Дата</label><input class="input" type="date" data-field="date" value="${esc(f.date)}"></div>`}
      <div class="times"><div class="field"><label>Начало</label><input class="input" type="time" step="900" data-field="start" value="${esc(f.start)}"></div><span class="dash">—</span><div class="field"><label>Конец</label><input class="input" type="time" step="900" data-field="end" value="${esc(f.end)}"></div></div>
      ${s != null && e != null && e > s ? `<div class="muted">${fmtDur(e - s)}${f.kind === 'recurring' && f.weekdays.length > 1 && !edit ? ` · ${f.weekdays.length} ${plural(f.weekdays.length, ['занятие', 'занятия', 'занятий'])} в неделю` : ''}</div>` : ''}
    </div>
    <div class="sheet-foot">${primaryHtml(edit ? 'Сохранить' : 'Добавить', !valid)}${edit ? `<div class="danger-row"><button class="btn btn-text danger" data-action="form-delete">Удалить занятие</button></div>` : ''}</div>`;
  }

  async function saveActivity() {
    const f = S.form; if (!f) return;
    const start = parseHHMM(f.start), end = parseHHMM(f.end);
    if (!f.title.trim()) return toast('Напиши название', 'err');
    if (start == null || end == null || end <= start) return toast('Конец должен быть позже начала', 'err');
    const base = { userKey: f.userKey, title: f.title.trim(), start, end };
    try {
      if (f.id) {
        const body = f.kind === 'once' ? { ...base, kind: 'once', date: f.date, weekday: null } : { ...base, kind: 'recurring', weekday: f.weekdays[0], date: null };
        await api(`/api/activities/${encodeURIComponent(f.id)}`, { method: 'PATCH', body });
      } else if (f.kind === 'once') {
        if (!f.date) return toast('Выбери дату', 'err');
        await api('/api/activities', { method: 'POST', body: { ...base, kind: 'once', date: f.date } });
      } else {
        if (!f.weekdays.length) return toast('Выбери хотя бы один день', 'err');
        await Promise.all(f.weekdays.map((wd) => api('/api/activities', { method: 'POST', body: { ...base, kind: 'recurring', weekday: wd } })));
      }
      hapticNotify('success');
      toast(f.id ? 'Сохранено' : 'Добавлено');
      S.sheet = null; S.form = null;
      await refreshWeeks(); render();
    } catch (e) { fail(e); }
  }

  async function deleteActivity() {
    const f = S.form; if (!f || !f.id) return;
    if (!(await confirmDialog(`Удалить «${f.title}»${f.kind === 'recurring' ? ' по ' + WD[f.weekdays[0]] : ''}?`))) return;
    try {
      await api(`/api/activities/${encodeURIComponent(f.id)}`, { method: 'DELETE' });
      hapticNotify('success'); toast('Удалено');
      S.sheet = null; S.form = null;
      await refreshWeeks(); render();
    } catch (e) { fail(e); }
  }

  function renderInfoSheet() {
    const b = S.sheet.block;
    const u = user(b.userKey);
    return `<div class="sheet-head"><h2>Из Google Календаря</h2><button class="iconbtn" data-action="sheet-close" aria-label="Закрыть">${ICON.close}</button></div>
      <div class="info-row"><span class="avatar ${esc(b.userKey)}" style="width:40px;height:40px;font-size:16px">${esc(u.name[0])}</span><div style="flex:1;min-width:0"><div style="font-size:17px;font-weight:600">${esc(b.title || 'Событие')}</div><div class="muted">${cap(fmtDateRu(S.sheet.date))} · ${fmtMin(b.start)}–${fmtMin(b.end)} · ${fmtDur(b.end - b.start)}</div></div></div>
      <div style="margin-top:14px"><span class="src-badge">${ICON.cal} Google Calendar · ${esc(u.name)}</span></div>
      <p class="muted" style="margin:12px 0 0">Это событие живёт в Google — менять его нужно там, здесь оно только для вида.</p>
      <div class="sheet-foot">${IN_TG ? '' : `<button class="btn btn-ghost" style="width:100%" data-action="sheet-close">Понятно</button>`}</div>`;
  }

  function renderDateSheet() {
    const d = (S.dates || []).find((x) => String(x.id) === String(S.sheet.id)) || S.sheet.fallback;
    if (!d) return `<div class="loading"><div class="spinner"></div></div>`;
    return `<div class="sheet-head"><h2>Свидание</h2><button class="iconbtn" data-action="sheet-close" aria-label="Закрыть">${ICON.close}</button></div>${renderDateCard(d)}`;
  }

  function renderCounterSheet() {
    const c = S.counter;
    const s = parseHHMM(c.start), e = parseHHMM(c.end);
    const valid = c.date && s != null && e != null && e > s;
    setPrimary('Предложить', valid ? sendCounter : null, !valid);
    return `<div class="sheet-head"><h2>Другое время</h2><button class="iconbtn" data-action="sheet-close" aria-label="Закрыть">${ICON.close}</button></div>
      <p class="muted" style="margin:0 0 14px">${esc(c.emoji || '')} ${esc(c.title)} — предложи, когда удобнее. Приглашение вернётся ${esc(user(c.fromKey).name === 'Яна' ? 'Яне' : 'Вове')} уже от тебя.</p>
      <div class="stack" data-form="counter">
        <div class="field"><label>Дата</label><input class="input" type="date" data-field="date" value="${esc(c.date)}" min="${S.today}"></div>
        <div class="times"><div class="field"><label>Начало</label><input class="input" type="time" step="900" data-field="start" value="${esc(c.start)}"></div><span class="dash">—</span><div class="field"><label>Конец</label><input class="input" type="time" step="900" data-field="end" value="${esc(c.end)}"></div></div>
      </div>
      <div class="sheet-foot">${primaryHtml('Предложить', !valid)}</div>`;
  }

  function renderDeclineSheet() {
    const d = S.sheet.date;
    setPrimary('Предложить другое время', () => { S.sheet = null; openCounter(d); });
    return `<div class="sheet-head"><h2>Не получится?</h2><button class="iconbtn" data-action="sheet-close" aria-label="Закрыть">${ICON.close}</button></div>
      <p style="margin:0 0 6px">${esc(d.emoji || '')} ${esc(d.title)} · ${fmtDateRu(d.date)}, ${fmtMin(d.start)}</p>
      <p class="muted" style="margin:0 0 16px">Бывает. Мягко откажем, а ${esc(gen(d.fromKey))} бот обнимет за тебя. Или предложи другое время — так приятнее.</p>
      <div class="sheet-foot">${IN_TG ? '' : `<button class="btn btn-primary" data-action="primary">Предложить другое время</button>`}<button class="btn btn-ghost" style="width:100%" data-action="date-decline-confirm" data-id="${d.id}">Отказать мягко</button></div>`;
  }

  function openCounter(d) {
    S.counter = { id: d.id, title: d.title, emoji: d.emoji, fromKey: d.fromKey, date: d.date, start: fmtMin(d.start), end: fmtMin(d.end) };
    openSheet({ kind: 'counter' });
  }

  async function sendCounter() {
    const c = S.counter; if (!c) return;
    const start = parseHHMM(c.start), end = parseHHMM(c.end);
    if (!c.date || start == null || end == null || end <= start) return toast('Проверь время', 'err');
    try {
      await api(`/api/dates/${c.id}/respond`, { method: 'POST', body: { action: 'counter', date: c.date, start, end } });
      hapticNotify('success'); toast('Предложили другое время');
      S.sheet = null; S.counter = null;
      await Promise.all([loadDates(true), refreshWeeks()]); render();
    } catch (e) { fail(e); }
  }

  async function respond(id, action) {
    try {
      await api(`/api/dates/${id}/respond`, { method: 'POST', body: { action } });
      hapticNotify('success');
      toast(action === 'accept' ? 'Свидание в календаре 💛' : 'Отказали мягко');
      S.sheet = null;
      await Promise.all([loadDates(true), refreshWeeks()]); render();
    } catch (e) { fail(e); }
  }

  async function cancelDate(id) {
    const d = (S.dates || []).find((x) => String(x.id) === String(id));
    if (!(await confirmDialog(`Отменить ${d ? '«' + d.title + '»' : 'свидание'}?`))) return;
    try {
      await api(`/api/dates/${id}`, { method: 'DELETE' });
      hapticNotify('success'); toast('Отменено');
      S.sheet = null;
      await Promise.all([loadDates(true), refreshWeeks()]); render();
    } catch (e) { fail(e); }
  }

  // ----- Settings actions -----
  async function savePetNames(list) {
    try {
      const r = await api('/api/settings', { method: 'PATCH', body: { petNames: list } });
      S.me.petNames = r.petNames || list;
      S.me.petNameOptions = r.petNameOptions || [];
      if (S.me.petNames.length && !S.me.petNames.includes(S.me.callPartner)) S.me.callPartner = S.me.petNames[0];
      if (!S.me.petNames.length) S.me.callPartner = (S.me.partner && S.me.partner.name) || S.me.callPartner;
      hapticSelect(); render();
    } catch (e) { fail(e); }
  }

  async function googleConnect() {
    try {
      const r = await api('/api/google/auth-url');
      if (r && r.url) { openExternal(r.url); toast('Откроется окно Google — потом вернись сюда'); }
      else toast('Ссылка не пришла', 'err');
    } catch (e) { fail(e); }
  }
  async function googleDisconnect() {
    if (!(await confirmDialog('Отключить Google Календарь? События перестанут показываться.'))) return;
    try {
      await api('/api/google', { method: 'DELETE' });
      const st = await api('/api/google/status').catch(() => ({ connected: false, owner: 'yana', canConnect: true }));
      S.me.google = st; await refreshWeeks(); toast('Отключили'); render();
    } catch (e) { fail(e); }
  }
  async function refreshGoogle() {
    try { const st = await api('/api/google/status'); S.me.google = st; render(); } catch (e) { /* noop */ }
  }

  // ---------- Events ----------
  async function selectWeek(start) {
    S.weekStart = start;
    const wd = weekdayOf(S.selectedDate);
    S.selectedDate = addDays(start, wd);
    render();
    try { await loadWeek(start); } catch (e) { fail(e); }
    render();
  }

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const a = el.dataset.action;
    const inv = S.invite;
    switch (a) {
      case 'reload': location.reload(); break;
      case 'tab': if (S.tab !== el.dataset.tab) { haptic('light'); S.tab = el.dataset.tab; S.sheet = null; render(); } break;
      case 'select-day': hapticSelect(); S.selectedDate = el.dataset.date; render(); break;
      case 'week-prev': haptic('light'); selectWeek(addDays(S.weekStart, -7)); break;
      case 'week-next': haptic('light'); selectWeek(addDays(S.weekStart, 7)); break;
      case 'week-today': S.selectedDate = S.today; selectWeek(mondayOf(S.today)); break;
      case 'fab': haptic('medium'); if (S.tab === 'dates') startInvite(); else openActivity(null, S.selectedDate); break;
      case 'invite-new': haptic('medium'); startInvite(); break;
      case 'free': { haptic('light'); startInvite({ slot: { date: el.dataset.date, start: +el.dataset.start, end: +el.dataset.end } }); break; }
      case 'block': {
        const day = dayOf(el.dataset.date); if (!day) break;
        const b = [...(day.busy.yana || []), ...(day.busy.vova || [])].find((x) => String(x.id) === el.dataset.id); if (!b) break;
        haptic('light');
        if (b.source === 'google' || !b.editable) openSheet({ kind: 'info', block: b, date: el.dataset.date });
        else openActivity(b, el.dataset.date);
        break;
      }
      case 'date-open': {
        haptic('light');
        const day = dayOf(S.selectedDate);
        const fb = day ? (day.dates || []).find((x) => String(x.id) === el.dataset.id) : null;
        openSheet({ kind: 'date', id: el.dataset.id, fallback: fb });
        if (!S.dates) loadDates().then(render).catch(fail);
        break;
      }
      case 'dates-seg': hapticSelect(); S.datesSeg = el.dataset.seg; render(); break;
      case 'date-accept': haptic('medium'); respond(el.dataset.id, 'accept'); break;
      case 'date-decline': { const d = (S.dates || []).find((x) => String(x.id) === el.dataset.id); if (d) openSheet({ kind: 'decline', date: d }); break; }
      case 'date-decline-confirm': respond(el.dataset.id, 'decline'); break;
      case 'date-counter': { const d = (S.dates || []).find((x) => String(x.id) === el.dataset.id); if (d) openCounter(d); break; }
      case 'date-cancel': cancelDate(el.dataset.id); break;
      case 'idea-cat': hapticSelect(); S.ideaCat = el.dataset.cat; render(); break;
      case 'idea-invite': { const i = (S.ideas ? S.ideas.ideas : []).find((x) => String(x.id) === el.dataset.id); haptic('medium'); startInvite({ idea: i }); break; }
      case 'pet-remove': savePetNames((S.me.petNames || []).filter((n) => n !== el.dataset.name)); break;
      case 'pet-add': savePetNames([...(S.me.petNames || []), el.dataset.name].filter((v, i, arr) => arr.indexOf(v) === i)); break;
      case 'pet-add-input': { const v = (S.petInput || '').trim(); if (!v) break; S.petInput = ''; savePetNames([...(S.me.petNames || []), v].filter((x, i, arr) => arr.indexOf(x) === i)); break; }
      case 'google-connect': haptic('light'); googleConnect(); break;
      case 'google-disconnect': googleDisconnect(); break;
      case 'sheet-close': closeSheet(); break;
      case 'back': goBack(); break;
      case 'invite-close': S.view = null; S.invite = null; render(); break;
      case 'primary': if (S.primary && !S.primary.disabled) { haptic('medium'); S.primary.fn(); } break;
      // activity form
      case 'form-who': hapticSelect(); S.form.userKey = el.dataset.key; render(); break;
      case 'form-title': S.form.title = el.dataset.title; render(); break;
      case 'form-kind': hapticSelect(); S.form.kind = el.dataset.kind; render(); break;
      case 'form-wd': { const i = +el.dataset.i; const f = S.form; hapticSelect(); if (f.id) f.weekdays = [i]; else f.weekdays = f.weekdays.includes(i) ? f.weekdays.filter((x) => x !== i) : [...f.weekdays, i].sort(); render(); break; }
      case 'form-delete': deleteActivity(); break;
      // invite flow
      case 'pick-idea': { const i = (inv.picked || []).find((x) => String(x.id) === el.dataset.id); if (i) { hapticSelect(); inv.idea = i; inv.custom = false; applyIdeaDuration(); render(); } break; }
      case 'pick-idea-keep': inv.custom = false; render(); break;
      case 'pick-custom': hapticSelect(); inv.custom = true; render(); setTimeout(() => { const i = document.querySelector('[data-field="customTitle"]'); if (i) i.focus(); }, 50); break;
      case 'pick-slot': { const w = (inv.windows || [])[+el.dataset.i]; if (w) { hapticSelect(); inv.slot = w; inv.slotMode = 'slot'; inv.date = w.date; inv.start = fmtMin(w.start); inv.end = fmtMin(w.end); applyIdeaDuration(); render(); } break; }
      case 'pick-manual': hapticSelect(); inv.slotMode = 'manual'; inv.slot = null; if (!inv.date) inv.date = S.today; if (!inv.start) { inv.start = '18:30'; inv.end = '20:30'; } render(); break;
      default: break;
    }
  });

  function onField(ev) {
    const el = ev.target;
    const field = el.dataset.field; if (!field) return;
    const scope = el.closest('[data-form]'); if (!scope) return;
    const name = scope.dataset.form;
    const target = name === 'form' ? S.form : name === 'invite' ? S.invite : name === 'counter' ? S.counter : name === 'more' ? S : null;
    if (!target) return;
    target[field] = el.value;
    if (name === 'invite' && S.invite && S.invite.slotMode === 'slot' && (field === 'start' || field === 'end')) {
      // Leaving the window by hand turns the slot into a manual pick.
      const s = parseHHMM(S.invite.start), e = parseHHMM(S.invite.end), w = S.invite.slot;
      if (w && s != null && e != null && (s < w.start || e > w.end)) { S.invite.slotMode = 'manual'; }
    }
    // Re-render only what affects the primary button state, keeping focus intact.
    syncPrimaryOnly();
  }
  document.addEventListener('input', onField);
  document.addEventListener('change', onField);
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target && ev.target.dataset && ev.target.dataset.enter) { ev.preventDefault(); const b = document.querySelector(`[data-action="${ev.target.dataset.enter}"]`); if (b) b.click(); }
  });

  // Recompute validity without touching the DOM the user is typing in.
  function syncPrimaryOnly() {
    let valid = true, label = S.primary ? S.primary.label : '';
    if (S.sheet && S.sheet.kind === 'activity' && S.form) {
      const f = S.form, s = parseHHMM(f.start), e = parseHHMM(f.end);
      valid = !!(f.title.trim() && s != null && e != null && e > s && (f.kind === 'once' ? !!f.date : f.weekdays.length > 0));
      setPrimary(f.id ? 'Сохранить' : 'Добавить', valid ? saveActivity : null, !valid);
    } else if (S.sheet && S.sheet.kind === 'counter' && S.counter) {
      const c = S.counter, s = parseHHMM(c.start), e = parseHHMM(c.end);
      valid = !!(c.date && s != null && e != null && e > s);
      setPrimary('Предложить', valid ? sendCounter : null, !valid);
    } else if (S.view === 'invite' && S.invite) {
      const inv = S.invite;
      if (inv.step === 1) valid = !!inviteIdea();
      else if (inv.step === 2) { const s = parseHHMM(inv.start), e = parseHHMM(inv.end); valid = !!(inv.date && s != null && e != null && e > s); }
      else valid = !inv.sending;
      setPrimary(inv.step === 3 ? 'Отправить приглашение' : 'Дальше', valid ? (inv.step === 3 ? sendInvite : () => { inv.step += 1; render(); }) : null, !valid);
    } else return;
    document.querySelectorAll('[data-action="primary"]').forEach((b) => { b.disabled = !valid; });
    syncButtons();
  }

  // Swipe between weeks on the week strip.
  (function swipe() {
    let x0 = null, y0 = null;
    document.addEventListener('touchstart', (e) => { const t = e.target.closest('#weekstrip'); if (!t) { x0 = null; return; } x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    document.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dy) < 40) { haptic('light'); selectWeek(addDays(S.weekStart, dx < 0 ? 7 : -7)); }
    }, { passive: true });
  })();

  // ---------- Mock backend (?mock=1) ----------
  let mockApi = async () => { throw new Error('mock disabled'); };
  if (MOCK) {
    const T = tzParts('Asia/Bangkok');
    const today = T.date;
    const asKey = PARAMS.get('as') === 'vova' ? 'vova' : 'yana';
    const USERS = {
      yana: { key: 'yana', id: 573832468, name: 'Яна', username: 'yana_obgolts', color: '#E8557A', birthday: '07-25' },
      vova: { key: 'vova', id: 481730749, name: 'Вова', username: 'iency', color: '#3E8EF7', birthday: '03-03' },
    };
    const wdDate = (wd, offsetWeeks = 0) => addDays(mondayOf(today), wd + 7 * offsetWeeks);
    const nextDateWithWd = (wd) => { const d = wdDate(wd); return d > today ? d : wdDate(wd, 1); };
    const M = {
      nextId: 100,
      petNames: { yana: ['киса', 'сиськонавт', 'зай'], vova: [] },
      options: ['солнце', 'зайка', 'малыш', 'котик', 'любимая', 'рыбка', 'звезда'],
      activities: [
        { id: 1, userKey: 'yana', title: 'Английский', kind: 'recurring', weekday: 0, date: null, start: 720, end: 840 },
        { id: 2, userKey: 'yana', title: 'Английский', kind: 'recurring', weekday: 2, date: null, start: 720, end: 840 },
        { id: 3, userKey: 'yana', title: 'Английский', kind: 'recurring', weekday: 5, date: null, start: 780, end: 900 },
        { id: 4, userKey: 'yana', title: 'Муай-тай', kind: 'recurring', weekday: 4, date: null, start: 660, end: 720 },
        { id: 5, userKey: 'vova', title: 'Психолог', kind: 'recurring', weekday: 0, date: null, start: 660, end: 715 },
        { id: 6, userKey: 'vova', title: 'Психолог', kind: 'recurring', weekday: 2, date: null, start: 630, end: 685 },
        { id: 7, userKey: 'vova', title: 'Психолог', kind: 'recurring', weekday: 4, date: null, start: 600, end: 655 },
        { id: 8, userKey: 'vova', title: 'Вокал', kind: 'recurring', weekday: 1, date: null, start: 1020, end: 1080 },
        { id: 9, userKey: 'vova', title: 'Вокал', kind: 'recurring', weekday: 3, date: null, start: 1020, end: 1080 },
        { id: 10, userKey: 'vova', title: 'Зал', kind: 'recurring', weekday: 5, date: null, start: 540, end: 630 },
        { id: 11, userKey: 'vova', title: 'Зал', kind: 'once', weekday: null, date: addDays(today, 3), start: 1080, end: 1170 },
        { id: 12, userKey: 'yana', title: 'Работа', kind: 'recurring', weekday: 1, date: null, start: 600, end: 840 },
        { id: 13, userKey: 'yana', title: 'Работа', kind: 'recurring', weekday: 3, date: null, start: 600, end: 840 },
      ],
      google: [
        { id: 'g:1', userKey: 'yana', date: today, start: 600, end: 660, title: 'Zoom: созвон с клиентом' },
        { id: 'g:2', userKey: 'yana', date: addDays(today, 1), start: 900, end: 960, title: 'Zoom: созвон' },
        { id: 'g:3', userKey: 'yana', date: addDays(today, 3), start: 960, end: 1020, title: 'Zoom: созвон' },
      ],
      dates: [
        { id: 1, fromKey: 'vova', toKey: 'yana', title: 'Ужин у моря', emoji: '🦐', date: addDays(today, 2), start: 1110, end: 1260, note: 'скучаю, давай просто поедим и посмотрим на воду', status: 'pending', createdAt: new Date().toISOString() },
        { id: 2, fromKey: 'yana', toKey: 'vova', title: 'Закат на мысе Промтеп', emoji: '🌅', date: nextDateWithWd(5), start: 1050, end: 1200, note: 'беру плед', status: 'accepted', createdAt: new Date().toISOString() },
        { id: 3, fromKey: 'yana', toKey: 'vova', title: 'Кино в Central', emoji: '🎬', date: addDays(today, -5), start: 1140, end: 1290, note: '', status: 'accepted', createdAt: new Date().toISOString() },
        { id: 4, fromKey: 'vova', toKey: 'yana', title: 'Каяки в Ао Пор', emoji: '🛶', date: addDays(today, -12), start: 540, end: 720, note: 'в 9 утра, выдержишь?', status: 'declined', createdAt: new Date().toISOString() },
      ],
      categories: [
        { key: 'sunset', label: 'Закат', emoji: '🌅' }, { key: 'food', label: 'Поесть', emoji: '🍜' }, { key: 'active', label: 'Активно', emoji: '🏄' },
        { key: 'cozy', label: 'Уютно', emoji: '🛋️' }, { key: 'explore', label: 'Разведать', emoji: '🧭' }, { key: 'surprise', label: 'Сюрприз', emoji: '🎁' },
      ],
      ideas: [
        { id: 'promthep', title: 'Закат на мысе Промтеп', emoji: '🌅', category: 'sunset', duration: 120, bestTime: 'sunset', area: 'Раваи', description: 'Приехать за полчаса до заката, занять камень повыше и смотреть, как солнце падает в море. Плед и манго обязательны.' },
        { id: 'karon-view', title: 'Смотровая Карон', emoji: '🔭', category: 'sunset', duration: 60, bestTime: 'sunset', area: 'Карон', description: 'Три пляжа в одном кадре. Быстро, красиво, по дороге домой.' },
        { id: 'rawai-seafood', title: 'Морепродукты на Раваи', emoji: '🦐', category: 'food', duration: 120, bestTime: 'evening', area: 'Раваи', description: 'Выбрать креветок на рынке, отдать в кафе напротив, сесть у воды.' },
        { id: 'chillva', title: 'Ночной рынок Чиллва', emoji: '🍢', category: 'food', duration: 120, bestTime: 'evening', area: 'Пхукет-таун', description: 'Шашлычки, роти, живая музыка. Идти голодными.' },
        { id: 'kata-surf', title: 'Сёрф на Кате', emoji: '🏄', category: 'active', duration: 180, bestTime: 'morning', area: 'Ката', description: 'Волны мягкие, падать вдвоём веселее.' },
        { id: 'aopor-kayak', title: 'Каяки в Ао Пор', emoji: '🛶', category: 'active', duration: 180, bestTime: 'morning', area: 'Ао Пор', description: 'Тихая бухта, мангры и обезьяны на берегу.' },
        { id: 'cinema', title: 'Кино в Central Festival', emoji: '🎬', category: 'cozy', duration: 150, bestTime: 'evening', area: 'Пхукет-таун', description: 'Кондиционер, попкорн, последний ряд.' },
        { id: 'spa', title: 'Парный массаж', emoji: '💆', category: 'cozy', duration: 90, bestTime: 'any', area: 'Раваи', description: 'Час тишины рядом — и понедельник не страшен.' },
        { id: 'old-town', title: 'Прогулка по Старому городу', emoji: '🏮', category: 'explore', duration: 150, bestTime: 'evening', area: 'Пхукет-таун', description: 'Сино-португальские фасады, кофейни и уличное искусство.' },
        { id: 'surprise', title: 'Сюрприз: я всё придумаю', emoji: '🎁', category: 'surprise', duration: 120, bestTime: 'any', area: 'где-то на острове', description: 'Освободи время, остальное — моя забота.' },
      ],
      lines: ['Вечер свободен у обоих — это знак.', 'У вас окошко. Заполнить его чем-то вкусным?', 'Два свободных человека и один остров.', 'Самое время позвать на закат.'],
    };
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const userBusy = (key, date) => {
      const wd = weekdayOf(date);
      const out = M.activities.filter((a) => a.userKey === key && ((a.kind === 'recurring' && a.weekday === wd) || (a.kind === 'once' && a.date === date)))
        .map((a) => ({ id: `a:${a.id}`, start: a.start, end: a.end, title: a.title, source: 'activity', kind: a.kind, userKey: key, editable: true }));
      M.google.filter((g) => g.userKey === key && g.date === date).forEach((g) => out.push({ id: g.id, start: g.start, end: g.end, title: g.title, source: 'google', kind: 'once', userKey: key, editable: false }));
      M.dates.filter((d) => d.status === 'accepted' && d.date === date).forEach((d) => out.push({ id: `d:${d.id}`, start: d.start, end: d.end, title: d.title, source: 'date', kind: 'once', userKey: key, editable: false }));
      return out.sort((a, b) => a.start - b.start);
    };
    const commonFree = (date) => {
      const busy = [...userBusy('yana', date), ...userBusy('vova', date)].sort((a, b) => a.start - b.start);
      const out = []; let cur = 480;
      busy.forEach((b) => { if (b.start > cur && b.start - cur >= 30) out.push({ start: cur, end: Math.min(b.start, 1380) }); cur = Math.max(cur, b.end); });
      if (1380 - cur >= 30) out.push({ start: cur, end: 1380 });
      return out.filter((w) => w.end - w.start >= 30 && w.start < 1380);
    };
    const nextOcc = (mmdd) => { const y = +today.slice(0, 4); let c = `${y}-${mmdd}`; if (c < today) c = `${y + 1}-${mmdd}`; return { date: c, daysLeft: daysBetween(today, c) }; };
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    const err = (status, error, message) => Object.assign(new Error(message || error), { status, error });

    mockApi = async (path, opts = {}) => {
      await delay(120);
      const url = new URL(path, location.origin);
      const p = url.pathname, q = url.searchParams, method = opts.method || 'GET', body = opts.body || {};
      const me = USERS[asKey], partner = USERS[asKey === 'yana' ? 'vova' : 'yana'];
      let m;
      if (p === '/api/me') {
        const pets = M.petNames[asKey];
        const ann = nextOcc('09-21'), bd = nextOcc(partner.birthday), bdMe = nextOcc(me.birthday);
        return {
          me: clone(me), partner: clone(partner),
          callPartner: pets.length ? pets[Math.floor(Math.random() * pets.length)] : partner.name,
          petNames: clone(pets), petNameOptions: pets.length ? [] : clone(M.options),
          tz: 'Asia/Bangkok', today, nowMinutes: tzParts('Asia/Bangkok').minutes, awake: { start: 480, end: 1380 },
          countdowns: [
            { key: 'anniversary', label: 'Годовщина', date: ann.date, daysLeft: ann.daysLeft, emoji: '💞' },
            { key: `birthday_${partner.key}`, label: `День рождения ${GEN[partner.key]}`, date: bd.date, daysLeft: bd.daysLeft, emoji: '🎂' },
            { key: `birthday_${me.key}`, label: `День рождения ${GEN[me.key]}`, date: bdMe.date, daysLeft: bdMe.daysLeft, emoji: '🎈' },
          ].sort((a, b) => a.daysLeft - b.daysLeft),
          google: { connected: M.googleConnected !== false, owner: 'yana', canConnect: asKey === 'yana', email: M.googleConnected !== false ? 'yana@gmail.com' : undefined },
          appName: 'Вдвоём',
        };
      }
      if (p === '/api/week') {
        const start = q.get('start') || mondayOf(today);
        if (weekdayOf(start) !== 0) throw err(400, 'bad_start', 'start must be a Monday');
        return { start, days: Array.from({ length: 7 }, (_, i) => { const date = addDays(start, i); return { date, weekday: i, isToday: date === today, busy: { yana: userBusy('yana', date), vova: userBusy('vova', date) }, commonFree: commonFree(date), dates: clone(M.dates.filter((d) => d.date === date && (d.status === 'accepted' || d.status === 'pending'))) }; }) };
      }
      if (p === '/api/activities' && method === 'GET') return { activities: clone(M.activities) };
      if (p === '/api/activities' && method === 'POST') {
        if (!body.title || !(body.end > body.start)) throw err(400, 'validation', 'Проверь название и время');
        const a = { id: M.nextId++, userKey: body.userKey, title: body.title, kind: body.kind, weekday: body.kind === 'recurring' ? body.weekday : null, date: body.kind === 'once' ? body.date : null, start: body.start, end: body.end };
        M.activities.push(a); return { activity: clone(a) };
      }
      if ((m = /^\/api\/activities\/(\d+)$/.exec(p))) {
        const a = M.activities.find((x) => x.id === +m[1]); if (!a) throw err(404, 'not_found', 'Занятие не найдено');
        if (method === 'PATCH') { Object.assign(a, body); return { activity: clone(a) }; }
        if (method === 'DELETE') { M.activities = M.activities.filter((x) => x !== a); return { ok: true }; }
      }
      if (p === '/api/ideas') return { categories: clone(M.categories), ideas: clone(M.ideas) };
      if (p === '/api/ideas/pick') {
        const s = +q.get('start') || 480, e = +q.get('end') || 1380, len = e - s;
        const fits = (i) => (i.duration || 0) <= len + 30 && ({ sunset: s <= 1065 && e >= 1125, morning: s < 720, day: Math.min(e, 1020) - Math.max(s, 600) >= 60, evening: e > 1110, any: true }[i.bestTime] !== false);
        let pool = M.ideas.filter(fits); if (pool.length < 3) pool = pool.concat(M.ideas.filter((i) => !pool.includes(i)));
        const seed = (q.get('date') || today).split('-').reduce((a, b) => a + +b, 0) + s;
        const picked = pool.slice().sort((a, b) => ((seed * 31 + a.id.length) % 7) - ((seed * 31 + b.id.length) % 7)).slice(0, 3);
        return { ideas: clone(picked), line: M.lines[seed % M.lines.length] };
      }
      if (p === '/api/dates' && method === 'GET') return { dates: clone(M.dates.slice().sort((a, b) => b.id - a.id)) };
      if (p === '/api/dates' && method === 'POST') {
        if (!body.title || !body.date || !(body.end > body.start)) throw err(400, 'validation', 'Проверь поля приглашения');
        const d = { id: M.nextId++, fromKey: asKey, toKey: partner.key, title: body.title, emoji: body.emoji || '💌', date: body.date, start: body.start, end: body.end, note: body.note || '', status: 'pending', createdAt: new Date().toISOString() };
        M.dates.unshift(d); return { date: clone(d) };
      }
      if ((m = /^\/api\/dates\/(\d+)\/respond$/.exec(p))) {
        const d = M.dates.find((x) => x.id === +m[1]); if (!d) throw err(404, 'not_found', 'Приглашение не найдено');
        if (d.toKey !== asKey) throw err(403, 'not_invited', 'Ответить может только приглашённый');
        if (body.action === 'accept') d.status = 'accepted';
        else if (body.action === 'decline') d.status = 'declined';
        else if (body.action === 'counter') { Object.assign(d, { date: body.date, start: body.start, end: body.end, fromKey: d.toKey, toKey: d.fromKey, status: 'pending' }); }
        return { date: clone(d) };
      }
      if ((m = /^\/api\/dates\/(\d+)$/.exec(p)) && method === 'DELETE') { const d = M.dates.find((x) => x.id === +m[1]); if (d) d.status = 'cancelled'; return { ok: true }; }
      if (p === '/api/settings') {
        if (method === 'PATCH') M.petNames[asKey] = (body.petNames || []).map((s) => String(s).trim()).filter(Boolean);
        return { petNames: clone(M.petNames[asKey]), petNameOptions: M.petNames[asKey].length ? [] : clone(M.options) };
      }
      if (p === '/api/google/status') return { connected: M.googleConnected !== false, owner: 'yana', canConnect: asKey === 'yana', email: M.googleConnected !== false ? 'yana@gmail.com' : undefined };
      if (p === '/api/google/auth-url') return { url: 'https://accounts.google.com/o/oauth2/v2/auth?mock=1' };
      if (p === '/api/google' && method === 'DELETE') { M.googleConnected = false; M.google = []; return { ok: true }; }
      throw err(404, 'not_found', `Нет такого пути: ${p}`);
    };
  }

  // ---------- Boot ----------
  async function boot() {
    if (tg) {
      try { tg.ready(); tg.expand(); } catch (e) { /* noop */ }
      try { if (tg.colorScheme) document.documentElement.dataset.scheme = tg.colorScheme; } catch (e) { /* noop */ }
      try { tg.onEvent && tg.onEvent('themeChanged', () => { document.documentElement.dataset.scheme = tg.colorScheme; }); } catch (e) { /* noop */ }
      try { tg.MainButton.onClick(() => { if (S.primary && !S.primary.disabled) { haptic('medium'); S.primary.fn(); } }); } catch (e) { /* noop */ }
      try { tg.BackButton.onClick(goBack); } catch (e) { /* noop */ }
      try { tg.setHeaderColor && tg.setHeaderColor('bg_color'); tg.setBackgroundColor && tg.setBackgroundColor('secondary_bg_color'); } catch (e) { /* noop */ }
    }
    render();
    try {
      await loadMe();
      render();
      await loadWeek(S.weekStart);
      render();
      loadDates().then(render).catch(() => null);
    } catch (e) {
      if (e && e.silent) return;
      S.loadError = e && e.message ? e.message : 'Неизвестная ошибка';
      render();
    }
  }

  // Refresh when the app comes back to the foreground (e.g. after Google auth).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.me && !S.locked) {
      refreshWeeks().then(render).catch(() => null);
      if (S.me.google && !S.me.google.connected) refreshGoogle();
    }
  });

  // Keep the "now" line moving.
  setInterval(() => { if (S.me && !S.sheet && !S.view && S.tab === 'week' && S.selectedDate === S.today) render(); }, 60000);

  boot();
})();
