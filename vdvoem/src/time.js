import { TZ } from './config.js';

const pad = (n) => String(n).padStart(2, '0');

// Returns {date:'YYYY-MM-DD', minutes, weekday(0=Mon)} for a JS Date in TZ.
export function partsInTz(d = new Date(), tz = TZ) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, minutes: hour * 60 + Number(p.minute), weekday: weekdayOf(date) };
}

export function today() {
  return partsInTz().date;
}
export function nowMinutes() {
  return partsInTz().minutes;
}

// weekday with Monday = 0 … Sunday = 6
export function weekdayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return (d.getUTCDay() + 6) % 7;
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(dateStr) {
  return addDays(dateStr, -weekdayOf(dateStr));
}

export function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function fmtMin(m) {
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function parseHHMM(s) {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 24 || mi > 59) return null;
  return h * 60 + mi;
}

// Fixed-offset ISO string for Google (Asia/Bangkok has no DST).
export function tzOffsetString(dateStr, tz = TZ) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' });
  const part = fmt.formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || 'GMT+00:00';
  const m = /GMT([+-]\d{2}:\d{2})?/.exec(part);
  return m && m[1] ? m[1] : '+00:00';
}

export function toIso(dateStr, minutes) {
  return `${dateStr}T${fmtMin(minutes)}:00${tzOffsetString(dateStr)}`;
}

// Converts an ISO datetime into local {date, minutes} in TZ.
export function fromIso(iso) {
  return partsInTz(new Date(iso));
}

export const WEEKDAYS_RU = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
export const WEEKDAYS_RU_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
export const MONTHS_RU_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function fmtDateRu(dateStr, { withWeekday = true } = {}) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = `${d} ${MONTHS_RU_GEN[m - 1]}`;
  return withWeekday ? `${WEEKDAYS_RU_SHORT[weekdayOf(dateStr)]}, ${base}` : base;
}

export function fmtDuration(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}

// Next occurrence (>= today) of an MM-DD anniversary; returns {date, daysLeft}.
export function nextOccurrence(mmdd, fromDate = today()) {
  const [y] = fromDate.split('-').map(Number);
  let candidate = `${y}-${mmdd}`;
  if (candidate < fromDate) candidate = `${y + 1}-${mmdd}`;
  const daysLeft = Math.round((Date.parse(`${candidate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000);
  return { date: candidate, daysLeft };
}

// ---- multi-zone helpers (offsets are read per date, so DST zones would also work)
export function offsetMin(dateStr, tz = TZ) {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(tzOffsetString(dateStr, tz));
  if (!m) return 0;
  const v = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === '-' ? -v : v;
}

export function todayIn(tz = TZ) {
  return partsInTz(new Date(), tz).date;
}

// Local wall time (date + minutes) in `tz` -> epoch milliseconds.
export function zonedToMs(dateStr, minutes, tz = TZ) {
  return Date.parse(`${dateStr}T00:00:00Z`) + (minutes - offsetMin(dateStr, tz)) * 60000;
}

// Epoch milliseconds -> {date, minutes, weekday} in `tz`.
export function msToZoned(ms, tz = TZ) {
  return partsInTz(new Date(ms), tz);
}

export function convertWallTime(dateStr, minutes, fromTz, toTz = TZ) {
  return msToZoned(zonedToMs(dateStr, minutes, fromTz), toTz);
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

export function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

// "сегодня" / "завтра" / "вчера" / "пт, 16 октября" relative to `ref`.
export function relDayRu(dateStr, ref = today()) {
  const diff = daysBetween(ref, dateStr);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  if (diff === -1) return 'вчера';
  return fmtDateRu(dateStr);
}
