// Busy/free computation for the two of them.
import { AWAKE, MIN_FREE_WINDOW, USERS, GOOGLE_OWNER_KEY } from './config.js';
import { activitiesForDay, datesForDay } from './db.js';
import { eventsByDay } from './google.js';
import { addDays, weekdayOf, today, nowMinutes } from './time.js';

export function mergeIntervals(list) {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const out = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ start: iv.start, end: iv.end });
  }
  return out;
}

// Free windows inside [awake.start, awake.end] not covered by any busy interval.
export function freeWindows(busyLists, { awake = AWAKE, minLen = MIN_FREE_WINDOW, from = null } = {}) {
  const merged = mergeIntervals(busyLists.flat());
  const out = [];
  let cursor = Math.max(awake.start, from ?? awake.start);
  for (const iv of merged) {
    if (iv.end <= cursor) continue;
    if (iv.start > cursor) out.push({ start: cursor, end: Math.min(iv.start, awake.end) });
    cursor = Math.max(cursor, iv.end);
    if (cursor >= awake.end) break;
  }
  if (cursor < awake.end) out.push({ start: cursor, end: awake.end });
  return out.filter((w) => w.end - w.start >= minLen);
}

function activityToInterval(a) {
  return {
    id: `a:${a.id}`, start: a.start, end: a.end, title: a.title,
    source: 'activity', kind: a.kind, userKey: a.userKey, editable: true,
  };
}

// Builds busy map for one day given pre-fetched google events for that day.
export function dayBusy(dateStr, googleForDay = []) {
  const weekday = weekdayOf(dateStr);
  const busy = Object.fromEntries(USERS.map((u) => [u.key, []]));
  for (const a of activitiesForDay(dateStr, weekday)) busy[a.userKey]?.push(activityToInterval(a));
  for (const g of googleForDay) {
    busy[GOOGLE_OWNER_KEY]?.push({ ...g, source: 'google', kind: 'once', userKey: GOOGLE_OWNER_KEY, editable: false });
  }
  const dates = datesForDay(dateStr);
  for (const d of dates) {
    if (d.status !== 'accepted') continue;
    for (const u of USERS) {
      busy[u.key].push({
        id: `d:${d.id}`, start: d.start, end: d.end, title: `${d.emoji} ${d.title}`,
        source: 'date', kind: 'once', userKey: u.key, editable: false,
      });
    }
  }
  for (const k of Object.keys(busy)) busy[k].sort((a, b) => a.start - b.start);
  return { busy, dates };
}

export async function buildWeek(startDate) {
  const endDate = addDays(startDate, 6);
  let google = { days: {}, connected: false, error: null };
  try {
    google = await eventsByDay(startDate, endDate);
  } catch (e) {
    google = { days: {}, connected: true, error: String(e.message || e) };
  }
  const t = today();
  const days = [];
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    const { busy, dates } = dayBusy(d, google.days[d] || []);
    const commonFree = freeWindows(Object.values(busy));
    days.push({ date: d, weekday: weekdayOf(d), isToday: d === t, busy, commonFree, dates });
  }
  return { start: startDate, days, google: { connected: google.connected, error: google.error } };
}

// Upcoming windows when both are free, starting from now. Returns [{date, start, end}].
export async function nextCommonWindows({ days = 7, minLen = 60, limit = 6 } = {}) {
  const t = today();
  const endDate = addDays(t, days - 1);
  let google = { days: {} };
  try { google = await eventsByDay(t, endDate); } catch { /* fall back to manual schedule only */ }
  const out = [];
  for (let d = t; d <= endDate && out.length < limit; d = addDays(d, 1)) {
    const { busy } = dayBusy(d, google.days[d] || []);
    const from = d === t ? Math.ceil((nowMinutes() + 30) / 30) * 30 : null;
    for (const w of freeWindows(Object.values(busy), { minLen, from })) {
      out.push({ date: d, ...w });
      if (out.length >= limit) break;
    }
  }
  return out;
}

export async function dayOverview(dateStr) {
  let google = { days: {}, connected: false };
  try { google = await eventsByDay(dateStr, dateStr); } catch { /* ignore */ }
  const { busy, dates } = dayBusy(dateStr, google.days[dateStr] || []);
  return { date: dateStr, busy, dates, commonFree: freeWindows(Object.values(busy)), googleConnected: google.connected };
}
