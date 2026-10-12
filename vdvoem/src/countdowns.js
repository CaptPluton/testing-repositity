import { USERS, ANNIVERSARY } from './config.js';
import { nextOccurrence } from './time.js';

export function countdowns() {
  const items = [
    { key: 'anniversary', label: 'Годовщина', mmdd: ANNIVERSARY, emoji: '💞' },
    ...USERS.map((u) => ({ key: `birthday_${u.key}`, label: `День рождения ${u.key === 'yana' ? 'Яны' : 'Вовы'}`, mmdd: u.birthday, emoji: '🎂' })),
  ].map((c) => ({ ...c, ...nextOccurrence(c.mmdd) }));
  return items.sort((a, b) => a.daysLeft - b.daysLeft).map(({ mmdd, ...rest }) => rest);
}
