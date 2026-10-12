# Вдвоём · календарь для двоих в Telegram

Приватный Telegram-бот + Mini App для Яны и Вовы. Один общий календарь: где каждый занят, когда свободны оба, приглашения на свидания с идеями по Пхукету, утренний план дня в общем чате.

- Работает **только** для двух Telegram-аккаунтов (`573832468`, `481730749`). Остальным бот отвечает отказом, из чужих групп уходит сам.
- Расписание Яны: занятия вручную + её Google Календарь (Zoom-созвоны она дублирует туда сама).
- Расписание Вовы: только вручную (в приложении или фразой боту).
- Часовой пояс `Asia/Bangkok`, «живые часы» 08:00–23:00.
- Свидание принято → событие попадает в Google Календарь Яны, за час бот напоминает в чате.
- Каждый день в 08:00 бот присылает в общий чат план дня, общие окна и обратный отсчёт до дней рождения (25.07, 03.03) и годовщины (21.09).

## Структура

```
vdvoem/
  src/index.js          запуск: БД, бот (long polling), веб-сервер, cron
  src/config.js         пользователи, часовой пояс, переменные окружения
  src/db.js             SQLite (встроенный node:sqlite, без нативных модулей): занятия, свидания, настройки
  src/schedule.js       занятость обоих → общие свободные окна
  src/google.js         OAuth и Google Calendar REST
  src/dates.js          жизненный цикл приглашений
  src/ideas.js          идеи свиданий по Пхукету
  src/bot/              grammY-бот: команды, разбор русских фраз, карточки приглашений, дайджест
  src/web/server.js     Express: API для Mini App + статика
  public/               Mini App (HTML/CSS/JS без сборки)
  docs/API.md           контракт API
  test/                 node --test
```

## Деплой на Railway (10 минут)

### Вариант A: скриптом из облачной сессии Claude
В настройках облачного окружения Claude (меню окружения в заголовке сессии → Edit):
1. **Network access** → разрешить домены `railway.com`, `backboard.railway.com`, `api.telegram.org`, `telegram.org` (галку «package managers» оставить).
2. **Secrets / Environment variables**: `RAILWAY_API_TOKEN` (railway.com/account/tokens, личный токен без привязки к команде) и `BOT_TOKEN` (новый токен после `/revoke` в BotFather). По желанию `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`.
3. Запустить новую сессию в этом окружении и попросить: «Задеплой vdvoem на Railway через scripts/deploy-railway.sh». Скрипт создаёт проект, домен, переменные, volume `/data` и деплоит. Его можно запустить и с ноутбука: `RAILWAY_API_TOKEN=… BOT_TOKEN=… ./scripts/deploy-railway.sh`.

### Вариант B: руками через сайт
### 1. Railway
1. railway.com → **New Project → Deploy from GitHub repo** → этот репозиторий, ветка `claude/fervent-darwin-h1p97y` (или `main` после мерджа).
2. В настройках сервиса: **Settings → Root Directory** = `vdvoem`.
3. **Settings → Networking → Generate Domain**. Скопируй домен, например `vdvoem-production.up.railway.app`.
4. **Variables** (вкладка Variables → Raw Editor):
   ```
   BOT_TOKEN=<токен из @BotFather>
   PUBLIC_URL=https://<твой домен>.up.railway.app
   MINI_APP_SHORT_NAME=app
   DATA_DIR=/data
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   GOOGLE_CALENDAR_ID=primary
   ```
5. **Volume**: правый клик по сервису → **Add Volume** → mount path `/data`. Без этого база обнулится при каждом редеплое.
6. Deploy. В логах должно появиться `Bot @... is polling` и `web listening`.

### 2. BotFather
1. `/mybots` → твой бот → **Bot Settings → Menu Button** → задать URL `https://<домен>` (бот также ставит кнопку сам при старте).
2. `/newapp` → выбрать бота → название «Вдвоём», короткое описание, картинка 640×360, **Web App URL** = `https://<домен>`, **short name** = `app`. Так появится прямая ссылка `https://t.me/<бот>/app`, которая открывает Mini App из группового чата.
3. `/setprivacy` → **Disable**, чтобы бот видел обычные сообщения в группе (иначе ему нужно писать с @упоминанием или ответом на его сообщение).
4. `/setjoingroups` → Enable.

### 3. Общий чат
Создай группу на троих: ты, Вова, бот. Напиши в ней `/start`. Бот запомнит этот чат как «штаб»: сюда пойдут утренние дайджесты, приглашения и напоминания.

### 4. Google Календарь (делает Яна, один раз)
1. console.cloud.google.com → новый проект → **APIs & Services → Library → Google Calendar API → Enable**.
2. **OAuth consent screen**: тип External, заполнить название и email, добавить себя в **Test users** (приложение остаётся в режиме Testing, публиковать не нужно).
3. **Credentials → Create credentials → OAuth client ID → Web application**. Authorized redirect URI: `https://<домен>/auth/google/callback`.
4. Скопировать Client ID и Client secret в переменные Railway, редеплой.
5. В Mini App → вкладка «Ещё» → **Подключить Google Календарь**. Откроется браузер, после согласия вернётся «Готово».

Используется только scope `calendar.events`: читать события и записывать свидания в календарь `GOOGLE_CALENDAR_ID` (по умолчанию основной).

### 5. Необязательно: ИИ-ассистент в чате
Фразы вида «добавь Вове зал в среду 18:00-19:30», «перенеси вокал на пятницу», «что сегодня», «когда свободны» бот понимает без ИИ. Если задать `ANTHROPIC_API_KEY`, он начнёт понимать и свободные формулировки (модель `claude-opus-5-5`, включён серверный fallback на отказы).

## Локальный запуск
```bash
cd vdvoem && npm install
DISABLE_BOT=1 DEV_USER=yana BOT_TOKEN=x PORT=3000 DATA_DIR=./data npm start
# http://localhost:3000  — Mini App в режиме разработки от имени Яны
npm test
```
`public/index.html?mock=1` открывает интерфейс на тестовых данных вообще без сервера.

## Безопасность
- Токен бота хранится только в переменных окружения. Токен, который побывал в чате, лучше перевыпустить в @BotFather (`/revoke`) и вставить новый в Railway.
- Каждый запрос Mini App проверяется подписью `initData` (HMAC с токеном бота) и списком из двух ID.
- Google-токены лежат в SQLite на volume Railway, наружу не отдаются.
