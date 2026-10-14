import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENV, APP_NAME, AWAKE, TZ, MSK_TZ, ZONES, GOOGLE_OWNER_KEY, isZone, userById, userByKey, partnerOf } from '../config.js';
import * as tasksSvc from '../tasks.js';
import { getUserPrefs, setUserPrefs } from '../prefs.js';
import * as db from '../db.js';
import * as google from '../google.js';
import * as datesSvc from '../dates.js';
import { buildWeek } from '../schedule.js';
import { CATEGORIES, IDEAS, pickIdeas } from '../ideas.js';
import { validateInitData } from './initdata.js';
import { today, nowMinutes, mondayOf, isValidDate, weekdayOf, fmtMin, offsetMin } from '../time.js';
import { countdowns } from '../countdowns.js';
import { petNamesOf, setPetNames, petNameOptionsFor, callPartner, randomLine, FREE_LINES } from '../bot/texts.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(here, '../../public');

const httpError = (status, error, message) => Object.assign(new Error(message || error), { status, error });

function auth(req, res, next) {
  const initData = req.get('X-Telegram-Init-Data') || '';
  let user = null;
  if (initData) {
    const v = validateInitData(initData, ENV.botToken);
    if (!v) return res.status(401).json({ error: 'bad_init_data' });
    user = userById(v.user.id);
  } else if (ENV.devUser) {
    user = userByKey(ENV.devUser);
  } else {
    return res.status(401).json({ error: 'bad_init_data' });
  }
  if (!user) return res.status(403).json({ error: 'not_allowed' });
  req.me = user;
  next();
}

const publicUser = (u) => u && ({ key: u.key, id: u.id, name: u.name, username: u.username, color: u.color, birthday: u.birthday });

function validateActivity(body, partial = false) {
  const out = {};
  if (!partial || body.userKey !== undefined) {
    if (!userByKey(body.userKey)) throw httpError(400, 'bad_user', 'Не понимаю, чьё это занятие');
    out.userKey = body.userKey;
  }
  if (!partial || body.title !== undefined) {
    const title = String(body.title || '').trim().slice(0, 60);
    if (!title) throw httpError(400, 'bad_title', 'Нужно название');
    out.title = title;
  }
  if (!partial || body.kind !== undefined) {
    if (!['recurring', 'once'].includes(body.kind)) throw httpError(400, 'bad_kind', 'kind должен быть recurring или once');
    out.kind = body.kind;
  }
  if (body.weekday !== undefined) {
    if (body.weekday !== null && !(Number.isInteger(body.weekday) && body.weekday >= 0 && body.weekday <= 6)) throw httpError(400, 'bad_weekday', 'День недели 0..6');
    out.weekday = body.weekday;
  }
  if (body.date !== undefined) {
    if (body.date !== null && !isValidDate(body.date)) throw httpError(400, 'bad_date', 'Дата в формате YYYY-MM-DD');
    out.date = body.date;
  }
  if (body.tz !== undefined || !partial) {
    const tz = body.tz ?? TZ;
    if (!isZone(tz)) throw httpError(400, 'bad_tz', 'Неизвестный часовой пояс');
    out.tz = tz;
  }
  for (const k of ['validFrom', 'validUntil']) {
    if (body[k] === undefined) continue;
    if (body[k] !== null && !isValidDate(body[k])) throw httpError(400, 'bad_date', `${k} в формате YYYY-MM-DD`);
    out[k] = body[k];
  }
  if (body.start !== undefined) out.start = body.start;
  if (body.end !== undefined) out.end = body.end;
  if (out.start !== undefined || out.end !== undefined || !partial) {
    const s = out.start, e = out.end;
    if (!partial && (!Number.isInteger(s) || !Number.isInteger(e))) throw httpError(400, 'bad_time', 'Нужны start и end в минутах');
  }
  return out;
}

function checkActivityComplete(a) {
  if (!Number.isInteger(a.start) || !Number.isInteger(a.end) || a.start < 0 || a.end > 1440 || a.end <= a.start) throw httpError(400, 'bad_time', 'Время указано неверно');
  if (a.kind === 'recurring' && !(Number.isInteger(a.weekday) && a.weekday >= 0 && a.weekday <= 6)) throw httpError(400, 'bad_weekday', 'Для еженедельного занятия нужен день недели');
  if (a.kind === 'once' && !isValidDate(a.date)) throw httpError(400, 'bad_date', 'Для разового занятия нужна дата');
  if (a.validFrom && a.validUntil && a.validUntil < a.validFrom) throw httpError(400, 'bad_range', 'Дата окончания раньше даты начала');
}

export function createApp({ bot } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/healthz', (_req, res) => res.type('text').send('ok'));

  // ---- Google OAuth browser callback (no initData here: the browser is outside Telegram)
  app.get('/auth/google/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const page = (title, text) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>${title}</title><body style="font-family:-apple-system,system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f4f4f5;color:#111">
      <div style="text-align:center;padding:24px;max-width:360px"><div style="font-size:48px">${title}</div><p style="font-size:17px;line-height:1.5">${text}</p></div></body>`;
    if (error || !code || !state) return res.status(400).send(page('😕', 'Google не дал доступ. Вернись в приложение и попробуй ещё раз.'));
    try {
      await google.handleCallback(String(code), String(state));
      res.send(page('💞', 'Готово! Google Календарь подключён. Это окно можно закрыть и вернуться в Telegram.'));
      bot?.notifyGroup?.('Google Календарь подключён ✅ Теперь созвоны и встречи Яны видны в расписании.').catch(() => {});
    } catch (e) {
      console.error('google callback failed', e);
      res.status(400).send(page('😕', 'Не получилось завершить подключение. Попробуй ещё раз из приложения.'));
    }
  });

  const api = express.Router();
  api.use(auth);

  api.get('/me', (req, res) => {
    const me = req.me;
    res.json({
      me: publicUser(me),
      partner: publicUser(partnerOf(me.key)),
      callPartner: callPartner(me.key),
      petNames: petNamesOf(me.key),
      petNameOptions: petNameOptionsFor(me.key),
      tz: TZ,
      zones: ZONES.map((z) => ({ ...z, offsetMin: offsetMin(today(), z.id) })),
      ...getUserPrefs(me.key),
      secondTz: MSK_TZ,
      today: today(),
      nowMinutes: nowMinutes(),
      awake: AWAKE,
      countdowns: countdowns(),
      google: { connected: google.isConnected(), owner: GOOGLE_OWNER_KEY, canConnect: me.key === GOOGLE_OWNER_KEY && google.isConfigured(), configured: google.isConfigured() },
      appName: APP_NAME,
    });
  });

  api.get('/week', async (req, res, next) => {
    try {
      let start = req.query.start ? String(req.query.start) : mondayOf(today());
      if (!isValidDate(start)) throw httpError(400, 'bad_date', 'start должен быть YYYY-MM-DD');
      start = mondayOf(start);
      res.json(await buildWeek(start));
    } catch (e) { next(e); }
  });

  // ---- activities
  api.get('/activities', (_req, res) => res.json({ activities: db.listActivities() }));
  api.post('/activities', (req, res, next) => {
    try {
      const a = validateActivity(req.body || {});
      checkActivityComplete(a);
      res.status(201).json({ activity: db.insertActivity(a) });
    } catch (e) { next(e); }
  });
  api.patch('/activities/:id', (req, res, next) => {
    try {
      const cur = db.getActivity(Number(req.params.id));
      if (!cur) throw httpError(404, 'not_found', 'Занятие не найдено');
      const patch = validateActivity(req.body || {}, true);
      const merged = { ...cur, ...patch };
      checkActivityComplete(merged);
      res.json({ activity: db.updateActivity(cur.id, patch) });
    } catch (e) { next(e); }
  });
  api.delete('/activities/:id', (req, res) => {
    const ok = db.deleteActivity(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: 'not_found', message: 'Занятие не найдено' });
    res.json({ ok: true });
  });

  // ---- ideas
  api.get('/ideas', (_req, res) => res.json({ categories: CATEGORIES, ideas: IDEAS }));
  api.get('/ideas/pick', (req, res) => {
    const date = isValidDate(String(req.query.date || '')) ? String(req.query.date) : today();
    const start = Number(req.query.start ?? 18 * 60);
    const end = Number(req.query.end ?? 22 * 60);
    const ideas = pickIdeas({ date, start, end, weekday: weekdayOf(date) }, 3);
    const line = randomLine(FREE_LINES, { window: `с ${fmtMin(start)} до ${fmtMin(end)}` });
    res.json({ ideas, line });
  });

  // ---- dates
  api.get('/dates', (_req, res) => {
    res.json({ dates: db.listDates().map(({ gcalEventId, chatId, messageId, reminded, ...d }) => d) });
  });
  api.post('/dates', async (req, res, next) => {
    try {
      const b = req.body || {};
      const d = await datesSvc.createInvite(req.me.key, {
        title: b.title, emoji: b.emoji, date: b.date, start: Number(b.start), end: Number(b.end), note: b.note, ideaId: b.ideaId,
      });
      res.status(201).json({ date: strip(d) });
    } catch (e) { next(e); }
  });
  api.post('/dates/:id/respond', async (req, res, next) => {
    try {
      const b = req.body || {};
      const d = await datesSvc.respond(Number(req.params.id), req.me.key, {
        action: b.action, date: b.date, start: b.start != null ? Number(b.start) : undefined, end: b.end != null ? Number(b.end) : undefined,
      });
      res.json({ date: strip(d) });
    } catch (e) { next(e); }
  });
  api.delete('/dates/:id', async (req, res, next) => {
    try {
      await datesSvc.cancel(Number(req.params.id), req.me.key);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ---- settings
  const settingsOf = (key) => ({ petNames: petNamesOf(key), petNameOptions: petNameOptionsFor(key), ...getUserPrefs(key) });
  api.get('/settings', (req, res) => res.json(settingsOf(req.me.key)));
  api.patch('/settings', (req, res) => {
    const b = req.body || {};
    if (b.petNames !== undefined) {
      if (!Array.isArray(b.petNames)) return res.status(400).json({ error: 'bad_body', message: 'Нужен массив petNames' });
      setPetNames(req.me.key, b.petNames);
    }
    if (b.inputTz !== undefined && !isZone(b.inputTz)) return res.status(400).json({ error: 'bad_tz', message: 'Неизвестный часовой пояс' });
    setUserPrefs(req.me.key, { inputTz: b.inputTz, showSecondTz: b.showSecondTz });
    res.json(settingsOf(req.me.key));
  });

  // ---- tasks
  api.get('/tasks', (req, res) => {
    const status = ['open', 'done', 'all'].includes(req.query.status) ? req.query.status : 'open';
    res.json({ tasks: tasksSvc.listPresented(status) });
  });
  api.post('/tasks', async (req, res, next) => {
    try { res.status(201).json({ task: await tasksSvc.createTask(req.me.key, req.body, { defaultTz: getUserPrefs(req.me.key).inputTz }) }); } catch (e) { next(e); }
  });
  api.patch('/tasks/:id', async (req, res, next) => {
    try { res.json({ task: await tasksSvc.updateTaskById(Number(req.params.id), req.me.key, req.body) }); } catch (e) { next(e); }
  });
  api.post('/tasks/:id/done', async (req, res, next) => {
    try { res.json({ task: await tasksSvc.completeTask(Number(req.params.id), req.me.key) }); } catch (e) { next(e); }
  });
  api.post('/tasks/:id/undo', async (req, res, next) => {
    try { res.json({ task: await tasksSvc.reopenTask(Number(req.params.id), req.me.key) }); } catch (e) { next(e); }
  });
  api.post('/tasks/:id/snooze', async (req, res, next) => {
    try { res.json({ task: await tasksSvc.snoozeTask(Number(req.params.id), req.body?.minutes) }); } catch (e) { next(e); }
  });
  api.delete('/tasks/:id', async (req, res, next) => {
    try { await tasksSvc.removeTask(Number(req.params.id), req.me.key); res.json({ ok: true }); } catch (e) { next(e); }
  });

  // ---- google
  api.get('/google/status', (req, res) => {
    res.json({ connected: google.isConnected(), owner: GOOGLE_OWNER_KEY, canConnect: req.me.key === GOOGLE_OWNER_KEY && google.isConfigured(), configured: google.isConfigured() });
  });
  api.get('/google/auth-url', (req, res) => {
    if (req.me.key !== GOOGLE_OWNER_KEY) return res.status(403).json({ error: 'not_owner', message: 'Календарь подключает Яна' });
    if (!google.isConfigured()) return res.status(503).json({ error: 'not_configured', message: 'На сервере не заданы GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / PUBLIC_URL' });
    res.json({ url: google.buildAuthUrl(req.me.key) });
  });
  api.delete('/google', (req, res) => {
    if (req.me.key !== GOOGLE_OWNER_KEY) return res.status(403).json({ error: 'not_owner' });
    google.disconnect();
    res.json({ ok: true });
  });

  app.use('/api', api);
  app.use(express.static(PUBLIC_DIR, { index: 'index.html', maxAge: '5m' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    const code = err.error || ({ 400: 'bad_request', 403: 'forbidden', 404: 'not_found', 409: 'conflict' }[status] || (status >= 500 ? 'internal' : 'error'));
    res.status(status).json({ error: code, message: err.message });
  });
  return app;
}

const strip = ({ gcalEventId, chatId, messageId, reminded, ...d }) => d;
