// ── services/statusHistory.js ──────────────────────
const { query } = require('../config/db');

// Call BEFORE the caller's own UPDATE that sets clients.status = newStatus,
// so the SELECT here still sees the pre-update value.
async function recordStatusChange(clientId, newStatus) {
  const cur = await query('SELECT status FROM clients WHERE id=?', [clientId]);
  const oldStatus = cur.rows[0]?.status;
  if (oldStatus && oldStatus !== newStatus) {
    await query(
      'INSERT INTO client_status_history (client_id, status, changed_at) VALUES (?,?,NOW())',
      [clientId, newStatus]
    );
  }
}

module.exports = { recordStatusChange };
