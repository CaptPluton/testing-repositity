// Tasks with reminders. Due date/time are stored as typed, in the task's zone (tz).
import { TZ, USERS, isZone, zoneById, userByKey } from './config.js';
import * as db from './db.js';
import {
  isValidDate, fmtMin, fmtDateRu, zonedToMs, msToZoned, todayIn, addDays, addMonths, weekdayOf, relDayRu, today,
} from './time.js';

export const REPEATS = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];
export const ALL_DAY_REMIND_AT = 9 * 60; // all-day tasks remind at 09:00 in their zone
const STALE_MS = 6 * 3600 * 1000; // reminders older than this (e.g. after downtime) are skipped silently
const OWNERS = ['yana', 'vova', 'both'];

const bad = (message) => Object.assign(new Error(message), { status: 400 });

// ---- validation
export function normalizeInput(body, { partial = false, defaults = {} } = {}) {
  const out = {};
  const has = (k) => body[k] !== undefined;
  if (!partial || has('ownerKey')) {
    if (!OWNERS.includes(body.ownerKey)) throw bad('Кому задача: yana, vova или both');
    out.ownerKey = body.ownerKey;
  }
  if (!partial || has('title')) {
    const title = String(body.title || '').trim().slice(0, 120);
    if (!title) throw bad('Нужно название задачи');
    out.title = title;
  }
  if (has('note')) out.note = String(body.note || '').trim().slice(0, 500);
  if (has('dueDate')) {
    if (body.dueDate !== null && !isValidDate(body.dueDate)) throw bad('Дата в формате YYYY-MM-DD');
    out.dueDate = body.dueDate;
  }
  if (has('dueTime')) {
    if (body.dueTime !== null && !(Number.isInteger(body.dueTime) && body.dueTime >= 0 && body.dueTime < 1440)) throw bad('Время в минутах 0..1439');
    out.dueTime = body.dueTime;
  }
  if (has('tz') || !partial) {
    const tz = body.tz ?? defaults.tz ?? TZ;
    if (!isZone(tz)) throw bad('Неизвестный часовой пояс');
    out.tz = tz;
  }
  if (has('remind')) {
    if (!Array.isArray(body.remind)) throw bad('remind должен быть массивом минут');
    out.remind = [...new Set(body.remind.map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n <= 7 * 1440).sort((a, b) => a - b).slice(0, 6);
  }
  if (has('repeat') || !partial) {
    const r = body.repeat ?? 'none';
    if (!REPEATS.includes(r)) throw bad('Неизвестный повтор');
    out.repeat = r;
  }
  return out;
}

// ---- time math
function anchorMinutes(t) {
  return t.dueTime ?? ALL_DAY_REMIND_AT;
}
export function dueAtMs(t) {
  if (!t.dueDate) return null;
  return zonedToMs(t.dueDate, t.dueTime ?? 0, t.tz);
}
// The moment after which an open task counts as overdue.
function overdueAfterMs(t) {
  if (!t.dueDate) return null;
  return t.dueTime == null ? zonedToMs(addDays(t.dueDate, 1), 0, t.tz) : zonedToMs(t.dueDate, t.dueTime, t.tz);
}
function fireKey(t, offset) {
  return `${t.dueDate}|${t.dueTime ?? 'd'}|${offset}`;
}
export function reminderSchedule(t) {
  if (!t.dueDate) return [];
  const anchor = zonedToMs(t.dueDate, anchorMinutes(t), t.tz);
  return (t.remind || []).map((offset) => ({ offset, at: anchor - offset * 60000, key: fireKey(t, offset) }));
}

export function nextDueDate(t) {
  const d = t.dueDate;
  switch (t.repeat) {
    case 'daily': return addDays(d, 1);
    case 'weekly': return addDays(d, 7);
    case 'monthly': return addMonths(d, 1);
    case 'weekdays': {
      let n = addDays(d, 1);
      while (weekdayOf(n) > 4) n = addDays(n, 1);
      return n;
    }
    default: return null;
  }
}

// ---- presentation
function zoneShort(tz) {
  return zoneById(tz)?.short || tz;
}
export function dueLabel(t, { relative = false } = {}) {
  if (!t.dueDate) return null;
  const dayText = relative ? relDayRu(t.dueDate, todayIn(t.tz)) : fmtDateRu(t.dueDate);
  if (t.dueTime == null) return dayText;
  if (t.tz === TZ) return `${dayText} · ${fmtMin(t.dueTime)}`;
  const ph = msToZoned(zonedToMs(t.dueDate, t.dueTime, t.tz), TZ);
  const phText = ph.date === t.dueDate ? fmtMin(ph.minutes) : `${fmtMin(ph.minutes)} ${relative ? relDayRu(ph.date, today()) : fmtDateRu(ph.date)}`;
  return `${dayText} · ${fmtMin(t.dueTime)} ${zoneShort(t.tz)} (${phText} Пхукет)`;
}

export function present(t, nowMs = Date.now()) {
  const dueMs = dueAtMs(t);
  let duePhuket = null;
  if (t.dueDate) {
    duePhuket = t.dueTime == null
      ? { date: t.dueDate, minutes: null }
      : msToZoned(dueMs, TZ);
    if (duePhuket.minutes != null) duePhuket = { date: duePhuket.date, minutes: duePhuket.minutes };
  }
  const pending = reminderSchedule(t).filter((r) => !t.fired.includes(r.key)).map((r) => r.at);
  if (t.snoozeUntil) pending.push(t.snoozeUntil);
  const next = t.status === 'open' && pending.length ? Math.min(...pending) : null;
  const od = overdueAfterMs(t);
  return {
    id: t.id, ownerKey: t.ownerKey, createdBy: t.createdBy, title: t.title, note: t.note,
    dueDate: t.dueDate, dueTime: t.dueTime, tz: t.tz, remind: t.remind, repeat: t.repeat,
    status: t.status, doneAt: t.doneAt, doneBy: t.doneBy,
    snoozeUntil: t.snoozeUntil ? new Date(t.snoozeUntil).toISOString() : null,
    dueAt: dueMs != null ? new Date(dueMs).toISOString() : null,
    duePhuket,
    dueLabel: dueLabel(t),
    nextReminderAt: next != null ? new Date(next).toISOString() : null,
    overdue: t.status === 'open' && od != null && nowMs >= od,
    createdAt: t.createdAt,
  };
}

function sortKey(p) {
  if (p.status === 'done') return [3, -(Date.parse(p.doneAt || 0) || 0)];
  if (p.overdue) return [0, Date.parse(p.dueAt)];
  if (p.dueAt) return [1, Date.parse(p.dueAt) + (p.dueTime == null ? 86399000 : 0)];
  return [2, p.id];
}
export function listPresented(status = 'open', nowMs = Date.now()) {
  return db.listTasks(status).map((t) => present(t, nowMs)).sort((a, b) => {
    const ka = sortKey(a), kb = sortKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1];
  });
}

// Tasks due on a Phuket day, in Phuket minutes (null = all-day).
export function tasksForPhuketDays(startDate, endDate, nowMs = Date.now()) {
  const out = {};
  for (const t of db.listTasks('all')) {
    if (!t.dueDate) continue;
    const p = present(t, nowMs);
    const d = p.duePhuket.date;
    if (d < startDate || d > endDate) continue;
    (out[d] ||= []).push({ id: t.id, title: t.title, ownerKey: t.ownerKey, minutes: p.duePhuket.minutes, status: t.status, overdue: p.overdue });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => (a.minutes ?? -1) - (b.minutes ?? -1));
  return out;
}

// ---- mutations
const listeners = new Set();
export function onTaskEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); }
async function emit(type, task, extra = {}) {
  for (const fn of listeners) {
    try { await fn({ type, task, ...extra }); } catch (e) { console.error('task listener failed', e); }
  }
}

function withDefaults(input) {
  const t = { ...input };
  if (t.dueDate === undefined) t.dueDate = null;
  if (t.dueTime === undefined) t.dueTime = null;
  if (!t.dueDate) { t.dueTime = null; t.remind = []; }
  if (t.remind === undefined) t.remind = [0];
  if (t.repeat !== 'none' && !t.dueDate) t.repeat = 'none';
  return t;
}

export async function createTask(byKey, body, { defaultTz } = {}) {
  const input = withDefaults(normalizeInput(body || {}, { defaults: { tz: defaultTz } }));
  const t = db.insertTask({ ...input, createdBy: byKey });
  await emit('created', t, { byKey });
  return present(t);
}

export async function updateTaskById(id, byKey, body) {
  const cur = db.getTask(id);
  if (!cur) throw Object.assign(new Error('Задача не найдена'), { status: 404 });
  const patch = normalizeInput(body || {}, { partial: true });
  const next = { ...cur, ...patch };
  if (!next.dueDate) { next.dueTime = null; next.remind = []; next.repeat = 'none'; }
  const scheduleChanged = ['dueDate', 'dueTime', 'tz', 'remind'].some((k) => k in patch);
  if (scheduleChanged) { next.fired = []; next.snoozeUntil = null; }
  const t = db.updateTask(id, next);
  await emit('updated', t, { byKey });
  return present(t);
}

export async function completeTask(id, byKey, nowMs = Date.now()) {
  const cur = db.getTask(id);
  if (!cur) throw Object.assign(new Error('Задача не найдена'), { status: 404 });
  if (cur.repeat !== 'none' && cur.dueDate) {
    let nd = nextDueDate(cur);
    // skip occurrences that are already in the past
    while (nd && zonedToMs(nd, anchorMinutes(cur), cur.tz) < nowMs - 60000) nd = nextDueDate({ ...cur, dueDate: nd });
    const t = db.updateTask(id, { dueDate: nd, fired: [], snoozeUntil: null, status: 'open', doneAt: new Date(nowMs).toISOString(), doneBy: byKey });
    await emit('done', t, { byKey, rolled: true, previousDue: cur.dueDate });
    return present(t, nowMs);
  }
  const t = db.updateTask(id, { status: 'done', doneAt: new Date(nowMs).toISOString(), doneBy: byKey, snoozeUntil: null });
  await emit('done', t, { byKey, rolled: false });
  return present(t, nowMs);
}

export async function reopenTask(id, byKey) {
  const cur = db.getTask(id);
  if (!cur) throw Object.assign(new Error('Задача не найдена'), { status: 404 });
  const t = db.updateTask(id, { status: 'open', doneAt: null, doneBy: null });
  await emit('reopened', t, { byKey });
  return present(t);
}

export async function snoozeTask(id, minutes, nowMs = Date.now()) {
  const cur = db.getTask(id);
  if (!cur) throw Object.assign(new Error('Задача не найдена'), { status: 404 });
  const m = Number(minutes);
  if (!Number.isFinite(m) || m < 1 || m > 14 * 1440) throw bad('Отложить можно на 1 минуту … 14 дней');
  const t = db.updateTask(id, { snoozeUntil: nowMs + Math.round(m) * 60000, status: 'open' });
  return present(t, nowMs);
}

// Minutes from now until tomorrow at the task's time (or 09:00) in its zone.
export function minutesUntilTomorrow(t, nowMs = Date.now()) {
  const tz = t.tz || TZ;
  const tomorrow = addDays(msToZoned(nowMs, tz).date, 1);
  const at = zonedToMs(tomorrow, t.dueTime ?? ALL_DAY_REMIND_AT, tz);
  return Math.max(1, Math.round((at - nowMs) / 60000));
}

export async function removeTask(id, byKey) {
  const cur = db.getTask(id);
  if (!cur) throw Object.assign(new Error('Задача не найдена'), { status: 404 });
  db.deleteTask(id);
  await emit('deleted', cur, { byKey });
  return true;
}

// ---- reminder engine: returns the reminders to deliver now and marks them fired.
export function collectDueReminders(nowMs = Date.now()) {
  const out = [];
  for (const t0 of db.listTasks('open')) {
    let t = t0;
    // Roll repeating tasks forward when a whole period was missed.
    if (t.repeat !== 'none' && t.dueDate) {
      let guard = 0;
      let nd = nextDueDate(t);
      while (nd && zonedToMs(nd, anchorMinutes(t), t.tz) <= nowMs && guard++ < 400) {
        t = { ...t, dueDate: nd, fired: [] };
        nd = nextDueDate(t);
      }
      if (t !== t0) t = db.updateTask(t.id, { dueDate: t.dueDate, fired: [], snoozeUntil: t0.snoozeUntil });
    }
    const fired = new Set(t.fired);
    const now = [];
    for (const r of reminderSchedule(t)) {
      if (fired.has(r.key) || r.at > nowMs) continue;
      fired.add(r.key);
      if (nowMs - r.at <= STALE_MS) now.push(r);
    }
    let snoozed = false;
    if (t.snoozeUntil && t.snoozeUntil <= nowMs) snoozed = true;
    if (now.length || snoozed || fired.size !== t.fired.length) {
      t = db.updateTask(t.id, { fired: [...fired], snoozeUntil: snoozed ? null : t.snoozeUntil });
    }
    if (now.length || snoozed) {
      const offset = now.length ? Math.min(...now.map((r) => r.offset)) : 0;
      out.push({ task: t, offset, snoozed });
    }
  }
  return out;
}

export function ownerUsers(t) {
  return t.ownerKey === 'both' ? USERS : [userByKey(t.ownerKey)].filter(Boolean);
}

export function offsetText(offset) {
  if (!offset) return '';
  if (offset % 1440 === 0) return offset === 1440 ? 'завтра' : `через ${offset / 1440} дн.`;
  if (offset % 60 === 0) return offset === 60 ? 'через час' : `через ${offset / 60} ч`;
  return `через ${offset} мин`;
}
