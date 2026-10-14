// Static configuration for the two-person app. Telegram IDs are not secrets,
// but every value can be overridden through the environment.
export const TZ = process.env.TZ_NAME || 'Asia/Bangkok';
export const AWAKE = { start: 8 * 60, end: 23 * 60 };

// Zones the couple can type times in. The calendar itself is always drawn in TZ (Phuket).
export const MSK_TZ = 'Europe/Moscow';
export const ZONES = [
  { id: 'Asia/Bangkok', label: 'Пхукет', short: 'Пхукет', emoji: '🌴' },
  { id: MSK_TZ, label: 'Москва', short: 'МСК', emoji: '🏙️' },
];
export function zoneById(id) {
  return ZONES.find((z) => z.id === id) || null;
}
export function isZone(id) {
  return Boolean(zoneById(id));
}
export const APP_NAME = process.env.APP_NAME || 'Вдвоём';
export const MIN_FREE_WINDOW = 30; // minutes

export const USERS = [
  {
    key: 'yana',
    id: Number(process.env.YANA_ID || 573832468),
    name: 'Яна',
    username: process.env.YANA_USERNAME || 'yana_obgolts',
    color: '#E8557A',
    birthday: '07-25',
    defaultPetNames: ['киса', 'сиськонавт', 'зай'],
  },
  {
    key: 'vova',
    id: Number(process.env.VOVA_ID || 481730749),
    name: 'Вова',
    username: process.env.VOVA_USERNAME || 'iency',
    color: '#3E8EF7',
    birthday: '03-03',
    defaultPetNames: [],
  },
];

export const ANNIVERSARY = '09-21';
export const GOOGLE_OWNER_KEY = process.env.GOOGLE_OWNER_KEY || 'yana';

// Suggestions shown to a user whose pet-name list is still empty (Vova picks how to call Yana).
export const PET_NAME_OPTIONS = [
  'солнце', 'зайка', 'котёнок', 'любимая', 'малышка', 'Янчик',
  'моя королева', 'лисёнок', 'сладкая', 'птичка', 'чудо', 'мышка',
];

export const ALLOWED_IDS = new Set(USERS.map((u) => u.id));

export function userById(id) {
  return USERS.find((u) => u.id === Number(id)) || null;
}
export function userByKey(key) {
  return USERS.find((u) => u.key === key) || null;
}
export function partnerOf(key) {
  return USERS.find((u) => u.key !== key) || null;
}

export const ENV = {
  botToken: process.env.BOT_TOKEN || '',
  port: Number(process.env.PORT || 3000),
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
  dataDir: process.env.DATA_DIR || './data',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  devUser: process.env.DEV_USER || '',
  disableBot: process.env.DISABLE_BOT === '1',
  miniAppShortName: process.env.MINI_APP_SHORT_NAME || 'app',
};
