import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.BOT_TOKEN = '123456:TESTTOKEN';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vdvoem-bot-'));
process.env.PUBLIC_URL = 'https://example.test';

const { openDb, setSetting, listActivities, listTasks } = await import('../src/db.js');
const { createBot } = await import('../src/bot/index.js');
const tasks = await import('../src/tasks.js');

const YANA = 573832468, VOVA = 481730749, GROUP = -1001;
let ctl, calls, failPrivate;
before(() => {
  openDb();
  setSetting('group_chat_id', String(GROUP));
  ctl = createBot();
  ctl.bot.botInfo = { id: 42, is_bot: true, first_name: 'Вдвоём', username: 'vdvoem_test_bot', can_join_groups: true, can_read_all_group_messages: true, supports_inline_queries: false };
  ctl.bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload });
    if (method === 'sendMessage' && failPrivate.has(payload.chat_id)) {
      return { ok: false, error_code: 403, description: 'Forbidden: bot can\'t initiate conversation with a user' };
    }
    return { ok: true, result: method === 'sendMessage' ? { message_id: calls.length, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text } : true };
  });
});
after(() => fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }));

let uid = 1;
function msg(from, text, chat = { id: from, type: 'private' }) {
  return { update_id: uid++, message: { message_id: uid, date: Math.floor(Date.now() / 1000), chat, from: { id: from, is_bot: false, first_name: 'x' }, text } };
}
function cb(from, data, chatId = from) {
  return { update_id: uid++, callback_query: { id: String(uid), from: { id: from, is_bot: false, first_name: 'x' }, chat_instance: '1', data, message: { message_id: 5, date: 0, chat: { id: chatId, type: 'private' }, text: 'x' } } };
}
const sent = () => calls.filter((c) => c.method === 'sendMessage');

test('stranger is refused', async () => {
  calls = []; failPrivate = new Set();
  await ctl.bot.handleUpdate(msg(999, 'привет'));
  assert.match(sent()[0].payload.text, /только для двоих/);
});

test('МСК activity via chat is stored in МСК and the reply shows the Phuket time', async () => {
  calls = []; failPrivate = new Set();
  await ctl.bot.handleUpdate(msg(YANA, 'поставь мне созвон с командой каждый понедельник 14:00-15:00 по мск'));
  const a = listActivities().find((x) => x.title === 'Созвон с командой');
  assert.equal(a.tz, 'Europe/Moscow'); assert.equal(a.start, 840);
  assert.match(sent()[0].payload.text, /14:00–15:00 МСК = 18:00–19:00 по Пхукету/);
});

test('reminder command creates a task; partner gets a reminder privately with buttons', async () => {
  calls = []; failPrivate = new Set();
  await ctl.bot.handleUpdate(msg(YANA, 'напомни Вове завтра в 10 по мск купить цветы'));
  assert.ok(sent().some((c) => /Напомню Вове/.test(c.payload.text) && c.payload.chat_id === YANA), 'confirmation to Яна');
  assert.ok(sent().some((c) => /Яна добавила тебе задачу/.test(c.payload.text) && c.payload.chat_id === VOVA), 'heads-up to Вова');
  const t = listTasks('open').find((x) => x.title === 'Купить цветы');
  assert.equal(t.ownerKey, 'vova'); assert.equal(t.tz, 'Europe/Moscow');
  // make it due now
  const nowLocal = new Date();
  (await import('../src/db.js')).updateTask(t.id, { dueDate: tasks.present(t).dueDate, fired: [] });
  const { msToZoned } = await import('../src/time.js');
  const z = msToZoned(nowLocal.getTime() - 60000, 'Europe/Moscow');
  (await import('../src/db.js')).updateTask(t.id, { dueDate: z.date, dueTime: z.minutes, fired: [] });
  calls = [];
  await ctl.sendReminders();
  const r = sent().find((c) => /Купить цветы/.test(c.payload.text));
  assert.ok(r, 'reminder sent');
  assert.equal(r.payload.chat_id, VOVA);
  assert.match(r.payload.text, /от Яна/);
  const kb = JSON.stringify(r.payload.reply_markup);
  assert.match(kb, new RegExp(`t:d:${t.id}`)); assert.match(kb, /t:s:\d+:15/);
  calls = [];
  await ctl.sendReminders();
  assert.equal(sent().filter((c) => /Купить цветы/.test(c.payload.text)).length, 0, 'no duplicate');
  // done button
  await ctl.bot.handleUpdate(cb(VOVA, `t:d:${t.id}`));
  assert.equal((await import('../src/db.js')).getTask(t.id).status, 'done');
});

test('private delivery falls back to the group with a mention', async () => {
  calls = []; failPrivate = new Set([YANA]);
  const { msToZoned } = await import('../src/time.js');
  const z = msToZoned(Date.now() - 60000, 'Asia/Bangkok');
  await tasks.createTask('yana', { ownerKey: 'yana', title: 'Оплатить свет', dueDate: z.date, dueTime: z.minutes });
  await ctl.sendReminders();
  const g = sent().find((c) => String(c.payload.chat_id) === String(GROUP) && /Оплатить свет/.test(c.payload.text));
  assert.ok(g); assert.match(g.payload.text, /@yana_obgolts/);
});

test('"задачи" lists open tasks', async () => {
  calls = []; failPrivate = new Set();
  await tasks.createTask('vova', { ownerKey: 'both', title: 'Выбрать отель' });
  await ctl.bot.handleUpdate(msg(VOVA, 'задачи'));
  assert.match(sent()[0].payload.text, /Выбрать отель/);
});
