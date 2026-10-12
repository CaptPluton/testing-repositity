// Tone: sweet, with light jokes. Everything the bot says lives here.
import { PET_NAME_OPTIONS, USERS, userByKey, partnerOf } from '../config.js';
import { getJson, setJson } from '../db.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function petNamesOf(userKey) {
  const stored = getJson(`petnames:${userKey}`);
  if (Array.isArray(stored)) return stored;
  return userByKey(userKey)?.defaultPetNames || [];
}
export function setPetNames(userKey, list) {
  const clean = [...new Set(list.map((s) => String(s).trim()).filter((s) => s && s.length <= 30))].slice(0, 12);
  setJson(`petnames:${userKey}`, clean);
  return clean;
}
export function petNameOptionsFor(userKey) {
  return petNamesOf(userKey).length ? [] : PET_NAME_OPTIONS;
}
// How `fromKey` calls their partner.
export function callPartner(fromKey) {
  const names = petNamesOf(fromKey);
  return names.length ? pick(names) : partnerOf(fromKey)?.name || 'любимый человек';
}
// How the bot addresses `userKey` (using the partner's pet names for them).
export function address(userKey) {
  const partner = partnerOf(userKey);
  return partner ? callPartner(partner.key) : userByKey(userKey)?.name;
}
export function bothNames() {
  return `${address('yana')} и ${address('vova')}`;
}

export const GREETINGS = [
  'Доброе утро, {both}! ☀️',
  'Утро! Проснулись? {both}, у меня для вас план на день 📋',
  'Доброе утро, {both}. Кофе, объятия, потом расписание ☕',
  'Привет, {both}! Солнце на Пхукете уже встало, я тоже 🌴',
];

export const FREE_LINES = [
  'Вечером вы оба свободны {window}. Намекаю очень тонко 💞',
  'Окно вдвоём: {window}. Советую заранее занять друг друга 😏',
  'Общее свободное время {window}. Диван и закат сами себя не посмотрят 🌅',
  'С {window} вы оба никому ничего не должны. Кроме друг друга 💌',
];

export const NO_FREE_LINES = [
  'Сегодня общих окон не нашлось. Зато есть завтра, и я уже слежу 🔍',
  'День плотный у обоих. Обнимите друг друга хотя бы по дороге 🫂',
  'Общего свободного времени сегодня нет. Это временно, обещаю 💪',
];

export const INVITE_LINES = [
  'Тебя зовут на свидание. Сердце уже можно готовить 💘',
  'Внимание, романтика в чате! У тебя приглашение 💌',
  'Срочная новость: кто-то очень хочет тебя увидеть 🥰',
];

export const ACCEPT_LINES = [
  'Ура! Свидание в календаре. Я напомню за час, чтобы никто не опоздал ⏰💞',
  'Записала в оба календаря. Теперь это официально 💍 (шутка, пока просто свидание)',
  'Да! Я знала. Поставила вам в календарь, сама пойду поплакать от счастья 🥲',
];

export const DECLINE_LINES = [
  'Не получается в этот раз. Но желание было, и это главное 💛',
  'Увы, в этот раз мимо. Предлагаю не сдаваться и выбрать другое окно 🔁',
];

export const COUNTER_LINES = [
  'Контрпредложение! Торг в любви уместен 💬',
  'Предложено другое время. Теперь ваш ход 🎯',
];

export const MISS_YOU_LINES = [
  '{to}, {from} скучает 🥺 Ближайшее окно вдвоём: {window}',
  'Срочно: {from} соскучился(ась) по тебе, {to}. Ближайшее общее время {window} 💞',
];

export function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}
export function randomLine(list, vars = {}) {
  return fill(pick(list), vars);
}

export function countdownLine({ key, daysLeft }) {
  if (daysLeft === 0) {
    if (key === 'anniversary') return 'Сегодня ваша годовщина! 💞 Отменяйте всё, кроме друг друга.';
    if (key === 'birthday_yana') return 'Сегодня день рождения Яны! 🎂 Вова, ты знаешь, что делать.';
    if (key === 'birthday_vova') return 'Сегодня день рождения Вовы! 🎂 Яна, план "сюрприз" активирован.';
  }
  if (daysLeft === 1) {
    if (key === 'anniversary') return 'Завтра годовщина 💞 Намекаю на цветы и столик.';
    return key === 'birthday_yana' ? 'Завтра день рождения Яны 🎂' : 'Завтра день рождения Вовы 🎂';
  }
  if (daysLeft <= 7) {
    const label = key === 'anniversary' ? 'годовщины' : key === 'birthday_yana' ? 'дня рождения Яны' : 'дня рождения Вовы';
    return `До ${label} ${daysLeft} ${plural(daysLeft, 'день', 'дня', 'дней')} 🗓️`;
  }
  return null;
}

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function userName(key) {
  return userByKey(key)?.name || key;
}
export { USERS };
