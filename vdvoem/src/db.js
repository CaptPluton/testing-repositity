import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { ENV, USERS } from './config.js';

let db;

export function openDb() {
  if (db) return db;
  fs.mkdirSync(ENV.dataDir, { recursive: true });
  db = new DatabaseSync(path.join(ENV.dataDir, 'vdvoem.sqlite'));
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_key TEXT NOT NULL,
      title TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('recurring','once')),
      weekday INTEGER,
      date TEXT,
      start INTEGER NOT NULL,
      end INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS dates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_key TEXT NOT NULL,
      to_key TEXT NOT NULL,
      title TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '💞',
      date TEXT NOT NULL,
      start INTEGER NOT NULL,
      end INTEGER NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      gcal_event_id TEXT,
      chat_id TEXT,
      message_id INTEGER,
      reminded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_key TEXT NOT NULL,
      created_by TEXT NOT NULL,
      title TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      due_time INTEGER,
      tz TEXT NOT NULL DEFAULT 'Asia/Bangkok',
      remind TEXT NOT NULL DEFAULT '[]',
      repeat TEXT NOT NULL DEFAULT 'none',
      status TEXT NOT NULL DEFAULT 'open',
      done_at TEXT,
      done_by TEXT,
      snooze_until INTEGER,
      fired TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      user_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
  migrate();
  seedDefaults();
  return db;
}

function migrate() {
  const cols = db.prepare('PRAGMA table_info(activities)').all().map((c) => c.name);
  if (!cols.includes('tz')) db.exec("ALTER TABLE activities ADD COLUMN tz TEXT NOT NULL DEFAULT 'Asia/Bangkok'");
}

function seedDefaults() {
  if (getSetting('seeded')) return;
  const yana = USERS.find((u) => u.key === 'yana');
  const vova = USERS.find((u) => u.key === 'vova');
  const add = (userKey, title, weekday, start, end) =>
    insertActivity({ userKey, title, kind: 'recurring', weekday, date: null, start, end });
  if (yana) {
    add('yana', 'Английский', 0, 12 * 60, 14 * 60);
    add('yana', 'Английский', 2, 12 * 60, 14 * 60);
    add('yana', 'Английский', 5, 13 * 60, 15 * 60);
    add('yana', 'Муай-тай', 4, 11 * 60, 12 * 60);
  }
  if (vova) {
    add('vova', 'Психолог', 0, 11 * 60, 11 * 60 + 55);
    add('vova', 'Психолог', 2, 10 * 60 + 30, 11 * 60 + 25);
    add('vova', 'Психолог', 4, 10 * 60, 10 * 60 + 55);
  }
  setSetting('seeded', '1');
}

// ---- settings
export function getSetting(key) {
  const row = openDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}
export function setSetting(key, value) {
  openDb().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}
export function delSetting(key) {
  openDb().prepare('DELETE FROM settings WHERE key = ?').run(key);
}
export function getJson(key, fallback = null) {
  const v = getSetting(key);
  if (v == null) return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}
export function setJson(key, obj) {
  setSetting(key, JSON.stringify(obj));
}

// ---- activities
const rowToActivity = (r) => r && ({
  id: r.id, userKey: r.user_key, title: r.title, kind: r.kind,
  weekday: r.weekday, date: r.date, start: r.start, end: r.end, tz: r.tz || 'Asia/Bangkok',
});

export function listActivities() {
  return openDb().prepare('SELECT * FROM activities ORDER BY kind, weekday, date, start').all().map(rowToActivity);
}
export function getActivity(id) {
  return rowToActivity(openDb().prepare('SELECT * FROM activities WHERE id = ?').get(id));
}
export function insertActivity(a) {
  const info = openDb().prepare(
    'INSERT INTO activities(user_key,title,kind,weekday,date,start,end,tz) VALUES(?,?,?,?,?,?,?,?)',
  ).run(a.userKey, a.title, a.kind, a.kind === 'recurring' ? a.weekday : null, a.kind === 'once' ? a.date : null, a.start, a.end, a.tz || 'Asia/Bangkok');
  return getActivity(info.lastInsertRowid);
}
export function updateActivity(id, patch) {
  const cur = getActivity(id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  openDb().prepare(
    'UPDATE activities SET user_key=?, title=?, kind=?, weekday=?, date=?, start=?, end=?, tz=? WHERE id=?',
  ).run(next.userKey, next.title, next.kind, next.kind === 'recurring' ? next.weekday : null, next.kind === 'once' ? next.date : null, next.start, next.end, next.tz || 'Asia/Bangkok', id);
  return getActivity(id);
}
export function deleteActivity(id) {
  return openDb().prepare('DELETE FROM activities WHERE id = ?').run(id).changes > 0;
}

// ---- dates
const rowToDate = (r) => r && ({
  id: r.id, fromKey: r.from_key, toKey: r.to_key, title: r.title, emoji: r.emoji,
  date: r.date, start: r.start, end: r.end, note: r.note || '', status: r.status,
  gcalEventId: r.gcal_event_id, chatId: r.chat_id, messageId: r.message_id, reminded: !!r.reminded,
  createdAt: r.created_at,
});

export function listDates() {
  return openDb().prepare('SELECT * FROM dates ORDER BY id DESC').all().map(rowToDate);
}
export function getDate(id) {
  return rowToDate(openDb().prepare('SELECT * FROM dates WHERE id = ?').get(id));
}
export function insertDate(d) {
  const info = openDb().prepare(
    'INSERT INTO dates(from_key,to_key,title,emoji,date,start,end,note,status) VALUES(?,?,?,?,?,?,?,?,?)',
  ).run(d.fromKey, d.toKey, d.title, d.emoji || '💞', d.date, d.start, d.end, d.note || '', d.status || 'pending');
  return getDate(info.lastInsertRowid);
}
export function updateDate(id, patch) {
  const cur = getDate(id);
  if (!cur) return null;
  const n = { ...cur, ...patch };
  openDb().prepare(
    'UPDATE dates SET from_key=?, to_key=?, title=?, emoji=?, date=?, start=?, end=?, note=?, status=?, gcal_event_id=?, chat_id=?, message_id=?, reminded=? WHERE id=?',
  ).run(n.fromKey, n.toKey, n.title, n.emoji, n.date, n.start, n.end, n.note, n.status, n.gcalEventId || null, n.chatId || null, n.messageId || null, n.reminded ? 1 : 0, id);
  return getDate(id);
}
export function datesForDay(dateStr) {
  return openDb().prepare("SELECT * FROM dates WHERE date=? AND status IN ('pending','accepted') ORDER BY start").all(dateStr).map(rowToDate);
}
export function upcomingAcceptedDates(fromDate) {
  return openDb().prepare("SELECT * FROM dates WHERE status='accepted' AND date>=? ORDER BY date, start").all(fromDate).map(rowToDate);
}

// ---- tasks
const parseJson = (v, fb) => { try { const x = JSON.parse(v); return x ?? fb; } catch { return fb; } };
const rowToTask = (r) => r && ({
  id: r.id, ownerKey: r.owner_key, createdBy: r.created_by, title: r.title, note: r.note || '',
  dueDate: r.due_date || null, dueTime: r.due_time ?? null, tz: r.tz || 'Asia/Bangkok',
  remind: parseJson(r.remind, []), repeat: r.repeat || 'none', status: r.status,
  doneAt: r.done_at || null, doneBy: r.done_by || null, snoozeUntil: r.snooze_until ?? null,
  fired: parseJson(r.fired, []), createdAt: r.created_at,
});

export function listTasks(status = 'open') {
  const q = status === 'all' ? 'SELECT * FROM tasks' : 'SELECT * FROM tasks WHERE status = ?';
  const st = openDb().prepare(`${q} ORDER BY id`);
  return (status === 'all' ? st.all() : st.all(status)).map(rowToTask);
}
export function getTask(id) {
  return rowToTask(openDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id));
}
export function insertTask(t) {
  const info = openDb().prepare(
    'INSERT INTO tasks(owner_key,created_by,title,note,due_date,due_time,tz,remind,repeat,status) VALUES(?,?,?,?,?,?,?,?,?,?)',
  ).run(t.ownerKey, t.createdBy, t.title, t.note || '', t.dueDate ?? null, t.dueTime ?? null, t.tz || 'Asia/Bangkok',
    JSON.stringify(t.remind || []), t.repeat || 'none', 'open');
  return getTask(info.lastInsertRowid);
}
export function updateTask(id, patch) {
  const cur = getTask(id);
  if (!cur) return null;
  const n = { ...cur, ...patch };
  openDb().prepare(
    'UPDATE tasks SET owner_key=?, title=?, note=?, due_date=?, due_time=?, tz=?, remind=?, repeat=?, status=?, done_at=?, done_by=?, snooze_until=?, fired=? WHERE id=?',
  ).run(n.ownerKey, n.title, n.note || '', n.dueDate ?? null, n.dueTime ?? null, n.tz, JSON.stringify(n.remind || []), n.repeat,
    n.status, n.doneAt ?? null, n.doneBy ?? null, n.snoozeUntil ?? null, JSON.stringify(n.fired || []), id);
  return getTask(id);
}
export function deleteTask(id) {
  return openDb().prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0;
}

// ---- oauth
export function putOauthState(state, userKey) {
  openDb().prepare('INSERT OR REPLACE INTO oauth_states(state,user_key) VALUES(?,?)').run(state, userKey);
}
export function takeOauthState(state) {
  const row = openDb().prepare('SELECT * FROM oauth_states WHERE state=?').get(state);
  if (row) openDb().prepare('DELETE FROM oauth_states WHERE state=?').run(state);
  openDb().prepare("DELETE FROM oauth_states WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 hour')").run();
  return row ? row.user_key : null;
}
