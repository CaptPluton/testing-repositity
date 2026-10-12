// Text blocks for the group chat: daily plan, free windows, countdowns.
import { USERS, GOOGLE_OWNER_KEY } from '../config.js';
import { dayOverview, nextCommonWindows } from '../schedule.js';
import { fmtMin, fmtDateRu, fmtDuration, today, addDays } from '../time.js';
import { address, randomLine, FREE_LINES, NO_FREE_LINES, countdownLine } from './texts.js';
import { countdowns } from '../countdowns.js';

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function windowText(w) {
  return `${fmtMin(w.start)}–${fmtMin(w.end)}`;
}

function personBlock(user, intervals) {
  const head = `<b>${esc(user.name)}</b>`;
  if (!intervals.length) return `${head}: весь день свободна(ен) 🌴`;
  const lines = intervals.map((iv) => {
    const tag = iv.source === 'google' ? ' 📅' : iv.source === 'date' ? ' 💞' : '';
    return `  ${fmtMin(iv.start)}–${fmtMin(iv.end)} ${esc(iv.title)}${tag}`;
  });
  return `${head}\n${lines.join('\n')}`;
}

export async function composeDay(dateStr, { title } = {}) {
  const ov = await dayOverview(dateStr);
  const parts = [`<b>${esc(title || fmtDateRu(dateStr))}</b>`];
  for (const u of USERS) parts.push(personBlock(u, ov.busy[u.key]));
  const evening = ov.commonFree.filter((w) => w.end - w.start >= 60);
  if (evening.length) {
    const best = evening.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
    parts.push(randomLine(FREE_LINES, { window: `${windowText(best)} (${fmtDuration(best.end - best.start)})` }));
    if (evening.length > 1) parts.push(`Ещё окна вдвоём: ${evening.filter((w) => w !== best).map(windowText).join(', ')}`);
  } else {
    parts.push(randomLine(NO_FREE_LINES));
  }
  if (!ov.googleConnected && GOOGLE_OWNER_KEY) parts.push('<i>Google Календарь пока не подключён, созвоны не учтены.</i>');
  return parts.join('\n\n');
}

export async function composeMorning() {
  const t = today();
  const lines = [randomLine(['Доброе утро, {both}! ☀️', 'Утро, {both}! Кофе, объятия, потом расписание ☕', 'Привет, {both}! Солнце на Пхукете встало, я тоже 🌴'], {
    both: `${address('yana')} и ${address('vova')}`,
  })];
  for (const c of countdowns()) {
    const l = countdownLine(c);
    if (l) lines.push(l);
  }
  lines.push(await composeDay(t, { title: `Сегодня, ${fmtDateRu(t)}` }));
  return lines.join('\n\n');
}

export async function composeWeek() {
  const t = today();
  const out = [`<b>Неделя вдвоём</b>`];
  for (let i = 0; i < 7; i++) {
    const d = addDays(t, i);
    const ov = await dayOverview(d);
    const busyCount = USERS.map((u) => ov.busy[u.key].length);
    const windows = ov.commonFree.filter((w) => w.end - w.start >= 90);
    const best = windows.length ? windows.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a)) : null;
    const dates = ov.dates.filter((x) => x.status === 'accepted').map((x) => `${x.emoji} ${esc(x.title)} ${fmtMin(x.start)}`);
    out.push(
      `<b>${esc(fmtDateRu(d))}</b>${i === 0 ? ' (сегодня)' : ''}\n` +
      `  занятости: ${USERS[0].name} ${busyCount[0]}, ${USERS[1].name} ${busyCount[1]}` +
      (best ? `\n  вместе: ${windowText(best)} 💞` : '\n  общих окон нет 😶') +
      (dates.length ? `\n  ${dates.join(', ')}` : ''),
    );
  }
  return out.join('\n\n');
}

export async function composeFree() {
  const windows = await nextCommonWindows({ days: 7, minLen: 60, limit: 8 });
  if (!windows.length) return 'На ближайшую неделю общих окон длиннее часа не нашлось. Может, подвинем что-нибудь? 🙃';
  const lines = windows.map((w) => `• ${fmtDateRu(w.date)}: ${windowText(w)} (${fmtDuration(w.end - w.start)})`);
  return `<b>Когда вы оба свободны</b>\n${lines.join('\n')}\n\nЛюбое из этих окон можно превратить в свидание в приложении 💌`;
}
