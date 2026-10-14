// Task reminders and task commands for the bot.
import { InlineKeyboard } from 'grammy';
import { USERS, partnerOf } from '../config.js';
import * as db from '../db.js';
import * as tasksSvc from '../tasks.js';
import { esc } from './digest.js';
import { userName } from './texts.js';

const REPEAT_RU = { daily: 'каждый день', weekdays: 'по будням', weekly: 'каждую неделю', monthly: 'каждый месяц' };
const ownerRu = (k) => (k === 'both' ? 'вам обоим' : k === 'yana' ? 'Яне' : 'Вове');

export function taskLine(p, { withOwner = true } = {}) {
  const parts = [`${p.overdue ? '🔴' : '▫️'} ${esc(p.title)}`];
  const meta = [];
  const lbl = tasksSvc.dueLabel(p, { relative: true });
  if (lbl) meta.push(lbl);
  if (p.repeat !== 'none') meta.push(`🔁 ${REPEAT_RU[p.repeat]}`);
  if (withOwner) meta.push(p.ownerKey === 'both' ? '👫' : userName(p.ownerKey));
  if (meta.length) parts.push(`<i>${esc(meta.join(' · '))}</i>`);
  return parts.join('  ');
}

function reminderKeyboard(id) {
  return new InlineKeyboard()
    .text('Готово ✅', `t:d:${id}`)
    .row()
    .text('+15 мин', `t:s:${id}:15`)
    .text('+1 ч', `t:s:${id}:60`)
    .text('Завтра', `t:t:${id}`);
}

export function registerTaskHandlers(bot, { groupId, appKeyboard }) {
  // Sends to a user's private chat; falls back to the group with a mention.
  async function deliver(t, text, opts) {
    const owners = tasksSvc.ownerUsers(t);
    const group = groupId();
    if (t.ownerKey === 'both' && group) {
      return bot.api.sendMessage(group, text, opts);
    }
    for (const u of owners) {
      try {
        await bot.api.sendMessage(u.id, text, opts);
      } catch (e) {
        if (!group) { console.error('reminder delivery failed', u.key, e.description || e.message); continue; }
        const mention = u.username ? `@${u.username} ` : `${esc(u.name)}, `;
        await bot.api.sendMessage(group, mention + text, opts).catch((err) => console.error('group fallback failed', err.description || err.message));
      }
    }
  }

  async function sendDueReminders() {
    for (const { task, offset, snoozed } of tasksSvc.collectDueReminders()) {
      const p = tasksSvc.present(task);
      const head = snoozed ? '⏰ Снова напоминаю' : offset ? `⏰ Скоро, ${tasksSvc.offsetText(offset)}` : '⏰ Напоминание';
      const lines = [`${head}: <b>${esc(task.title)}</b>`];
      const lbl = tasksSvc.dueLabel(task, { relative: true });
      if (lbl) lines.push(esc(lbl));
      if (task.note) lines.push(`<i>${esc(task.note)}</i>`);
      if (task.ownerKey !== 'both' && task.createdBy !== task.ownerKey) lines.push(`от ${esc(userName(task.createdBy))} 💌`);
      if (p.repeat !== 'none') lines.push(`🔁 ${REPEAT_RU[p.repeat]}`);
      await deliver(task, lines.join('\n'), { parse_mode: 'HTML', reply_markup: reminderKeyboard(task.id) });
    }
  }

  // Tell the owner when the partner adds a task for them from the app.
  tasksSvc.onTaskEvent(async ({ type, task, byKey, fromBot }) => {
    if (type !== 'created' || fromBot || !byKey || task.ownerKey === byKey) return;
    const lbl = tasksSvc.dueLabel(task, { relative: true });
    const text = `📝 ${esc(userName(byKey))} добавил${byKey === 'yana' ? 'а' : ''} ${task.ownerKey === 'both' ? 'вам обоим' : 'тебе'} задачу: <b>${esc(task.title)}</b>${lbl ? `\n${esc(lbl)}` : ''}`;
    await deliver(task, text, { parse_mode: 'HTML' });
  });

  bot.callbackQuery(/^t:d:(\d+)$/, async (ctx) => {
    const user = USERS.find((u) => u.id === ctx.from.id);
    try {
      const p = await tasksSvc.completeTask(Number(ctx.match[1]), user.key);
      const text = p.status === 'open' && p.repeat !== 'none'
        ? `✅ Готово! Следующий раз: ${esc(tasksSvc.dueLabel(p, { relative: true }))}`
        : `✅ Готово: <s>${esc(p.title)}</s>`;
      await ctx.editMessageText(text, { parse_mode: 'HTML' }).catch(() => {});
      await ctx.answerCallbackQuery({ text: 'Молодец 💪' });
    } catch (e) {
      await ctx.answerCallbackQuery({ text: e.message || 'Не получилось' });
    }
  });

  bot.callbackQuery(/^t:s:(\d+):(\d+)$/, async (ctx) => {
    try {
      const minutes = Number(ctx.match[2]);
      await tasksSvc.snoozeTask(Number(ctx.match[1]), minutes);
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      await ctx.answerCallbackQuery({ text: minutes >= 60 ? 'Напомню через час' : `Напомню через ${minutes} мин` });
    } catch (e) {
      await ctx.answerCallbackQuery({ text: e.message || 'Не получилось' });
    }
  });

  bot.callbackQuery(/^t:t:(\d+)$/, async (ctx) => {
    try {
      const t = db.getTask(Number(ctx.match[1]));
      if (!t) return ctx.answerCallbackQuery({ text: 'Задача не найдена' });
      await tasksSvc.snoozeTask(t.id, tasksSvc.minutesUntilTomorrow(t));
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      await ctx.answerCallbackQuery({ text: 'Напомню завтра 🌙' });
    } catch (e) {
      await ctx.answerCallbackQuery({ text: e.message || 'Не получилось' });
    }
  });

  async function createFromCommand(ctx, cmd, sender) {
    if (!cmd.title) return ctx.reply('О чём напомнить? Например: «напомни мне завтра в 10 по мск позвонить маме»');
    const p = await tasksSvc.createTask(sender.key, {
      ownerKey: cmd.ownerKey, title: cmd.title, dueDate: cmd.dueDate, dueTime: cmd.dueTime,
      tz: cmd.tz, repeat: cmd.repeat, remind: cmd.dueDate ? [0] : [],
    });
    const whom = cmd.ownerKey === sender.key ? 'тебе' : ownerRu(cmd.ownerKey);
    const lbl = tasksSvc.dueLabel(p, { relative: true });
    const when = lbl ? (p.dueTime == null ? `${lbl}, в 9:00` : lbl) : null;
    const lines = [
      when ? `Напомню ${whom} ${esc(when)} ✅` : `Записала задачу ${whom} без срока ✅`,
      `<b>${esc(p.title)}</b>${p.repeat !== 'none' ? `  🔁 ${REPEAT_RU[p.repeat]}` : ''}`,
    ];
    const kb = new InlineKeyboard().text('Отменить', `t:x:${p.id}`);
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
  }

  bot.callbackQuery(/^t:x:(\d+)$/, async (ctx) => {
    const user = USERS.find((u) => u.id === ctx.from.id);
    try {
      await tasksSvc.removeTask(Number(ctx.match[1]), user.key);
      await ctx.editMessageText('Отменила 🕊️').catch(() => {});
      await ctx.answerCallbackQuery();
    } catch (e) {
      await ctx.answerCallbackQuery({ text: e.message || 'Уже нет такой задачи' });
    }
  });

  async function listTasks(ctx, senderKey) {
    const all = tasksSvc.listPresented('open');
    if (!all.length) return ctx.reply('Задач нет. Можно выдохнуть и обнять друг друга 🫂', { reply_markup: appKeyboard(ctx) });
    const mine = all.filter((p) => p.ownerKey === senderKey || p.ownerKey === 'both');
    const partner = all.filter((p) => p.ownerKey !== senderKey && p.ownerKey !== 'both');
    const block = (title, list) => (list.length ? `<b>${title}</b>\n${list.slice(0, 15).map((p) => taskLine(p, { withOwner: false })).join('\n')}` : '');
    const text = [
      block('Твои и общие', mine),
      block(`У ${partnerOf(senderKey)?.key === 'vova' ? 'Вовы' : 'Яны'}`, partner),
    ].filter(Boolean).join('\n\n');
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: appKeyboard(ctx) });
  }

  bot.command('tasks', (ctx) => listTasks(ctx, USERS.find((u) => u.id === ctx.from.id).key));

  return { sendDueReminders, createFromCommand, listTasks };
}

