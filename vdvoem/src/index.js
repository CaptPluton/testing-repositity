import cron from 'node-cron';
import { ENV, TZ, APP_NAME } from './config.js';
import { openDb } from './db.js';
import { createApp } from './web/server.js';
import { createBot } from './bot/index.js';

openDb();

let botCtl = null;
if (ENV.botToken && !ENV.disableBot) {
  botCtl = createBot();
} else {
  console.warn('BOT_TOKEN missing or DISABLE_BOT=1: running web/API only');
}

const app = createApp({ bot: botCtl });
const server = app.listen(ENV.port, () => console.log(`${APP_NAME} web listening on :${ENV.port} (${ENV.publicUrl || 'no PUBLIC_URL'})`));

if (botCtl) {
  botCtl.start().catch((e) => console.error('Bot failed to start:', e.message));
  cron.schedule('0 8 * * *', () => botCtl.sendMorningDigest().catch((e) => console.error('digest failed', e.message)), { timezone: TZ });
  cron.schedule('* * * * *', () => botCtl.sendReminders().catch((e) => console.error('reminders failed', e.message)), { timezone: TZ });
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`${sig} received, shutting down`);
    server.close();
    botCtl?.stop();
    setTimeout(() => process.exit(0), 500).unref();
  });
}
