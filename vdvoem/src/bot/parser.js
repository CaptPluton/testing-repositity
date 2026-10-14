// Rule-based Russian parser for schedule commands in the couple's chat.
// Returns {intent, userKey, title, kind, weekday, date, start, end} or null.
import { today, todayIn, addDays, parseHHMM, weekdayOf, msToZoned } from '../time.js';
import { TZ, MSK_TZ } from '../config.js';

const WB = String.raw`(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))`;
// JS \b is ASCII-only; emulate a Unicode-aware word boundary for Russian text.
const rx = (src, flags = '') => new RegExp(src.split('\\b').join(WB), flags.includes('u') ? flags : `${flags}u`);

const WEEKDAYS = [
  ['понедельник', 'пн'], ['вторник', 'вт'], ['среда', 'среду', 'ср'], ['четверг', 'чт'],
  ['пятница', 'пятницу', 'пт'], ['суббота', 'субботу', 'сб'], ['воскресенье', 'вс'],
];
const WEEKDAY_PLURAL = ['понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const PERSON = {
  vova: rx(String.raw`\b(вов[аеуы]|вовчик[ау]?|кис[аеу]|сиськонавт[ау]?|за[йяю]|зайк[аеу]|ему|у него|его)\b`, 'i'),
  yana: rx(String.raw`\b(ян[аеуы]|янчик[ау]?|ей|у неё|у нее|её|ее)\b`, 'i'),
  me: rx(String.raw`\b(мне|меня|я|мой|моя|моё|себе|у меня)\b`, 'i'),
};

const TZ_PATTERNS = [
  [MSK_TZ, String.raw`(?:по\s+)?(?:мск|москв[еыа]|московскому(?:\s+времени)?|по\s+москве)`],
  [TZ, String.raw`(?:по\s+)?(?:пхукету|пхукетскому(?:\s+времени)?|тайскому(?:\s+времени)?|местному(?:\s+времени)?|по\s+пхукету)`],
];

// Finds and strips a zone hint like «по мск». Returns { tz|null, rest }.
export function extractTz(text) {
  for (const [tz, src] of TZ_PATTERNS) {
    const re = rx(String.raw`\b${src}\b`, 'i');
    if (re.test(text)) return { tz, rest: text.replace(re, ' ') };
  }
  return { tz: null, rest: text };
}

const REPEAT_PATTERNS = [
  ['daily', String.raw`(кажд(ый|ое)\s+(день|утро|вечер)|ежедневно)`],
  ['weekdays', String.raw`(по\s+будням|в\s+будни|каждый\s+будний\s+день)`],
  ['monthly', String.raw`(кажд(ый|ое)\s+месяц|ежемесячно|раз\s+в\s+месяц)`],
  ['weekly', String.raw`(кажд(ую|ый)\s+неделю|еженедельно|раз\s+в\s+неделю)`],
];

const INTENTS = [
  ['tasks', rx(String.raw`^(задачи|мои\s+задачи|список\s+задач|что\s+по\s+задачам|напоминания)\??$`, 'i')],
  ['remind', rx(String.raw`^(напомни(те)?|напоминай|поставь\s+напоминание|создай\s+напоминание|напоминание|добавь\s+задачу|задача:?)\b`, 'i')],
  ['delete', rx(String.raw`^(удали|убери|отмени|сними|удалить|убрать)\b`, 'i')],
  ['move', rx(String.raw`^(перенеси|сдвинь|передвинь|перемести|перенести)\b`, 'i')],
  ['add', rx(String.raw`^(добавь|поставь|запиши|запланируй|создай|добавить|поставить|записать|занят[аы]?|у меня|у вовы|у яны)\b`, 'i')],
  ['show_today', /(что (у нас )?сегодня|план на сегодня|сегодня план|расписание на сегодня|^сегодня\??$)/i],
  ['show_tomorrow', /(что (у нас )?завтра|план на завтра|завтра план|расписание на завтра|^завтра\??$)/i],
  ['show_week', /(неделя|на неделе|план на неделю|расписание на неделю)/i],
  ['show_free', /(когда (мы )?свободн|свободное время|окно вдвоём|окно вдвоем|когда вместе|когда увидимся)/i],
  ['date_wish', /(хочу на свидание|позови|свидание\??$|давай на свидание|зови на свидание)/i],
  ['miss', /(скучаю|соскучил)/i],
  ['help', rx(String.raw`^(помощь|help|что ты умеешь|команды)\b`, 'i')],
];

function stripMention(text, botUsername) {
  return botUsername ? text.replace(new RegExp(`@${botUsername}\\b`, 'ig'), ' ') : text;
}

export function parseCommand(rawText, { senderKey, botUsername } = {}) {
  let text = stripMention(rawText || '', botUsername).trim().replace(/\s+/g, ' ').replace(/[.!]+$/g, '');
  if (!text) return null;
  const lower = text.toLowerCase();

  let intent = null;
  for (const [name, re] of INTENTS) {
    if (re.test(lower)) { intent = name; break; }
  }
  if (!intent) return null;
  if (intent.startsWith('show_') || intent === 'help' || intent === 'miss' || intent === 'date_wish' || intent === 'tasks') {
    return { intent, userKey: senderKey, raw: rawText };
  }

  let rest = lower.replace(INTENTS.find(([n]) => n === intent)[1], ' ');
  const tzHit = extractTz(rest);
  rest = tzHit.rest;
  const tz = tzHit.tz;
  if (intent === 'remind') return parseReminder(rest, { senderKey, tz, raw: rawText });
  let userKey = senderKey;
  if (PERSON.vova.test(rest)) { userKey = 'vova'; rest = rest.replace(PERSON.vova, ' '); }
  else if (PERSON.yana.test(rest)) { userKey = 'yana'; rest = rest.replace(PERSON.yana, ' '); }
  else if (PERSON.me.test(rest)) { rest = rest.replace(PERSON.me, ' '); }

  // Recurring?
  let kind = 'once';
  let weekday = null;
  let date = null;
  if (rx(String.raw`\b(кажд(ый|ую|ое|ые)|еженедельно|по)\b`, '').test(rest) || WEEKDAY_PLURAL.some((w) => rest.includes(w))) kind = 'recurring';
  for (let i = 0; i < 7; i++) {
    const forms = [...WEEKDAYS[i], WEEKDAY_PLURAL[i]];
    const re = new RegExp(`(?:^|\\s)(?:в|во|на|по|каждый|каждую|каждое)?\\s*(${forms.join('|')})${WB}`, 'iu');
    const m = re.exec(rest);
    if (m) { weekday = i; rest = rest.replace(m[0], ' '); break; }
  }
  rest = rest.replace(rx(String.raw`\b(кажд(ый|ую|ое|ые)|еженедельно)\b`, 'g'), ' ');

  // Explicit date (relative words are resolved in the zone the user named)
  const t = todayIn(tz || TZ);
  if (rx(String.raw`\bпослезавтра\b`, '').test(rest)) { date = addDays(t, 2); rest = rest.replace(rx(String.raw`\bпослезавтра\b`, ''), ' '); }
  else if (rx(String.raw`\bзавтра\b`, '').test(rest)) { date = addDays(t, 1); rest = rest.replace(rx(String.raw`\bзавтра\b`, ''), ' '); }
  else if (rx(String.raw`\bсегодня\b`, '').test(rest)) { date = t; rest = rest.replace(rx(String.raw`\bсегодня\b`, ''), ' '); }
  else {
    const dm = rx(String.raw`\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b(?!\s*[:.]\d{2})`, '').exec(rest);
    const dw = rx(String.raw`\b(\d{1,2})\s+(янв[а-яё]*|фев[а-яё]*|мар[а-яё]*|апр[а-яё]*|ма[яй]|июн[а-яё]*|июл[а-яё]*|авг[а-яё]*|сен[а-яё]*|окт[а-яё]*|ноя[а-яё]*|дек[а-яё]*)\b`, '').exec(rest);
    if (dw) {
      const mi = MONTHS.findIndex((m) => dw[2].startsWith(m));
      if (mi >= 0) { date = resolveDate(Number(dw[1]), mi + 1, t); rest = rest.replace(dw[0], ' '); }
    } else if (dm && Number(dm[2]) >= 1 && Number(dm[2]) <= 12 && Number(dm[1]) <= 31) {
      date = resolveDate(Number(dm[1]), Number(dm[2]), t, dm[3]);
      rest = rest.replace(dm[0], ' ');
    }
  }

  // Time range / start / duration
  let start = null, end = null, duration = null;
  const range = /(?:с\s*)?(\d{1,2}(?:[:.]\d{2})?)\s*(?:-|–|—|до)\s*(\d{1,2}(?:[:.]\d{2})?)/.exec(rest);
  if (range) {
    start = toMin(range[1]); end = toMin(range[2]);
    rest = rest.replace(range[0], ' ');
  } else {
    const at = rx(String.raw`(?:\bв|\bна|\bк)?\s*(\d{1,2}[:.]\d{2})\b`, '').exec(rest) || rx(String.raw`\bв\s+(\d{1,2})\b(?!\s*(минут|мин|час))`, '').exec(rest);
    if (at) { start = toMin(at[1]); rest = rest.replace(at[0], ' '); }
  }
  const dur = rx(String.raw`\bна\s+(полтора часа|полчаса|час|(\d+(?:[.,]\d+)?)\s*(час[а-яё]*|ч\b|минут[а-яё]*|мин\b))`, '').exec(rest);
  if (dur) {
    if (dur[1] === 'полтора часа') duration = 90;
    else if (dur[1] === 'полчаса') duration = 30;
    else if (dur[1] === 'час') duration = 60;
    else {
      const n = Number(dur[2].replace(',', '.'));
      duration = /час|ч/.test(dur[3]) ? Math.round(n * 60) : Math.round(n);
    }
    rest = rest.replace(dur[0], ' ');
  }
  if (start != null && end == null) end = start + (duration || 60);
  if (end != null && end <= start) end = Math.min(1440, start + 60);

  // Title: whatever is left
  let title = rest
    .replace(rx(String.raw`\b(мне|себе|пожалуйста|плиз|пж)\b`, 'g'), ' ')
    .replace(/[,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // drop dangling prepositions at the edges («в», «на», «с»…) but keep inner ones («созвон с командой»)
  const EDGE = rx(String.raw`^(в|во|на|с|со|до|по|к|у|и|а)\s+|\s+(в|во|на|с|со|до|по|к|у|и|а)$`, 'i');
  for (let i = 0; i < 4 && EDGE.test(title); i++) title = title.replace(EDGE, '').trim();
  title = title.replace(rx(String.raw`\s(в|во|на|до|по|к)\s(?=(в|во|на|до|по|к)\b)`, 'gi'), ' ').trim();

  if (kind === 'once' && weekday != null && !date) {
    // "в среду" without "каждую" means the next such weekday
    date = nextWeekday(weekday, t);
  }
  if (kind === 'recurring' && weekday == null && date) kind = 'once';

  return {
    intent, userKey, kind, weekday: kind === 'recurring' ? weekday : null, date: kind === 'once' ? date : null,
    weekdayMentioned: weekday, start, end, title: capitalize(title), raw: rawText, tz,
  };
}

const BOTH_RE = rx(String.raw`\b(нам(\s+обоим)?|обоим|нас\s+обоих|вдвоём|вдвоем|для\s+нас)\b`, 'i');

// «напомни мне завтра в 10 по мск позвонить маме», «напоминай каждый день в 9 пить витамины»,
// «напомни Вове через 2 часа купить цветы». Returns intent 'remind'.
function parseReminder(text, { senderKey, tz, raw, nowMs = Date.now() }) {
  let rest = ` ${text} `;
  const zone = tz || TZ;
  let ownerKey = senderKey;
  if (BOTH_RE.test(rest)) { ownerKey = 'both'; rest = rest.replace(BOTH_RE, ' '); }
  else if (PERSON.vova.test(rest)) { ownerKey = 'vova'; rest = rest.replace(PERSON.vova, ' '); }
  else if (PERSON.yana.test(rest)) { ownerKey = 'yana'; rest = rest.replace(PERSON.yana, ' '); }
  else if (PERSON.me.test(rest)) { rest = rest.replace(PERSON.me, ' '); }

  let repeat = 'none';
  for (const [r, src] of REPEAT_PATTERNS) {
    const re = rx(String.raw`\b${src}\b`, 'i');
    if (re.test(rest)) { repeat = r; rest = rest.replace(re, ' '); break; }
  }

  let dueDate = null, dueTime = null;
  const t = todayIn(zone);

  // «через 2 часа», «через 30 минут», «через час», «через полчаса»
  const rel = rx(String.raw`\bчерез\s+(полчаса|час|(\d+(?:[.,]\d+)?)\s*(минут[а-яё]*|мин\b|час[а-яё]*|ч\b|дн[а-яё]*|день))`, 'i').exec(rest);
  if (rel) {
    let minutes;
    if (rel[1] === 'полчаса') minutes = 30;
    else if (rel[1] === 'час') minutes = 60;
    else {
      const n = Number(rel[2].replace(',', '.'));
      minutes = /^д/.test(rel[3]) ? n * 1440 : /^ч|^час/.test(rel[3]) ? n * 60 : n;
    }
    const at = msToZoned(nowMs + Math.round(minutes) * 60000, zone);
    dueDate = at.date; dueTime = at.minutes;
    rest = rest.replace(rel[0], ' ');
  }

  let weekday = null;
  if (dueDate == null) {
    for (let i = 0; i < 7; i++) {
      const forms = [...WEEKDAYS[i], WEEKDAY_PLURAL[i]];
      const re = new RegExp(`(?:^|\\s)(?:в|во|на|по|каждый|каждую|каждое)?\\s*(${forms.join('|')})${WB}`, 'iu');
      const m = re.exec(rest);
      if (m) {
        weekday = i;
        if (/кажд|по\s/.test(m[0]) || WEEKDAY_PLURAL[i] === m[1]) repeat = 'weekly';
        rest = rest.replace(m[0], ' ');
        break;
      }
    }
    if (rx(String.raw`\bпослезавтра\b`, '').test(rest)) { dueDate = addDays(t, 2); rest = rest.replace(rx(String.raw`\bпослезавтра\b`, ''), ' '); }
    else if (rx(String.raw`\bзавтра\b`, '').test(rest)) { dueDate = addDays(t, 1); rest = rest.replace(rx(String.raw`\bзавтра\b`, ''), ' '); }
    else if (rx(String.raw`\bсегодня\b`, '').test(rest)) { dueDate = t; rest = rest.replace(rx(String.raw`\bсегодня\b`, ''), ' '); }
    else {
      const dw = rx(String.raw`\b(\d{1,2})\s+(янв[а-яё]*|фев[а-яё]*|мар[а-яё]*|апр[а-яё]*|ма[яй]|июн[а-яё]*|июл[а-яё]*|авг[а-яё]*|сен[а-яё]*|окт[а-яё]*|ноя[а-яё]*|дек[а-яё]*)\b`, '').exec(rest);
      const dm = rx(String.raw`\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b(?!\s*[:.]\d{2})`, '').exec(rest);
      if (dw) {
        const mi = MONTHS.findIndex((m) => dw[2].startsWith(m));
        if (mi >= 0) { dueDate = resolveDate(Number(dw[1]), mi + 1, t); rest = rest.replace(dw[0], ' '); }
      } else if (dm && Number(dm[2]) >= 1 && Number(dm[2]) <= 12) {
        dueDate = resolveDate(Number(dm[1]), Number(dm[2]), t, dm[3]); rest = rest.replace(dm[0], ' ');
      }
    }
    if (!dueDate && weekday != null) dueDate = nextWeekday(weekday, t);

    const at = rx(String.raw`(?:\bв|\bна|\bк)?\s*(\d{1,2}[:.]\d{2})\b`, '').exec(rest)
      || rx(String.raw`\bв\s+(\d{1,2})\b(?!\s*(минут|мин|час|числ))(?:\s*(утра|дня|вечера|ночи))?`, '').exec(rest);
    if (at) {
      let m = toMin(at[1]);
      const part = at[3];
      if (m != null && part && (part === 'вечера' || part === 'дня') && m < 12 * 60) m += 12 * 60;
      dueTime = m != null && m < 1440 ? m : null;
      rest = rest.replace(at[0], ' ');
    }
    if (dueTime != null && !dueDate) {
      const nowLocal = msToZoned(nowMs, zone);
      dueDate = dueTime > nowLocal.minutes ? nowLocal.date : addDays(nowLocal.date, 1);
    }
    if (repeat === 'daily' && !dueDate) dueDate = t;
    if (repeat === 'weekdays' && !dueDate) { let d = t; while (weekdayOf(d) > 4) d = addDays(d, 1); dueDate = d; }
    if (repeat !== 'none' && dueDate && dueTime != null && dueDate === t && dueTime <= msToZoned(nowMs, zone).minutes) {
      if (repeat === 'daily') dueDate = addDays(t, 1);
    }
  }

  const title = rest
    .replace(rx(String.raw`^\s*(что(бы)?|о\s+том,?\s+что(бы)?|про|насчёт|насчет)\b`, 'i'), ' ')
    .replace(rx(String.raw`\b(пожалуйста|плиз|пж)\b`, 'g'), ' ')
    .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    intent: 'remind', ownerKey, userKey: senderKey, title: capitalize(title), dueDate, dueTime,
    tz: zone, tzExplicit: Boolean(tz), repeat: dueDate ? repeat : 'none', raw,
  };
}
export { parseReminder };

function toMin(s) {
  if (/[:.]/.test(s)) return parseHHMM(s.replace('.', ':'));
  const h = Number(s);
  return h >= 0 && h <= 24 ? h * 60 : null;
}

function resolveDate(day, month, t, yearStr) {
  const y0 = Number(t.slice(0, 4));
  let year = yearStr ? Number(yearStr.length === 2 ? `20${yearStr}` : yearStr) : y0;
  let date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!yearStr && date < t) date = `${y0 + 1}-${date.slice(5)}`;
  return date;
}

export function nextWeekday(weekday, from = today()) {
  const diff = (weekday - weekdayOf(from) + 7) % 7;
  return addDays(from, diff);
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Fuzzy match an activity by title words (used for move/delete).
export function matchActivity(activities, { userKey, title, weekday, date }) {
  const words = (title || '').toLowerCase().split(/\s+/).filter(Boolean);
  const scored = activities
    .filter((a) => !userKey || a.userKey === userKey)
    .map((a) => {
      const t = a.title.toLowerCase();
      let score = 0;
      for (const w of words) if (t.includes(w.slice(0, Math.max(3, w.length - 2)))) score += 2;
      if (weekday != null && a.kind === 'recurring' && a.weekday === weekday) score += 1;
      if (date && ((a.kind === 'once' && a.date === date) || (a.kind === 'recurring' && a.weekday === weekdayOf(date)))) score += 1;
      return { a, score };
    })
    .filter((x) => x.score >= 2)
    .sort((x, y) => y.score - x.score);
  return scored.map((x) => x.a);
}
