// Per-user UI preferences (stored in the settings table).
import { TZ, isZone } from './config.js';
import { getJson, setJson } from './db.js';

const DEFAULTS = { inputTz: TZ, showSecondTz: false };
const DEFAULT_BY_USER = { yana: { showSecondTz: true } }; // Яна works on Moscow time

export function getUserPrefs(userKey) {
  const stored = getJson(`prefs:${userKey}`, {}) || {};
  const p = { ...DEFAULTS, ...(DEFAULT_BY_USER[userKey] || {}), ...stored };
  if (!isZone(p.inputTz)) p.inputTz = TZ;
  p.showSecondTz = Boolean(p.showSecondTz);
  return { inputTz: p.inputTz, showSecondTz: p.showSecondTz };
}

export function setUserPrefs(userKey, patch) {
  const cur = getJson(`prefs:${userKey}`, {}) || {};
  const next = { ...cur };
  if (patch.inputTz !== undefined && isZone(patch.inputTz)) next.inputTz = patch.inputTz;
  if (patch.showSecondTz !== undefined) next.showSecondTz = Boolean(patch.showSecondTz);
  setJson(`prefs:${userKey}`, next);
  return getUserPrefs(userKey);
}
