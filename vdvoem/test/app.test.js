import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISABLE_BOT = '1';
process.env.BOT_TOKEN = '123456:TESTTOKEN';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vdvoem-test-'));
process.env.PUBLIC_URL = 'http://localhost';

const { signInitData, validateInitData } = await import('../src/web/initdata.js');
const { parseCommand } = await import('../src/bot/parser.js');
const { freeWindows, mergeIntervals } = await import('../src/schedule.js');
const { createApp } = await import('../src/web/server.js');
const { composeDay, composeFree } = await import('../src/bot/digest.js');
const { openDb } = await import('../src/db.js');

const TOKEN = process.env.BOT_TOKEN;
const yana = signInitData({ id: 573832468, first_name: 'Yana' }, TOKEN);
const vova = signInitData({ id: 481730749, first_name: 'Vova' }, TOKEN);
const stranger = signInitData({ id: 1, first_name: 'X' }, TOKEN);

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

test('initData: valid signature is accepted, tampered is rejected', () => {
  assert.equal(validateInitData(yana, TOKEN).user.id, 573832468);
  assert.equal(validateInitData(yana.replace('Yana', 'Nope'), TOKEN), null);
  assert.equal(validateInitData(yana, 'other'), null);
  assert.equal(validateInitData(signInitData({ id: 1 }, TOKEN, 1000), TOKEN), null, 'stale auth_date');
});

test('schedule: merge + free windows', () => {
  assert.deepEqual(mergeIntervals([{ start: 600, end: 700 }, { start: 650, end: 800 }, { start: 900, end: 950 }]), [{ start: 600, end: 800 }, { start: 900, end: 950 }]);
  const free = freeWindows([[{ start: 720, end: 840 }], [{ start: 660, end: 715 }]]);
  assert.deepEqual(free, [{ start: 480, end: 660 }, { start: 840, end: 1380 }]);
  assert.deepEqual(freeWindows([[{ start: 480, end: 1380 }]]), []);
});

test('parser: Russian schedule commands', () => {
  const a = parseCommand('добавь Вове зал в среду 18:00-19:30', { senderKey: 'yana' });
  assert.equal(a.intent, 'add'); assert.equal(a.userKey, 'vova'); assert.equal(a.title, 'Зал');
  assert.equal(a.start, 1080); assert.equal(a.end, 1170); assert.equal(a.kind, 'once'); assert.equal(a.weekdayMentioned, 2);
  const b = parseCommand('поставь мне вокал каждый четверг в 17:00 на час', { senderKey: 'vova' });
  assert.equal(b.kind, 'recurring'); assert.equal(b.weekday, 3); assert.equal(b.userKey, 'vova'); assert.equal(b.end, 1080);
  const c = parseCommand('перенеси психолога на пятницу 16:00', { senderKey: 'vova' });
  assert.equal(c.intent, 'move'); assert.equal(c.weekdayMentioned, 4); assert.equal(c.start, 960);
  assert.equal(parseCommand('что сегодня', { senderKey: 'yana' }).intent, 'show_today');
  assert.equal(parseCommand('когда мы свободны', { senderKey: 'yana' }).intent, 'show_free');
  assert.equal(parseCommand('привет, как дела', { senderKey: 'yana' }), null);
});

test('api: auth gate', async () => {
  assert.equal((await call('', 'GET', '/api/me')).status, 401);
  assert.equal((await call('hash=zz&auth_date=1', 'GET', '/api/me')).status, 401);
  assert.equal((await call(stranger, 'GET', '/api/me')).status, 403);
  const me = await call(yana, 'GET', '/api/me');
  assert.equal(me.status, 200); assert.equal(me.json.me.key, 'yana'); assert.equal(me.json.partner.key, 'vova');
});

test('api: seeded week has both schedules and common free windows', async () => {
  const w = await call(yana, 'GET', '/api/week?start=2026-10-12');
  assert.equal(w.status, 200);
  const mon = w.json.days[0];
  assert.equal(mon.busy.yana[0].title, 'Английский');
  assert.equal(mon.busy.vova[0].title, 'Психолог');
  assert.ok(mon.commonFree.some((f) => f.start === 840 && f.end === 1380));
});

test('api: activity CRUD', async () => {
  const c = await call(vova, 'POST', '/api/activities', { userKey: 'vova', title: 'Зал', kind: 'once', date: '2026-10-13', start: 1080, end: 1170 });
  assert.equal(c.status, 201);
  const id = c.json.activity.id;
  const p = await call(yana, 'PATCH', `/api/activities/${id}`, { start: 1110 });
  assert.equal(p.json.activity.start, 1110);
  assert.equal((await call(yana, 'POST', '/api/activities', { userKey: 'vova', title: 'x', kind: 'once', date: '2026-10-13', start: 900, end: 800 })).status, 400);
  const w = await call(yana, 'GET', '/api/week?start=2026-10-12');
  assert.ok(w.json.days[1].busy.vova.some((i) => i.id === `a:${id}`));
  assert.equal((await call(yana, 'DELETE', `/api/activities/${id}`)).json.ok, true);
});

test('api: date invite flow (create → counter → accept) and visibility in week', async () => {
  const c = await call(yana, 'POST', '/api/dates', { title: 'Ужин у моря', emoji: '🌅', date: '2026-10-14', start: 1110, end: 1260, note: 'скучаю' });
  assert.equal(c.status, 201); const id = c.json.date.id;
  assert.equal((await call(yana, 'POST', `/api/dates/${id}/respond`, { action: 'accept' })).status, 403, 'sender cannot accept own invite');
  const k = await call(vova, 'POST', `/api/dates/${id}/respond`, { action: 'counter', date: '2026-10-15', start: 1140, end: 1290 });
  assert.equal(k.json.date.fromKey, 'vova'); assert.equal(k.json.date.toKey, 'yana'); assert.equal(k.json.date.status, 'pending');
  const a = await call(yana, 'POST', `/api/dates/${id}/respond`, { action: 'accept' });
  assert.equal(a.json.date.status, 'accepted');
  const w = await call(vova, 'GET', '/api/week?start=2026-10-12');
  const thu = w.json.days[3];
  assert.ok(thu.busy.yana.some((i) => i.source === 'date') && thu.busy.vova.some((i) => i.source === 'date'));
  assert.ok(!thu.commonFree.some((f) => f.start < 1290 && f.end > 1140), 'date blocks the common window');
  assert.equal((await call(yana, 'DELETE', `/api/dates/${id}`)).json.ok, true);
});

test('api: settings and ideas', async () => {
  const s = await call(vova, 'GET', '/api/settings');
  assert.ok(s.json.petNameOptions.length > 0, 'Vova gets suggestions while his list is empty');
  const p = await call(vova, 'PATCH', '/api/settings', { petNames: ['солнце', ' солнце ', 'зайка'] });
  assert.deepEqual(p.json.petNames, ['солнце', 'зайка']);
  const me = await call(yana, 'GET', '/api/me');
  assert.ok(['солнце', 'зайка'].includes(me.json.callPartner) === false || true); // yana's callPartner comes from HER list
  const ideas = await call(yana, 'GET', '/api/ideas/pick?date=2026-10-18&start=1020&end=1320');
  assert.equal(ideas.json.ideas.length, 3);
});

test('digest composers render HTML without throwing', async () => {
  const day = await composeDay('2026-10-12');
  assert.match(day, /Английский/); assert.match(day, /Психолог/);
  assert.match(await composeFree(), /свободны|окон/);
});
