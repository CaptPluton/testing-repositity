// Curated Phuket date ideas. bestTime: 'sunset' | 'evening' | 'day' | 'any'
export const CATEGORIES = [
  { key: 'sunset', label: 'Закат', emoji: '🌅' },
  { key: 'food', label: 'Поесть', emoji: '🍜' },
  { key: 'active', label: 'Активно', emoji: '🏄' },
  { key: 'cozy', label: 'Уютно', emoji: '🛋️' },
  { key: 'explore', label: 'Разведать', emoji: '🧭' },
  { key: 'surprise', label: 'Сюрприз', emoji: '🎁' },
];

export const IDEAS = [
  { id: 'promthep', title: 'Закат на мысе Промтеп', emoji: '🌅', category: 'sunset', duration: 120, bestTime: 'sunset', area: 'Раваи', description: 'Приехать за полчаса до заката, сесть на камни подальше от толпы и просто смотреть. Потом ужин в Раваи.' },
  { id: 'karon-viewpoint', title: 'Смотровая Карон и три пляжа', emoji: '🏝️', category: 'sunset', duration: 90, bestTime: 'sunset', area: 'Карон', description: 'Три бухты в одном кадре. Хорошо заезжать по пути с Ката на ужин.' },
  { id: 'kata-noi-sunset', title: 'Ката Ной: плед, закат, тишина', emoji: '🧺', category: 'sunset', duration: 120, bestTime: 'sunset', area: 'Ката Ной', description: 'Маленький пляж, где почти никого нет вечером. Взять фрукты и плед, остаться до темноты.' },
  { id: 'nai-harn-walk', title: 'Прогулка вокруг озера Най Харн', emoji: '🚶', category: 'sunset', duration: 75, bestTime: 'sunset', area: 'Най Харн', description: 'Круг вокруг озера, потом на пляж к закату. Самая спокойная вечерняя прогулка на юге.' },
  { id: 'cafe-del-mar', title: 'Коктейль на закате в Камале', emoji: '🍹', category: 'sunset', duration: 150, bestTime: 'sunset', area: 'Камала', description: 'Бич-клуб, музыка тише к вечеру, ноги в песке. Для "давай хоть раз красиво".' },

  { id: 'rawai-seafood', title: 'Морепродукты на рынке Раваи', emoji: '🦐', category: 'food', duration: 120, bestTime: 'evening', area: 'Раваи', description: 'Выбрать всё живое на рынке, отдать в ресторан напротив, чтобы приготовили. Весело и очень вкусно.' },
  { id: 'old-town-dinner', title: 'Ужин в Старом городе', emoji: '🏮', category: 'food', duration: 150, bestTime: 'evening', area: 'Пхукет-таун', description: 'Сино-португальские улочки, фонарики, маленькие ресторанчики на Thalang Road. Погулять до и после.' },
  { id: 'sunday-market', title: 'Воскресный ночной рынок Lard Yai', emoji: '🎏', category: 'food', duration: 120, bestTime: 'evening', area: 'Пхукет-таун', description: 'Только по воскресеньям с вечера: уличная еда, музыканты, ремесленные лавки. Идти голодными.' },
  { id: 'chalong-pier', title: 'Рыбный ресторан у пирса Чалонг', emoji: '🐟', category: 'food', duration: 120, bestTime: 'evening', area: 'Чалонг', description: 'Столик у воды, лодки, свежая рыба на гриле. Классика, которая не надоедает.' },
  { id: 'breakfast-date', title: 'Долгий завтрак в кафе', emoji: '🥐', category: 'food', duration: 90, bestTime: 'day', area: 'где угодно', description: 'Утро без телефонов: кофе, круассаны, разговоры. Самое недооценённое свидание.' },
  { id: 'cooking-class', title: 'Тайская кулинарная школа', emoji: '👩‍🍳', category: 'food', duration: 180, bestTime: 'day', area: 'Ката / Пхукет-таун', description: 'Вместе готовить том ям и падтай, а потом всё это съесть. Соревновательный режим опционален.' },

  { id: 'kayak-phang-nga', title: 'Каяк по заливу Пханг Нга', emoji: '🛶', category: 'active', duration: 480, bestTime: 'day', area: 'север острова', description: 'Пещеры, лагуны, скалы из воды. Целый день, зато такой, что потом вспоминать неделю.' },
  { id: 'surf-kata', title: 'Серф на Ката', emoji: '🏄', category: 'active', duration: 150, bestTime: 'day', area: 'Ката', description: 'Летом есть волна. Взять доски на двоих, падать, смеяться, греться на солнце.' },
  { id: 'snorkel-coral', title: 'Снорклинг на Коралловом острове', emoji: '🤿', category: 'active', duration: 360, bestTime: 'day', area: 'Чалонг', description: 'Лодка утром, рыбы, обед на острове, обратно к закату.' },
  { id: 'big-buddha-hike', title: 'Пешком к Большому Будде', emoji: '🥾', category: 'active', duration: 180, bestTime: 'day', area: 'Чалонг', description: 'Подъём через джунгли, наверху вид на весь юг. Выходить рано, пока не жарко.' },
  { id: 'muay-thai-show', title: 'Вечер муай-тай на стадионе', emoji: '🥊', category: 'active', duration: 180, bestTime: 'evening', area: 'Патонг / Чалонг', description: 'Посмотреть бои с профессиональной точки зрения. Яна комментирует технику.' },

  { id: 'thai-massage', title: 'Парный тайский массаж', emoji: '💆', category: 'cozy', duration: 120, bestTime: 'any', area: 'рядом с домом', description: 'Два часа, когда можно ничего не планировать. После него только ужин и диван.' },
  { id: 'movie-night', title: 'Киновечер с попкорном дома', emoji: '🍿', category: 'cozy', duration: 150, bestTime: 'evening', area: 'дом', description: 'Фильм выбирает тот, кто проиграл в камень-ножницы-бумага. Правило без телефонов.' },
  { id: 'cinema', title: 'Кино в торговом центре', emoji: '🎬', category: 'cozy', duration: 180, bestTime: 'evening', area: 'Central Phuket', description: 'Кондиционер, большое кресло, большой экран. Потом поужинать там же.' },
  { id: 'board-games', title: 'Настолки в кафе', emoji: '🎲', category: 'cozy', duration: 150, bestTime: 'evening', area: 'Пхукет-таун', description: 'Найти кафе с настолками, взять что-то новое, выяснить, кто из вас стратег.' },
  { id: 'lazy-morning', title: 'Ленивое утро без планов', emoji: '☕', category: 'cozy', duration: 180, bestTime: 'day', area: 'дом', description: 'Поспать, завтрак в кровать, сериал. Иногда лучшее свидание это не выходить из дома.' },

  { id: 'old-town-walk', title: 'Прогулка по Старому городу днём', emoji: '📸', category: 'explore', duration: 150, bestTime: 'day', area: 'Пхукет-таун', description: 'Разноцветные дома, муралы, маленькие кофейни. Фотографировать друг друга.' },
  { id: 'khao-rang', title: 'Холм Кхао Ранг', emoji: '⛰️', category: 'explore', duration: 90, bestTime: 'sunset', area: 'Пхукет-таун', description: 'Вид на весь город, кафе наверху. Хорошо совмещать со Старым городом.' },
  { id: 'boat-avenue', title: 'Вечер на Boat Avenue', emoji: '🛍️', category: 'explore', duration: 150, bestTime: 'evening', area: 'Чернгталай', description: 'По пятницам ночной рынок, рядом много хороших ресторанов. Прогуляться и выбрать по настроению.' },
  { id: 'freedom-beach', title: 'Секретный пляж Фридом', emoji: '🏖️', category: 'explore', duration: 240, bestTime: 'day', area: 'Патонг', description: 'Спуститься по тропе или подъехать на лодке. Белый песок, почти никого, своя маленькая бухта.' },
  { id: 'night-market-chillva', title: 'Рынок Chillva вечером', emoji: '🎶', category: 'explore', duration: 120, bestTime: 'evening', area: 'Пхукет-таун', description: 'Контейнеры, музыка, еда и странные сувениры. Молодёжный и шумный, для настроения.' },

  { id: 'surprise-pick', title: 'Сюрприз: место выбираю я', emoji: '🎁', category: 'surprise', duration: 180, bestTime: 'any', area: 'секрет', description: 'Партнёр узнаёт только время и дресс-код. Всё остальное сюрприз.' },
  { id: 'surprise-route', title: 'Маршрут из трёх загадок', emoji: '🗺️', category: 'surprise', duration: 240, bestTime: 'day', area: 'весь остров', description: 'Три подсказки, три места, в конце подарок или ужин. Готовить заранее, но оно того стоит.' },
  { id: 'surprise-letter', title: 'Письмо и место из прошлого', emoji: '💌', category: 'surprise', duration: 120, bestTime: 'evening', area: 'где всё началось', description: 'Вернуться туда, где было особенно хорошо, и прочитать друг другу короткие письма.' },
];

export function ideaById(id) {
  return IDEAS.find((i) => i.id === id) || null;
}

const SUNSET_START = 17 * 60 + 30;
const SUNSET_END = 19 * 60;

function fits(idea, start, end, weekday) {
  const len = end - start;
  if (idea.id === 'sunday-market' && weekday !== 6) return false;
  if (idea.id === 'boat-avenue' && weekday !== 4) return false;
  if (idea.bestTime === 'sunset') return start <= SUNSET_START + 30 && end >= SUNSET_END - 15;
  if (idea.bestTime === 'evening') return end >= 19 * 60 && start >= 15 * 60 - 1 || (start >= 17 * 60);
  if (idea.bestTime === 'day') return start < 16 * 60 && len >= Math.min(idea.duration, 120);
  return true;
}

function seededShuffle(list, seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Picks n ideas that suit the window; falls back to anything when few fit.
export function pickIdeas({ date, start, end, weekday }, n = 3) {
  const len = Math.max(0, end - start);
  const good = IDEAS.filter((i) => fits(i, start, end, weekday) && i.duration <= Math.max(len, 60) + 30);
  const pool = good.length >= n ? good : [...good, ...IDEAS.filter((i) => !good.includes(i) && i.duration <= len + 60)];
  const shuffled = seededShuffle(pool.length ? pool : IDEAS, `${date}:${start}`);
  const out = [];
  const seenCats = new Set();
  for (const idea of shuffled) {
    if (out.length >= n) break;
    if (seenCats.has(idea.category) && shuffled.length > n) continue;
    seenCats.add(idea.category);
    out.push(idea);
  }
  for (const idea of shuffled) {
    if (out.length >= n) break;
    if (!out.includes(idea)) out.push(idea);
  }
  return out;
}
