// ── services/offlineSweep.js ───────────────────────
// Catches clients whose agent stopped sending heartbeats without a clean
// WS disconnect — flips them offline + logs the transition.
const cron = require('node-cron');
const { query } = require('../config/db');
const { recordStatusChange } = require('./statusHistory');

function init() {
  cron.schedule('* * * * *', async () => {
    try {
      const stale = await query(
        "SELECT id FROM clients WHERE status='online' AND last_seen < NOW() - INTERVAL 5 MINUTE"
      );
      for (const c of stale.rows) {
        await recordStatusChange(c.id, 'offline');
        await query("UPDATE clients SET status='offline' WHERE id=?", [c.id]);
      }
    } catch (e) {
      console.error('[OfflineSweep] error:', e.message);
    }
  }, { timezone: 'Asia/Jakarta' });
  console.log('[OfflineSweep] Dijadwalkan tiap 1 menit (threshold 5 menit)');
}

module.exports = { init };
