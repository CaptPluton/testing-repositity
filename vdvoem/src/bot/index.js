import { Bot, InlineKeyboard, GrammyError, HttpError } from 'grammy';
import { ENV, ALLOWED_IDS, USERS, APP_NAME, TZ, zoneById, userById, userByKey, partnerOf } from '../config.js';
import { registerTaskHandlers } from './tasks-bot.js';
import * as db from '../db.js';
import * as datesSvc from '../dates.js';
import { onDateEvent } from '../dates.js';
import { nextCommonWindows } from '../schedule.js';
import { fmtMin, fmtDateRu, fmtDuration, today, todayIn, addDays, WEEKDAYS_RU, nowMinutes } from '../time.js';
import { activityPartsOnDay } from '../schedule.js';
import { parseCommand, matchActivity, nextWeekday } from './parser.js';
import { assistantEnabled, parseWithClaude } from './assistant.js';
import { composeDay, composeMorning, composeWeek, composeFree, esc, windowText } from './digest.js';
import { address, callPartner, randomLine, INVITE_LINES, ACCEPT_LINES, DECLINE_LINES, COUNTER_LINES, MISS_YOU_LINES, userName } from './texts.js';

const GROUP_KEY = 'group_chat_id';

export function createBot() {
  const bot = new Bot(ENV.botToken);
  let me = null;

  const groupId = () => db.getSetting(GROUP_KEY);
  const appUrl = () => ENV.publicUrl || null;
  const directLink = () => (me ? `https://t.me/${me.username}/${ENV.miniAppShortName}` : null);

  function appKeyboard(ctx) {
    const kb = new InlineKeyboard();
    const isPrivate = ctx?.chat?.type === 'private';
    if (isPrivate && appUrl()) kb.webApp('Открыть календарь 💞', appUrl());
    else if (directLink()) kb.url('Открыть календарь 💞', directLink());
    return kb;
  }

  // ---- access control: only the two of them, anywhere
  bot.use(async (ctx, next) => {
    const from = ctx.from;
    if (ctx.myChatMember) {
      const status = ctx.myChatMember.new_chat_member.status;
      const by = ctx.myChatMember.from?.id;
      if (['member', 'administrator'].includes(status) && ctx.chat.type !== 'private' && !ALLOWED_IDS.has(by)) {
        await ctx.api.leaveChat(ctx.chat.id).catch(() => {});
        return;
      }
      return next();
    }
    if (!from) return;
    if (!ALLOWED_IDS.has(from.id)) {
      if (ctx.chat?.type === 'private' && ctx.message?.text) await ctx.reply('Этот уголок только для двоих 💔');
      return;
    }
    if (ctx.chat && ctx.chat.type !== 'private' && !groupId()) db.setSetting(GROUP_KEY, String(ctx.chat.id));
    return next();
  });

  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) console.error('Telegram API error:', e.description);
    else if (e instanceof HttpError) console.error('Telegram network error:', e.message);
    else console.error('Bot error:', e);
  });

  const HELP = () => [
    `<b>${esc(APP_NAME)}</b>: один календарь на двоих.`,
    'Я понимаю обычные фразы:',
    '• <i>добавь Вове зал в среду 18:00-19:30</i>',
    '• <i>поставь мне вокал каждый четверг в 17:00 на час</i>',
    '• <i>перенеси вокал на пятницу 16:00</i>',
    '• <i>удали зал в среду</i>',
    '• <i>что сегодня</i> · <i>что завтра</i> · <i>неделя</i> · <i>когда свободны</i>',
    '• <i>скучаю</i>: подскажу ближайшее окно вдвоём',
    '',
    'Время по Москве: добавь «по мск», я сама переведу на пхукетское:',
    '• <i>добавь мне созвон завтра в 14:00 по мск на час</i>',
    '',
    'Задачи и напоминания:',
    '• <i>напомни мне завтра в 10 по мск позвонить маме</i>',
    '• <i>напомни Вове в пятницу купить цветы</i>',
    '• <i>напоминай каждый день в 9 пить витамины</i>',
    '• <i>напомни нам через 2 часа выключить духовку</i>',
    '• <i>задачи</i>: список',
    '',
    'Команды: /app /today /tomorrow /week /free /tasks /date /miss /help',
  ].join('\n');

  const taskBot = registerTaskHandlers(bot, { groupId, appKeyboard });

  bot.command('start', async (ctx) => {
    if (ctx.chat.type !== 'private') db.setSetting(GROUP_KEY, String(ctx.chat.id));
    const who = userById(ctx.from.id);
    const text = ctx.chat.type === 'private'
      ? `Привет, ${esc(address(who.key))}! 💞 Я веду ваш общий календарь. Открой приложение кнопкой ниже или пиши мне как ассистенту.`
      : `Я здесь, ${esc(address('yana'))} и ${esc(address('vova'))} 💞 Этот чат теперь наш штаб. Каждое утро в 8:00 пришлю план дня, а приглашения на свидания будут появляться тут.`;
    await ctx.reply(`${text}\n\n${HELP()}`, { parse_mode: 'HTML', reply_markup: appKeyboard(ctx) });
  });
  bot.command('help', (ctx) => ctx.reply(HELP(), { parse_mode: 'HTML' }));
  bot.command('app', (ctx) => ctx.reply('Ваш календарь 💞', { reply_markup: appKeyboard(ctx) }));
  bot.command('id', (ctx) => ctx.reply(`chat: <code>${ctx.chat.id}</code>, you: <code>${ctx.from.id}</code>`, { parse_mode: 'HTML' }));
  bot.command('today', async (ctx) => ctx.reply(await composeDay(today(), { title: `Сегодня, ${fmtDateRu(today())}` }), { parse_mode: 'HTML' }));
  bot.command('tomorrow', async (ctx) => ctx.reply(await composeDay(addDays(today(), 1), { title: `Завтра, ${fmtDateRu(addDays(today(), 1))}` }), { parse_mode: 'HTML' }));
  bot.command('week', async (ctx) => ctx.reply(await composeWeek(), { parse_mode: 'HTML' }));
  bot.command('free', async (ctx) => ctx.reply(await composeFree(), { parse_mode: 'HTML' }));
  bot.command('date', async (ctx) => ctx.reply('Свидание начинается с приложения: выбери окно, идею и записку 💌', { reply_markup: appKeyboard(ctx) }));
  bot.command('miss', (ctx) => missYou(ctx, userById(ctx.from.id).key));

  async function missYou(ctx, fromKey) {
    const to = partnerOf(fromKey);
    const [w] = await nextCommonWindows({ days: 7, minLen: 30, limit: 1 });
    const window = w ? `${w.date === today() ? 'сегодня' : fmtDateRu(w.date)} ${windowText(w)}` : 'пока не нашлось, но я ищу';
    await ctx.reply(randomLine(MISS_YOU_LINES, { from: userName(fromKey), to: callPartner(fromKey), window }), { reply_markup: appKeyboard(ctx) });
    if (ctx.chat.type === 'private' && groupId()) {
      await bot.api.sendMessage(groupId(), `${esc(userName(fromKey))} скучает по ${esc(callPartner(fromKey))} 🥺 Ближайшее окно вдвоём: ${esc(window)}`, { parse_mode: 'HTML' }).catch(() => {});
    }
  }

  // ---- natural language
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return;
    const sender = userById(ctx.from.id);
    const isGroup = ctx.chat.type !== 'private';
    const mentioned = me && new RegExp(`@${me.username}\\b`, 'i').test(text);
    const replyToBot = ctx.message.reply_to_message?.from?.id === me?.id;

    let cmd = parseCommand(text, { senderKey: sender.key, botUsername: me?.username });
    if ((!cmd || (cmd.intent === 'add' && !cmd.title)) && assistantEnabled() && (!isGroup || mentioned || replyToBot)) {
      try { cmd = await parseWithClaude(text, { senderKey: sender.key }); } catch (e) { console.error('assistant failed', e.message); }
    }
    if (!cmd) {
      if (!isGroup || mentioned || replyToBot) await ctx.reply('Не поняла, но звучит мило 🙈 Напиши, например: «добавь Вове зал в среду 18:00-19:30» или /help');
      return;
    }
    await handleCommand(ctx, cmd, sender);
  });

  async function handleCommand(ctx, cmd, sender) {
    switch (cmd.intent) {
      case 'help': return ctx.reply(HELP(), { parse_mode: 'HTML' });
      case 'show_today': return ctx.reply(await composeDay(today(), { title: `Сегодня, ${fmtDateRu(today())}` }), { parse_mode: 'HTML' });
      case 'show_tomorrow': return ctx.reply(await composeDay(addDays(today(), 1), { title: `Завтра, ${fmtDateRu(addDays(today(), 1))}` }), { parse_mode: 'HTML' });
      case 'show_week': return ctx.reply(await composeWeek(), { parse_mode: 'HTML' });
      case 'show_free': return ctx.reply(await composeFree(), { parse_mode: 'HTML' });
      case 'date_wish': return ctx.reply(`Зову ${esc(callPartner(sender.key))} на свидание? Выбери окно и идею в приложении 💌`, { parse_mode: 'HTML', reply_markup: appKeyboard(ctx) });
      case 'miss': return missYou(ctx, sender.key);
      case 'chat': return ctx.reply(cmd.reply || '💞');
      case 'add': return addActivity(ctx, cmd);
      case 'remind': return taskBot.createFromCommand(ctx, cmd, sender);
      case 'tasks': return taskBot.listTasks(ctx, sender.key);
      case 'move': return moveActivity(ctx, cmd);
      case 'delete': return deleteActivity(ctx, cmd);
      default: return ctx.reply('Пока не умею такое, но учусь 🐣');
    }
  }

  const who = (key) => (key === 'yana' ? 'Яне' : 'Вове');
  const zoneShort = (tz) => zoneById(tz)?.short || tz;
  // «14:00–15:00 МСК = 18:00–19:00 по Пхукету» for activities typed in another zone
  function timeText(a) {
    const own = `${fmtMin(a.start)}–${fmtMin(a.end)}`;
    if (!a.tz || a.tz === TZ) return own;
    const probe = a.kind === 'once' ? a.date : nextWeekday(a.weekday, todayIn(a.tz));
    const parts = [...activityPartsOnDay(a, probe), ...activityPartsOnDay(a, addDays(probe, 1))].filter((p) => p.part !== 'end');
    const ph = parts[0];
    const shifted = ph ? `${fmtMin(ph.start)}–${fmtMin(ph.end === 1440 ? 0 : ph.end)}` : '?';
    return `${own} ${zoneShort(a.tz)} = ${shifted} по Пхукету`;
  }
  const whenText = (a) => (a.kind === 'recurring' ? `по ${WEEKDAYS_RU[a.weekday].replace(/а$/, 'ам').replace(/ье$/, 'ьям').replace(/(к|г)$/, '$1ам')}` : fmtDateRu(a.date));

  async function addActivity(ctx, cmd) {
    if (!cmd.title) return ctx.reply('Что именно добавить? Например: «добавь Вове зал в среду 18:00-19:30»');
    if (cmd.start == null) return ctx.reply(`Во сколько «${esc(cmd.title)}»? Напиши, например: «… в 18:00 на час»`, { parse_mode: 'HTML' });
    let kind = cmd.kind || 'once';
    let date = cmd.date, weekday = cmd.weekday;
    const tz = cmd.tz || TZ;
    if (kind === 'once' && !date) date = todayIn(tz);
    if (kind === 'recurring' && weekday == null) return ctx.reply('В какой день недели повторять?');
    const end = Math.min(1440, cmd.end || cmd.start + 60);
    const a = db.insertActivity({ userKey: cmd.userKey, title: cmd.title, kind, weekday, date, start: cmd.start, end, tz });
    await ctx.reply(`Записала ${who(a.userKey)}: <b>${esc(a.title)}</b>, ${whenText(a)} ${esc(timeText(a))} ✅`, { parse_mode: 'HTML' });
  }

  async function moveActivity(ctx, cmd) {
    const candidates = matchActivity(db.listActivities(), { userKey: cmd.userKey, title: cmd.title });
    if (!candidates.length) return ctx.reply(`Не нашла «${esc(cmd.title || '…')}» в расписании ${who(cmd.userKey)} 🤔`, { parse_mode: 'HTML' });
    const a = candidates[0];
    const patch = {};
    const wd = cmd.weekday ?? cmd.weekdayMentioned ?? null;
    if (wd != null && a.kind === 'recurring') patch.weekday = wd; // a weekly thing moves to another weekday
    else if (cmd.date) { patch.kind = 'once'; patch.date = cmd.date; patch.weekday = null; }
    else if (wd != null) { patch.kind = 'once'; patch.date = nextWeekday(wd); patch.weekday = null; }
    if (cmd.start != null) {
      const len = a.end - a.start;
      patch.start = cmd.start;
      patch.end = cmd.end && cmd.end > cmd.start && cmd.raw && /(-|–|до)/.test(cmd.raw) ? cmd.end : cmd.start + len;
    }
    if (cmd.tz && cmd.start != null) patch.tz = cmd.tz;
    if (!Object.keys(patch).length) return ctx.reply('Куда перенести? Укажи день и/или время.');
    if (patch.end > 1440) patch.end = 1440;
    const n = db.updateActivity(a.id, patch);
    await ctx.reply(`Перенесла: <b>${esc(n.title)}</b> теперь ${whenText(n)} ${esc(timeText(n))} 🔁`, { parse_mode: 'HTML' });
  }

  async function deleteActivity(ctx, cmd) {
    const candidates = matchActivity(db.listActivities(), { userKey: cmd.userKey, title: cmd.title, weekday: cmd.weekday, date: cmd.date });
    if (!candidates.length) return ctx.reply(`Не нашла «${esc(cmd.title || '…')}» 🤔`, { parse_mode: 'HTML' });
    const a = candidates[0];
    db.deleteActivity(a.id);
    await ctx.reply(`Убрала: <b>${esc(a.title)}</b> (${whenText(a)} ${fmtMin(a.start)}) 🗑️`, { parse_mode: 'HTML' });
  }

  // ---- date invites in the group
  function inviteKeyboard(d) {
    return new InlineKeyboard()
      .text('Да! 💞', `d:a:${d.id}`)
      .text('Другое время 🔁', `d:c:${d.id}`)
      .row()
      .text('Не смогу 😔', `d:d:${d.id}`);
  }
  function inviteText(d) {
    const from = userName(d.fromKey);
    const toPet = callPartner(d.fromKey);
    return [
      randomLine(INVITE_LINES),
      `<b>${esc(d.emoji)} ${esc(d.title)}</b>`,
      `${esc(from)} зовёт ${esc(toPet)}: ${esc(fmtDateRu(d.date))}, ${fmtMin(d.start)}–${fmtMin(d.end)} (${fmtDuration(d.end - d.start)})`,
      d.note ? `<i>«${esc(d.note)}»</i>` : '',
    ].filter(Boolean).join('\n');
  }
  async function targetChat(d) {
    return groupId() || userByKey(d.toKey)?.id || null;
  }
  async function postInvite(d, prefix = '') {
    const chat = await targetChat(d);
    if (!chat) return;
    const msg = await bot.api.sendMessage(chat, prefix + inviteText(d), { parse_mode: 'HTML', reply_markup: inviteKeyboard(d) });
    db.updateDate(d.id, { chatId: String(chat), messageId: msg.message_id });
  }
  async function finalize(d, text) {
    const chat = d.chatId || (await targetChat(d));
    if (!chat) return;
    if (d.messageId) {
      await bot.api.editMessageText(chat, d.messageId, text, { parse_mode: 'HTML' }).catch(() => bot.api.sendMessage(chat, text, { parse_mode: 'HTML' }));
    } else {
      await bot.api.sendMessage(chat, text, { parse_mode: 'HTML' });
    }
  }

  onDateEvent(async ({ type, date: d, byKey, gcalOk }) => {
    try {
      if (type === 'created') await postInvite(d);
      if (type === 'counter') await postInvite(d, `${randomLine(COUNTER_LINES)}\n\n`);
      if (type === 'accepted') {
        await finalize(d, `${inviteText(d)}\n\n<b>Принято!</b> ${esc(randomLine(ACCEPT_LINES))}${gcalOk ? '' : '\n<i>(в Google Календарь не записалось, он не подключён)</i>'}`);
      }
      if (type === 'declined') await finalize(d, `${inviteText(d)}\n\n${esc(randomLine(DECLINE_LINES))}`);
      if (type === 'cancelled') await finalize(d, `<s>${esc(d.emoji)} ${esc(d.title)}, ${esc(fmtDateRu(d.date))} ${fmtMin(d.start)}</s>\nОтменено ${byKey ? `(${esc(userName(byKey))})` : ''} 🕊️`);
    } catch (e) {
      console.error('failed to post date event', e);
    }
  });

  bot.callbackQuery(/^d:(a|c|d):(\d+)$/, async (ctx) => {
    const [, action, idStr] = ctx.match;
    const d = db.getDate(Number(idStr));
    const sender = userById(ctx.from.id);
    if (!d) return ctx.answerCallbackQuery({ text: 'Приглашение не найдено' });
    if (d.status !== 'pending') return ctx.answerCallbackQuery({ text: 'На это уже ответили 😉' });
    if (d.toKey !== sender.key) return ctx.answerCallbackQuery({ text: `Эта кнопка для ${userName(d.toKey)} 😉`, show_alert: false });
    try {
      if (action === 'a') { await datesSvc.respond(d.id, sender.key, { action: 'accept' }); return ctx.answerCallbackQuery({ text: 'Свидание в календаре 💞' }); }
      if (action === 'd') { await datesSvc.respond(d.id, sender.key, { action: 'decline' }); return ctx.answerCallbackQuery({ text: 'Передала 💛' }); }
      // counter: offer the next common windows
      const windows = await nextCommonWindows({ days: 10, minLen: Math.min(90, d.end - d.start), limit: 4 });
      const kb = new InlineKeyboard();
      for (const w of windows.filter((w) => !(w.date === d.date && w.start <= d.start && w.end >= d.end))) {
        const end = Math.min(w.end, w.start + (d.end - d.start));
        kb.text(`${fmtDateRu(w.date)} ${fmtMin(w.start)}–${fmtMin(end)}`, `d:m:${d.id}:${w.date}:${w.start}:${end}`).row();
      }
      if (directLink() || appUrl()) {
        if (ctx.chat?.type === 'private' && appUrl()) kb.webApp('Выбрать своё время в приложении', appUrl());
        else if (directLink()) kb.url('Выбрать своё время в приложении', directLink());
      }
      await ctx.answerCallbackQuery();
      await ctx.reply(`Когда удобнее, ${esc(address(sender.key))}? Вот ближайшие окна вдвоём:`, { parse_mode: 'HTML', reply_markup: kb });
    } catch (e) {
      await ctx.answerCallbackQuery({ text: e.message || 'Что-то пошло не так' });
    }
  });

  bot.callbackQuery(/^d:m:(\d+):(\d{4}-\d{2}-\d{2}):(\d+):(\d+)$/, async (ctx) => {
    const [, idStr, date, s, e] = ctx.match;
    const d = db.getDate(Number(idStr));
    const sender = userById(ctx.from.id);
    if (!d || d.status !== 'pending') return ctx.answerCallbackQuery({ text: 'Это приглашение уже закрыто' });
    if (d.toKey !== sender.key) return ctx.answerCallbackQuery({ text: `Эта кнопка для ${userName(d.toKey)} 😉` });
    try {
      await datesSvc.respond(d.id, sender.key, { action: 'counter', date, start: Number(s), end: Number(e) });
      await ctx.answerCallbackQuery({ text: 'Предложила новое время 🔁' });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    } catch (err) {
      await ctx.answerCallbackQuery({ text: err.message });
    }
  });

  // ---- scheduled jobs
  async function sendMorningDigest() {
    const chat = groupId();
    if (!chat) return;
    await bot.api.sendMessage(chat, await composeMorning(), { parse_mode: 'HTML', reply_markup: appKeyboard({ chat: { type: 'group' } }) });
  }
  async function sendReminders() {
    await taskBot.sendDueReminders().catch((e) => console.error('task reminders failed', e));
    const t = today();
    const now = nowMinutes();
    for (const d of db.upcomingAcceptedDates(t)) {
      if (d.date !== t || d.reminded) continue;
      const diff = d.start - now;
      if (diff > 60 || diff < 0) continue;
      db.updateDate(d.id, { reminded: true });
      const chat = groupId() || d.chatId;
      if (!chat) continue;
      await bot.api.sendMessage(chat, `Через ${diff <= 1 ? 'минуту' : `${diff} мин`} свидание: <b>${esc(d.emoji)} ${esc(d.title)}</b> в ${fmtMin(d.start)} 💞 Собирайтесь, красивые.`, { parse_mode: 'HTML' }).catch(() => {});
    }
  }
  async function notifyGroup(text) {
    const chat = groupId();
    if (chat) await bot.api.sendMessage(chat, text);
  }

  async function start() {
    me = await bot.api.getMe();
    await bot.api.setMyCommands([
      { command: 'app', description: 'Открыть календарь' },
      { command: 'today', description: 'План на сегодня' },
      { command: 'tomorrow', description: 'План на завтра' },
      { command: 'week', description: 'Неделя вдвоём' },
      { command: 'free', description: 'Когда мы оба свободны' },
      { command: 'tasks', description: 'Задачи и напоминания' },
      { command: 'date', description: 'Позвать на свидание' },
      { command: 'miss', description: 'Скучаю' },
      { command: 'help', description: 'Что я умею' },
    ]).catch((e) => console.error('setMyCommands failed', e.message));
    if (appUrl()) {
      await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'Календарь', web_app: { url: appUrl() } } })
        .catch((e) => console.error('setChatMenuButton failed', e.message));
    }
    bot.start({
      allowed_updates: ['message', 'callback_query', 'my_chat_member'],
      drop_pending_updates: false,
      onStart: (info) => console.log(`Bot @${info.username} is polling`),
    }).catch((e) => console.error('Polling stopped:', e));
    return me;
  }

  return { bot, start, sendMorningDigest, sendReminders, notifyGroup, stop: () => bot.stop() };
}
