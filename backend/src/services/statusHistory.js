// ── services/statusHistory.js ──────────────────────
const { query } = require('../config/db');
const notifier = require('./notifier');

// Call BEFORE the caller's own UPDATE that sets clients.status = newStatus,
// so the SELECT here still sees the pre-update value.
async function recordStatusChange(clientId, newStatus) {
  const cur = await query('SELECT status, name FROM clients WHERE id=?', [clientId]);
  const oldStatus = cur.rows[0]?.status;
  if (oldStatus && oldStatus !== newStatus) {
    await query(
      'INSERT INTO client_status_history (client_id, status, changed_at) VALUES (?,?,NOW())',
      [clientId, newStatus]
    );
    // Semua transisi status lewat sini -- titik tunggal buat alert offline/online.
    const name = cur.rows[0]?.name || `Client #${clientId}`;
    if (newStatus === 'offline') {
      notifier.raiseAlert(clientId, 'offline', `🔴 ${name} OFFLINE`).catch(() => {});
    } else if (newStatus === 'online' && oldStatus === 'offline') {
      if (notifier.resolveAlert(clientId, 'offline')) {
        notifier.notify(clientId, 'online', `🟢 ${name} kembali ONLINE`).catch(() => {});
      }
    }
  }
}

module.exports = { recordStatusChange };
