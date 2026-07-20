const cron   = require('node-cron');
const { query } = require('../config/db');
const { runUpdates } = require('../routes/update');

let currentJob = null;

async function scheduleUpdates() {
  const cfg = await query('SELECT * FROM update_config LIMIT 1');
  const config = cfg.rows[0] || { schedule_time: '02:00' };
  const [hour, minute] = config.schedule_time.split(':');

  if (currentJob) currentJob.destroy();

  currentJob = cron.schedule(`${minute} ${hour} * * *`, async () => {
    console.log(`[Scheduler] Auto-update dimulai: ${new Date().toISOString()}`);
    try {
      const clients = await query(
        "SELECT id FROM clients WHERE os_type='linux' AND ssh_ready=true AND status='online'"
      );
      if (clients.rows.length > 0) {
        await runUpdates(clients.rows.map(c => c.id), null);
        console.log(`[Scheduler] Update selesai: ${clients.rows.length} clients`);
      }
    } catch (e) {
      console.error('[Scheduler] Update error:', e.message);
    }
  }, { timezone: 'Asia/Jakarta' });

  console.log(`[Scheduler] Auto-update dijadwalkan: ${config.schedule_time} WIB`);
}

function init() {
  scheduleUpdates().catch(console.error);
}

module.exports = { init, scheduleUpdates };
