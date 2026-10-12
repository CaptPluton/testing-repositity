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
