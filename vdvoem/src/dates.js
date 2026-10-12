// Date-invite lifecycle shared by the Mini App API and the bot.
import { USERS, partnerOf, userByKey } from './config.js';
import * as db from './db.js';
import * as google from './google.js';
import { isValidDate } from './time.js';

const listeners = new Set();
export function onDateEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
async function emit(type, date, extra = {}) {
  for (const fn of listeners) {
    try { await fn({ type, date, ...extra }); } catch (e) { console.error('date listener failed', e); }
  }
}

export function validateSlot({ date, start, end }) {
  if (!isValidDate(date)) return 'Нужна дата в формате YYYY-MM-DD';
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 1440 || end <= start) return 'Время указано неверно';
  return null;
}

export async function createInvite(fromKey, { title, emoji, date, start, end, note, ideaId }) {
  const err = validateSlot({ date, start, end });
  if (err) throw Object.assign(new Error(err), { status: 400 });
  const clean = String(title || '').trim().slice(0, 80);
  if (!clean) throw Object.assign(new Error('Нужно название свидания'), { status: 400 });
  const toKey = partnerOf(fromKey).key;
  const d = db.insertDate({
    fromKey, toKey, title: clean, emoji: String(emoji || '💞').slice(0, 8), date, start, end,
    note: String(note || '').trim().slice(0, 300), status: 'pending',
  });
  await emit('created', d, { ideaId });
  return d;
}

export async function respond(dateId, byKey, { action, date, start, end }) {
  const d = db.getDate(dateId);
  if (!d) throw Object.assign(new Error('Приглашение не найдено'), { status: 404 });
  if (d.status !== 'pending') throw Object.assign(new Error('На это приглашение уже ответили'), { status: 409 });
  if (d.toKey !== byKey) throw Object.assign(new Error('Ответить может только тот, кого зовут'), { status: 403 });

  if (action === 'accept') {
    let gcalEventId = null;
    try {
      gcalEventId = await google.insertDateEvent(d, USERS.map((u) => u.name).join(' и '));
    } catch (e) {
      console.error('gcal insert failed', e.message);
    }
    const next = db.updateDate(d.id, { status: 'accepted', gcalEventId });
    await emit('accepted', next, { gcalOk: Boolean(gcalEventId) });
    return next;
  }
  if (action === 'decline') {
    const next = db.updateDate(d.id, { status: 'declined' });
    await emit('declined', next);
    return next;
  }
  if (action === 'counter') {
    const err = validateSlot({ date, start, end });
    if (err) throw Object.assign(new Error(err), { status: 400 });
    const next = db.updateDate(d.id, { fromKey: d.toKey, toKey: d.fromKey, date, start, end, status: 'pending', messageId: null });
    await emit('counter', next, { previous: d });
    return next;
  }
  throw Object.assign(new Error('Неизвестное действие'), { status: 400 });
}

export async function cancel(dateId, byKey) {
  const d = db.getDate(dateId);
  if (!d) throw Object.assign(new Error('Приглашение не найдено'), { status: 404 });
  if (!userByKey(byKey)) throw Object.assign(new Error('Нет доступа'), { status: 403 });
  if (d.status === 'cancelled') return d;
  if (d.gcalEventId) {
    try { await google.deleteEvent(d.gcalEventId); } catch (e) { console.error('gcal delete failed', e.message); }
  }
  const next = db.updateDate(d.id, { status: 'cancelled', gcalEventId: null });
  await emit('cancelled', next, { byKey });
  return next;
}
