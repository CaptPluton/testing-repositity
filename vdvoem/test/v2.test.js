import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISABLE_BOT = '1';
process.env.BOT_TOKEN = '123456:TESTTOKEN';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vdvoem-v2-'));

const { signInitData } = await import('../src/web/initdata.js');
const { createApp } = await import('../src/web/server.js');
const { openDb } = await import('../src/db.js');
const { activityPartsOnDay } = await import('../src/schedule.js');
const { zonedToMs, msToZoned, offsetMin } = await import('../src/time.js');
const tasks = await import('../src/tasks.js');
const { parseCommand } = await import('../src/bot/parser.js');

const TOKEN = process.env.BOT_TOKEN;
const yana = signInitData({ id: 573832468, first_name: 'Yana' }, TOKEN);
const vova = signInitData({ id: 481730749, first_name: 'Vova' }, TOKEN);
let server, base;
before(async () => {
  openDb();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); });
const call = (initData, method, url, body) => fetch(base + url, {
  method, headers: { 'content-type': 'application/json', 'X-Telegram-Init-Data': initData }, body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

test('zone offsets: Moscow +3, Phuket +7', () => {
  assert.equal(offsetMin('2026-10-14', 'Europe/Moscow'), 180);
  assert.equal(offsetMin('2026-10-14', 'Asia/Bangkok'), 420);
  const ms = zonedToMs('2026-10-14', 14 * 60, 'Europe/Moscow');
  assert.deepEqual({ ...msToZoned(ms, 'Asia/Bangkok') }, { date: '2026-10-14', minutes: 18 * 60, weekday: 2 });
});

test('МСК activity lands 4h later on the Phuket timeline, late ones split across midnight', () => {
  const call14 = { id: 1, userKey: 'yana', title: 'Созвон', kind: 'recurring', weekday: 0, start: 840, end: 900, tz: 'Europe/Moscow' };
  const [p] = activityPartsOnDay(call14, '2026-10-12'); // Monday
  assert.equal(p.start, 1080); assert.equal(p.end, 1140); assert.equal(p.origLabel, '14:00–15:00 МСК'); assert.equal(p.part, null);
  const late = { id: 2, userKey: 'yana', title: 'Поздний', kind: 'once', date: '2026-10-12', start: 19 * 60 + 30, end: 20 * 60 + 30, tz: 'Europe/Moscow' };
  const mon = activityPartsOnDay(late, '2026-10-12');
  const tue = activityPartsOnDay(late, '2026-10-13');
  assert.deepEqual([mon[0].start, mon[0].end, mon[0].part], [23 * 60 + 30, 1440, 'start']);
  assert.deepEqual([tue[0].start, tue[0].end, tue[0].part], [0, 30, 'end']);
  const night = { id: 3, userKey: 'yana', title: 'Ночной', kind: 'recurring', weekday: 0, start: 21 * 60, end: 22 * 60, tz: 'Europe/Moscow' };
  assert.equal(activityPartsOnDay(night, '2026-10-12').length, 0, 'Mon 21:00 МСК is Tue 01:00 in Phuket');
  assert.equal(activityPartsOnDay(night, '2026-10-13')[0].start, 60);
});

test('api: МСК activity in week + settings prefs', async () => {
  const me = await call(yana, 'GET', '/api/me');
  assert.equal(me.json.zones.length, 2);
  assert.equal(me.json.zones.find((z) => z.id === 'Europe/Moscow').offsetMin, 180);
  const c = await call(yana, 'POST', '/api/activities', { userKey: 'yana', title: 'Созвон с командой', kind: 'recurring', weekday: 0, start: 840, end: 900, tz: 'Europe/Moscow' });
  assert.equal(c.status, 201); assert.equal(c.json.activity.tz, 'Europe/Moscow');
  assert.equal((await call(yana, 'POST', '/api/activities', { userKey: 'yana', title: 'x', kind: 'once', date: '2026-10-13', start: 1, end: 2, tz: 'Mars/Base' })).status, 400);
  const w = await call(yana, 'GET', '/api/week?start=2026-10-12');
  const blk = w.json.days[0].busy.yana.find((b) => b.activityId === c.json.activity.id);
  assert.equal(blk.start, 1080); assert.equal(blk.orig.start, 840); assert.equal(blk.tz, 'Europe/Moscow');
  const s = await call(yana, 'PATCH', '/api/settings', { inputTz: 'Europe/Moscow', showSecondTz: true });
  assert.equal(s.json.inputTz, 'Europe/Moscow'); assert.equal(s.json.showSecondTz, true);
  assert.equal((await call(vova, 'GET', '/api/settings')).json.inputTz, 'Asia/Bangkok');
  assert.equal((await call(yana, 'PATCH', '/api/settings', { inputTz: 'bad' })).status, 400);
});

test('api: tasks CRUD, defaults, done/undo/snooze, week integration', async () => {
  const c = await call(yana, 'POST', '/api/tasks', { ownerKey: 'vova', title: 'Купить цветы', dueDate: '2026-10-16', dueTime: 600, tz: 'Europe/Moscow' });
  assert.equal(c.status, 201);
  const t = c.json.task;
  assert.deepEqual(t.remind, [0]); assert.equal(t.createdBy, 'yana');
  assert.deepEqual(t.duePhuket, { date: '2026-10-16', minutes: 840 });
  assert.match(t.dueLabel, /10:00 МСК \(14:00 Пхукет\)/);
  const nodate = await call(vova, 'POST', '/api/tasks', { ownerKey: 'both', title: 'Придумать отпуск' });
  assert.equal(nodate.json.task.dueDate, null); assert.deepEqual(nodate.json.task.remind, []); assert.equal(nodate.json.task.tz, 'Asia/Bangkok');
  assert.equal((await call(yana, 'POST', '/api/tasks', { ownerKey: 'x', title: 'a' })).status, 400);
  assert.equal((await call(yana, 'POST', '/api/tasks', { ownerKey: 'yana', title: '' })).status, 400);

  const w = await call(yana, 'GET', '/api/week?start=2026-10-12');
  assert.ok(w.json.days[4].tasks.some((x) => x.id === t.id && x.minutes === 840));

  const p = await call(vova, 'PATCH', `/api/tasks/${t.id}`, { remind: [60, 0, 0] });
  assert.deepEqual(p.json.task.remind, [0, 60]);
  const d = await call(vova, 'POST', `/api/tasks/${t.id}/done`);
  assert.equal(d.json.task.status, 'done'); assert.equal(d.json.task.doneBy, 'vova');
  assert.ok((await call(yana, 'GET', '/api/tasks?status=done')).json.tasks.some((x) => x.id === t.id));
  assert.equal((await call(yana, 'POST', `/api/tasks/${t.id}/undo`)).json.task.status, 'open');
  const sn = await call(yana, 'POST', `/api/tasks/${t.id}/snooze`, { minutes: 15 });
  assert.ok(sn.json.task.snoozeUntil);
  assert.equal((await call(yana, 'POST', `/api/tasks/${t.id}/snooze`, { minutes: 0 })).status, 400);
  assert.equal((await call(yana, 'DELETE', `/api/tasks/${t.id}`)).json.ok, true);
  assert.equal((await call(yana, 'DELETE', `/api/tasks/${t.id}`)).status, 404);
});

test('repeating task rolls forward on done and skips weekends for weekdays', async () => {
  const fri = await call(yana, 'POST', '/api/tasks', { ownerKey: 'yana', title: 'Стендап', dueDate: '2026-10-16', dueTime: 570, tz: 'Europe/Moscow', repeat: 'weekdays' });
  const nowMs = Date.parse('2026-10-16T08:00:00Z');
  const done = await tasks.completeTask(fri.json.task.id, 'yana', nowMs);
  assert.equal(done.status, 'open'); assert.equal(done.dueDate, '2026-10-19'); // Monday
  const monthly = await tasks.createTask('yana', { ownerKey: 'both', title: 'Аренда', dueDate: '2026-01-31', repeat: 'monthly' });
  assert.equal(tasks.nextDueDate({ ...monthly, dueDate: '2026-01-31' }), '2026-02-28');
});

test('reminder engine fires once per offset, honours snooze and skips stale ones', async () => {
  const p = await tasks.createTask('vova', { ownerKey: 'yana', title: 'Позвонить маме', dueDate: '2026-11-02', dueTime: 600, tz: 'Europe/Moscow', remind: [0, 60] });
  const due = Date.parse('2026-11-02T07:00:00Z'); // 10:00 МСК
  const ids = (list) => list.filter((r) => r.task.id === p.id);
  assert.equal(ids(tasks.collectDueReminders(due - 61 * 60000)).length, 0);
  const first = ids(tasks.collectDueReminders(due - 59 * 60000));
  assert.equal(first.length, 1); assert.equal(first[0].offset, 60);
  assert.equal(ids(tasks.collectDueReminders(due - 58 * 60000)).length, 0, 'no duplicate');
  const atDue = ids(tasks.collectDueReminders(due + 30000));
  assert.equal(atDue.length, 1); assert.equal(atDue[0].offset, 0);
  await tasks.snoozeTask(p.id, 15, due + 60000);
  assert.equal(ids(tasks.collectDueReminders(due + 10 * 60000)).length, 0);
  const sn = ids(tasks.collectDueReminders(due + 17 * 60000));
  assert.equal(sn.length, 1); assert.equal(sn[0].snoozed, true);
  const old = await tasks.createTask('vova', { ownerKey: 'vova', title: 'Старое', dueDate: '2026-01-01', dueTime: 600 });
  assert.equal(ids(tasks.collectDueReminders(Date.parse('2026-11-02T07:00:00Z'))).length, 0);
  assert.equal(tasks.collectDueReminders(Date.parse('2026-11-02T07:00:00Z')).filter((r) => r.task.id === old.id).length, 0, 'stale reminder skipped');
  assert.equal(tasks.present((await import('../src/db.js')).getTask(old.id)).overdue, true);
});

test('daily repeating task rolls over missed days instead of piling up', async () => {
  const p = await tasks.createTask('yana', { ownerKey: 'yana', title: 'Витамины', dueDate: '2026-11-10', dueTime: 540, repeat: 'daily' });
  const r = tasks.collectDueReminders(Date.parse('2026-11-13T02:05:00Z')).filter((x) => x.task.id === p.id); // 09:05 Phuket on the 13th
  assert.equal(r.length, 1);
  assert.equal(r[0].task.dueDate, '2026-11-13');
});

test('parser: reminders and МСК', () => {
  const a = parseCommand('напомни мне завтра в 10 по мск позвонить маме', { senderKey: 'yana' });
  assert.equal(a.intent, 'remind'); assert.equal(a.tz, 'Europe/Moscow'); assert.equal(a.dueTime, 600); assert.equal(a.title, 'Позвонить маме');
  const b = parseCommand('напомни Вове в пятницу купить цветы', { senderKey: 'yana' });
  assert.equal(b.ownerKey, 'vova'); assert.equal(b.dueTime, null); assert.equal(b.title, 'Купить цветы');
  assert.equal(parseCommand('напомни нам в субботу в 12:00 оплатить аренду', { senderKey: 'yana' }).ownerKey, 'both');
  assert.equal(parseCommand('напоминай каждый день в 9 пить витамины', { senderKey: 'vova' }).repeat, 'daily');
  assert.equal(parseCommand('напомни по будням в 9:30 по мск стендап', { senderKey: 'yana' }).repeat, 'weekdays');
  assert.equal(parseCommand('напомни купить хлеб', { senderKey: 'yana' }).dueDate, null);
  const add = parseCommand('поставь мне созвон с командой каждый понедельник 14:00-15:00 по мск', { senderKey: 'yana' });
  assert.equal(add.tz, 'Europe/Moscow'); assert.equal(add.kind, 'recurring'); assert.equal(add.title, 'Созвон с командой');
  assert.equal(parseCommand('задачи', { senderKey: 'yana' }).intent, 'tasks');
});

test('English reschedule migration: weeks of 12.10, 19.10, 26.10 and 2.11', async () => {
  const w = async (start) => (await call(yana, 'GET', `/api/week?start=${start}`)).json.days
    .map((d) => d.busy.yana.filter((b) => /Англ/i.test(b.title)).map((b) => `${d.date.slice(5)} ${b.start / 60}-${b.end / 60}`)).flat();
  assert.deepEqual(await w('2026-10-12'), ['10-12 12-14', '10-14 12-14', '10-17 13-15']);
  assert.deepEqual(await w('2026-10-19'), ['10-19 10-12', '10-21 10-12', '10-24 13-15']);
  assert.deepEqual(await w('2026-10-26'), ['10-27 10-12', '10-28 10-12', '10-31 9-11']);
  assert.deepEqual(await w('2026-11-02'), ['11-02 10-12', '11-04 10-12', '11-07 9-11']);
  const again = (await import('../src/db.js'));
  const before = again.listActivities().length;
  again.openDb(); // reopening must not re-apply
  assert.equal(again.listActivities().length, before);
  assert.equal((await call(yana, 'PATCH', `/api/activities/${again.listActivities().find((a) => a.validFrom).id}`, { validUntil: '2020-01-01' })).status, 400);
});
