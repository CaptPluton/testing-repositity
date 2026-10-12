// Minimal Google Calendar client: OAuth2 (one owner account) + events read/write.
import crypto from 'node:crypto';
import { ENV } from './config.js';
import { getJson, setJson, delSetting, putOauthState, takeOauthState } from './db.js';
import { fromIso, toIso, addDays } from './time.js';

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];
const TOKENS_KEY = 'google_tokens';
const cache = new Map(); // range key -> {at, events}
const CACHE_TTL_MS = 3 * 60 * 1000;

export function isConfigured() {
  return Boolean(ENV.googleClientId && ENV.googleClientSecret && ENV.publicUrl);
}
export function isConnected() {
  const t = getJson(TOKENS_KEY);
  return Boolean(t && t.refresh_token);
}
export function redirectUri() {
  return `${ENV.publicUrl}/auth/google/callback`;
}

export function buildAuthUrl(userKey) {
  const state = crypto.randomBytes(16).toString('hex');
  putOauthState(state, userKey);
  const p = new URLSearchParams({
    client_id: ENV.googleClientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function handleCallback(code, state) {
  const userKey = takeOauthState(state);
  if (!userKey) throw new Error('bad_state');
  const body = new URLSearchParams({
    code, client_id: ENV.googleClientId, client_secret: ENV.googleClientSecret,
    redirect_uri: redirectUri(), grant_type: 'authorization_code',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  if (!res.ok) throw new Error(`token_exchange_failed: ${await res.text()}`);
  const t = await res.json();
  const prev = getJson(TOKENS_KEY) || {};
  setJson(TOKENS_KEY, {
    access_token: t.access_token,
    refresh_token: t.refresh_token || prev.refresh_token,
    expires_at: Date.now() + (t.expires_in || 3600) * 1000,
    connected_by: userKey,
  });
  cache.clear();
  return userKey;
}

export function disconnect() {
  delSetting(TOKENS_KEY);
  cache.clear();
}

async function accessToken() {
  const t = getJson(TOKENS_KEY);
  if (!t || !t.refresh_token) throw new Error('not_connected');
  if (t.access_token && t.expires_at - Date.now() > 60_000) return t.access_token;
  const body = new URLSearchParams({
    client_id: ENV.googleClientId, client_secret: ENV.googleClientSecret,
    refresh_token: t.refresh_token, grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 400 && /invalid_grant/.test(text)) disconnect();
    throw new Error(`refresh_failed: ${text}`);
  }
  const n = await res.json();
  setJson(TOKENS_KEY, { ...t, access_token: n.access_token, expires_at: Date.now() + (n.expires_in || 3600) * 1000 });
  return n.access_token;
}

async function gfetch(path, init = {}) {
  const token = await accessToken();
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`google_${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const calPath = () => `/calendars/${encodeURIComponent(ENV.googleCalendarId)}/events`;

// Returns a map date -> [{id,start,end,title,allDay}] for [startDate, endDate] inclusive, in local minutes.
export async function eventsByDay(startDate, endDate) {
  const out = {};
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) out[d] = [];
  if (!isConnected()) return { days: out, connected: false };

  const key = `${startDate}_${endDate}`;
  const hit = cache.get(key);
  let items;
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    items = hit.items;
  } else {
    const p = new URLSearchParams({
      singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
      timeMin: toIso(startDate, 0), timeMax: toIso(addDays(endDate, 1), 0),
    });
    const data = await gfetch(`${calPath()}?${p}`);
    items = data.items || [];
    cache.set(key, { at: Date.now(), items });
  }

  for (const ev of items) {
    if (ev.status === 'cancelled') continue;
    if (ev.transparency === 'transparent') continue; // marked "free" in Google
    const self = (ev.attendees || []).find((a) => a.self);
    if (self && self.responseStatus === 'declined') continue;
    if (ev.extendedProperties?.private?.vdvoem === '1') continue; // our own date events are rendered from the DB
    if (!ev.start?.dateTime) continue; // all-day events don't block time
    const s = fromIso(ev.start.dateTime);
    const e = fromIso(ev.end?.dateTime || ev.start.dateTime);
    // Clamp multi-day events to each day they touch
    for (let d = s.date; d <= e.date; d = addDays(d, 1)) {
      if (!(d in out)) continue;
      const start = d === s.date ? s.minutes : 0;
      const end = d === e.date ? e.minutes : 1440;
      if (end <= start) continue;
      out[d].push({ id: `g:${ev.id}`, start, end, title: ev.summary || 'Событие', link: ev.htmlLink || null });
    }
  }
  return { days: out, connected: true };
}

export async function insertDateEvent(d, partnerNames) {
  if (!isConnected()) return null;
  const body = {
    summary: `${d.emoji} ${d.title}`,
    description: [`Свидание · ${partnerNames}`, d.note ? `«${d.note}»` : ''].filter(Boolean).join('\n'),
    start: { dateTime: toIso(d.date, d.start) },
    end: { dateTime: toIso(d.date, d.end) },
    extendedProperties: { private: { vdvoem: '1', dateId: String(d.id) } },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] },
  };
  const ev = await gfetch(calPath(), { method: 'POST', body: JSON.stringify(body) });
  cache.clear();
  return ev.id;
}

export async function deleteEvent(eventId) {
  if (!isConnected() || !eventId) return;
  try {
    await gfetch(`${calPath()}/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
  } catch (e) {
    if (!/google_(404|410)/.test(String(e.message))) throw e;
  }
  cache.clear();
}

export function invalidateCache() {
  cache.clear();
}
