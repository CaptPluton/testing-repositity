# Vdvoem — API contract between the Mini App (public/) and the server (src/web/server.js)

All times are **minutes since local midnight** in `Asia/Bangkok` (0..1440). Dates are `YYYY-MM-DD`.
Weekday: `0 = Monday … 6 = Sunday`. UI language: Russian.

## Auth
Every `/api/*` request sends header `X-Telegram-Init-Data: <window.Telegram.WebApp.initData>`.
- 401 `{error:'bad_init_data'}` — signature invalid / missing.
- 403 `{error:'not_allowed'}` — user is not one of the two.
Dev mode: when the server runs with `DEV_USER=yana|vova`, a missing header is accepted and the request acts as that user.

## Users
Two fixed users, referenced by `key`:
```json
{ "key": "yana", "id": 573832468, "name": "Яна", "username": "yana_obgolts", "color": "#E8557A", "birthday": "07-25" }
{ "key": "vova", "id": 481730749, "name": "Вова", "username": "iency",        "color": "#3E8EF7", "birthday": "03-03" }
```

## GET /api/me
```json
{
  "me":      { "key":"yana","id":573832468,"name":"Яна","username":"yana_obgolts","color":"#E8557A","birthday":"07-25" },
  "partner": { "key":"vova", ... },
  "callPartner": "киса",             // random pick from my petNames for the partner (fallback: partner.name)
  "petNames": ["киса","сиськонавт","зай"],   // my list (editable in settings)
  "petNameOptions": ["солнце","зайка", ...],  // suggestions to pick from (non-empty only while my list is empty)
  "tz": "Asia/Bangkok",
  "today": "2026-10-12",
  "nowMinutes": 615,
  "awake": { "start": 480, "end": 1380 },
  "countdowns": [ { "key":"anniversary","label":"Годовщина","date":"2027-09-21","daysLeft":344,"emoji":"💞" },
                  { "key":"birthday_vova","label":"День рождения Вовы","date":"2027-03-03","daysLeft":142,"emoji":"🎂" } ],
  "google": { "connected": true, "owner": "yana", "canConnect": true },
  "appName": "Вдвоём"
}
```

## GET /api/week?start=YYYY-MM-DD
`start` must be a Monday; omitted → current week. Returns 7 days.
```json
{
  "start": "2026-10-12",
  "days": [
    {
      "date": "2026-10-12", "weekday": 0, "isToday": true,
      "busy": {
        "yana": [ { "id":"a:12","start":720,"end":840,"title":"Английский","source":"activity","kind":"recurring","userKey":"yana","editable":true } ,
                  { "id":"g:abc","start":600,"end":660,"title":"Zoom: созвон с клиентом","source":"google","kind":"once","userKey":"yana","editable":false } ],
        "vova": [ { "id":"a:3","start":660,"end":715,"title":"Психолог","source":"activity","kind":"recurring","userKey":"vova","editable":true } ]
      },
      "commonFree": [ { "start": 480, "end": 600 }, { "start": 840, "end": 1380 } ],   // both free, ≥30 min, inside awake hours
      "dates": [ DateInvite ]   // accepted or pending dates on this day (also present in busy of both users as source:"date" when accepted)
    }
  ]
}
```

## Activities (manual schedule, both users may edit both)
`GET /api/activities` → `{ activities: [Activity] }`
```json
Activity: { "id": 12, "userKey":"yana", "title":"Английский", "kind":"recurring", "weekday":0, "date":null, "start":720, "end":840 }
Activity: { "id": 13, "userKey":"vova", "title":"Зал",        "kind":"once",      "weekday":null, "date":"2026-10-15", "start":1080, "end":1170 }
```
- `POST /api/activities` body `{ userKey, title, kind, weekday?, date?, start, end }` → `{ activity }` (400 on validation error: `{error, message}`)
- `PATCH /api/activities/:id` body: any subset of the same fields → `{ activity }`
- `DELETE /api/activities/:id` → `{ ok: true }`

## Date ideas (Phuket)
`GET /api/ideas` →
```json
{ "categories": [ {"key":"sunset","label":"Закат","emoji":"🌅"}, {"key":"food","label":"Поесть","emoji":"🍜"},
                  {"key":"active","label":"Активно","emoji":"🏄"}, {"key":"cozy","label":"Уютно","emoji":"🛋️"},
                  {"key":"explore","label":"Разведать","emoji":"🧭"}, {"key":"surprise","label":"Сюрприз","emoji":"🎁"} ],
  "ideas": [ { "id":"promthep","title":"Закат на мысе Промтеп","emoji":"🌅","category":"sunset","duration":120,
               "bestTime":"sunset","area":"Раваи","description":"..." } ] }
```
`GET /api/ideas/pick?date=YYYY-MM-DD&start=&end=` → `{ ideas: [3 ideas that fit the window], line: "одна тёплая фраза от бота" }`

## Dates (invites)
```json
DateInvite: { "id": 5, "fromKey":"yana", "toKey":"vova", "title":"Ужин у моря", "emoji":"🌅",
              "date":"2026-10-14", "start":1110, "end":1260, "note":"скучаю по тебе",
              "status":"pending" | "accepted" | "declined" | "cancelled", "createdAt":"2026-10-12T03:00:00Z" }
```
- `GET /api/dates` → `{ dates: [DateInvite] }` (newest first)
- `POST /api/dates` body `{ title, emoji, date, start, end, note?, ideaId? }` → `{ date: DateInvite }` — the bot posts an invite card to the couple's group chat.
- `POST /api/dates/:id/respond` body `{ action: "accept" | "decline" | "counter", date?, start?, end? }` (only the invited user; `counter` requires a new slot and flips from/to, status back to `pending`) → `{ date }`
- `DELETE /api/dates/:id` → cancel (either user) → `{ ok: true }`

## Settings
- `GET /api/settings` → `{ petNames: [..], petNameOptions: [..] }`
- `PATCH /api/settings` body `{ petNames: ["..."] }` → same shape

## Google Calendar (Yana's one shared calendar)
- `GET /api/google/status` → `{ connected, owner:"yana", canConnect, email? }` (`canConnect` true only for the owner)
- `GET /api/google/auth-url` → `{ url }` — open with `Telegram.WebApp.openLink(url)` (external browser), owner only
- `DELETE /api/google` → `{ ok: true }`
- Browser route (not JSON): `GET /auth/google/callback` — shows a small "Готово, можно закрыть" page.

## Health
`GET /healthz` → `ok`

---------------------------------------------------------------------------
# v2 additions: time zones (Пхукет / МСК) and tasks with reminders
---------------------------------------------------------------------------

## Time zones
The calendar timeline is ALWAYS drawn in Phuket time (`Asia/Bangkok`, UTC+7). Activities and tasks may be
*entered* in another zone; the server converts them. Supported zones (fixed offsets, no DST):

`GET /api/me` gains:
```json
"zones": [
  { "id": "Asia/Bangkok",  "label": "Пхукет", "short": "Пхукет", "emoji": "🌴", "offsetMin": 420 },
  { "id": "Europe/Moscow", "label": "Москва", "short": "МСК",    "emoji": "🏙️", "offsetMin": 180 }
],
"inputTz": "Europe/Moscow",      // my last-used zone for entering times (default Asia/Bangkok)
"showSecondTz": true,            // show a second clock (МСК) next to Phuket times on the timeline
"secondTz": "Europe/Moscow"
```
`GET/PATCH /api/settings` also carry `inputTz` and `showSecondTz` (PATCH accepts any subset of
`{ petNames, inputTz, showSecondTz }`).

### Activities with a zone
`Activity` gains `"tz": "Asia/Bangkok" | "Europe/Moscow"`. `start`, `end`, `weekday`, `date` are stored
**in that zone** (what the user typed). POST/PATCH accept `tz` (default `Asia/Bangkok`). `end` ≤ 1440.

In `/api/week` the busy items for activities are converted to Phuket time and clipped to the day
(an МСК event late in the evening may land on the next Phuket day, or be split across two days):
```json
{ "id":"a:12", "activityId":12, "start":1080, "end":1140, "title":"Созвон с командой",
  "source":"activity", "kind":"recurring", "userKey":"yana", "editable":true,
  "tz":"Europe/Moscow",
  "orig": { "date":null, "weekday":0, "start":840, "end":900 },   // as typed, in tz
  "origLabel": "14:00–15:00 МСК",                                  // null when tz is Asia/Bangkok
  "part": null | "start" | "end" }                                 // set when split by midnight
```
To edit, open the sheet with `orig` + `tz` (not the converted start/end). Google events and dates are
already absolute; they carry `"tz":"Asia/Bangkok"` and `origLabel: null`.

## Tasks & reminders
```json
Task: {
  "id": 7, "ownerKey": "yana" | "vova" | "both", "createdBy": "vova",
  "title": "Оплатить аренду", "note": "",
  "dueDate": "2026-10-16" | null,        // in tz
  "dueTime": 600 | null,                 // minutes in tz; null = all-day (reminders fire at 09:00 tz)
  "tz": "Europe/Moscow",
  "remind": [0, 60],                     // minutes before due: 0 = at due, 15, 60, 1440 (day before)…
  "repeat": "none" | "daily" | "weekdays" | "weekly" | "monthly",
  "status": "open" | "done",
  "doneAt": null | ISO, "doneBy": null | "yana",
  "snoozeUntil": null | ISO,
  "dueAt": null | ISO,                   // absolute due instant
  "duePhuket": null | { "date": "2026-10-16", "minutes": 840 },  // for display on the Phuket timeline
  "dueLabel": "пт, 16 октября · 10:00 МСК (14:00 Пхукет)" | "пт, 16 октября" | null,
  "nextReminderAt": null | ISO,
  "overdue": false,
  "createdAt": ISO
}
```
- `GET /api/tasks?status=open|done|all` (default `open`) → `{ tasks: [Task] }`, sorted: overdue, then by dueAt, undated last.
- `POST /api/tasks` body `{ ownerKey, title, note?, dueDate?, dueTime?, tz?, remind?, repeat? }` → `201 { task }`.
  Defaults: tz = my inputTz, remind = `[0]` when dueTime set, `[0]` (09:00) for all-day, `[]` when no dueDate.
- `PATCH /api/tasks/:id` any subset of the same fields → `{ task }` (changing due/remind resets fired reminders).
- `POST /api/tasks/:id/done` → `{ task }`. A repeating task comes back `status:"open"` with the next `dueDate`.
- `POST /api/tasks/:id/undo` → `{ task }` (reopen a done task).
- `POST /api/tasks/:id/snooze` body `{ minutes }` → `{ task }`.
- `DELETE /api/tasks/:id` → `{ ok: true }`.
- `GET /api/week` days gain `"tasks": [ { "id", "title", "ownerKey", "minutes": 840 | null, "status", "overdue" } ]`
  (tasks due on that Phuket day; `minutes` in Phuket time, null = all-day).

Reminders are delivered by the bot: privately to the owner (or to the couple's group for `both`, or as a
fallback when the owner never opened a private chat with the bot), with buttons «Готово ✅», «+15 мин», «+1 ч», «Завтра».
Bot phrases: «напомни мне завтра в 10 по мск позвонить маме», «напомни Вове в пятницу купить цветы»,
«напоминай каждый день в 9 пить витамины», «задачи».
