// Optional natural-language layer on top of the rule-based parser.
// Enabled only when ANTHROPIC_API_KEY is present; otherwise parseCommand() alone is used.
import Anthropic from '@anthropic-ai/sdk';
import { ENV, USERS } from '../config.js';
import { today, weekdayOf, WEEKDAYS_RU } from '../time.js';

let client = null;
export function assistantEnabled() {
  return Boolean(ENV.anthropicKey);
}
function getClient() {
  if (!client) client = new Anthropic({ apiKey: ENV.anthropicKey });
  return client;
}

const SYSTEM = `Ты парсер команд для семейного календаря пары (Яна и Вова, Пхукет, часовой пояс Asia/Bangkok).
Преобразуй сообщение в JSON без пояснений. Поля:
{"intent":"add|move|delete|show_today|show_tomorrow|show_week|show_free|date_wish|miss|help|chat",
 "userKey":"yana|vova", "title":string|null, "kind":"recurring|once"|null,
 "weekday":0-6|null (0=понедельник), "date":"YYYY-MM-DD"|null, "start":minutes|null, "end":minutes|null,
 "reply":string|null}
Правила: userKey = о чьём расписании речь (Вову зовут также киса, сиськонавт, зай; «мне» = отправитель).
Если указан день недели без слова «каждый/по», это ближайшая такая дата (kind once). Без длительности считай 60 минут.
intent "chat" для всего, что не про расписание, тогда заполни reply одной тёплой фразой с лёгкой шуткой, по-русски.
Отвечай ТОЛЬКО JSON.`;

export async function parseWithClaude(text, { senderKey }) {
  const t = today();
  const res = await getClient().beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 600,
    system: SYSTEM,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{
      role: 'user',
      content: `Сегодня ${t} (${WEEKDAYS_RU[weekdayOf(t)]}). Отправитель: ${senderKey} (${USERS.find((u) => u.key === senderKey)?.name}).\nСообщение: ${text}`,
    }],
  });
  if (res.stop_reason === 'refusal') return null;
  const textBlock = res.content.find((b) => b.type === 'text');
  if (!textBlock) return null;
  const m = /\{[\s\S]*\}/.exec(textBlock.text);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]);
    if (!parsed.userKey) parsed.userKey = senderKey;
    return parsed;
  } catch {
    return null;
  }
}
