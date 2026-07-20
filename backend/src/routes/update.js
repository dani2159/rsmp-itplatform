// ── routes/update.js ───────────────────────────────
const router     = require('express').Router();
const { NodeSSH } = require('node-ssh');
const { query }  = require('../config/db');
const { requireOperator } = require('../middleware/auth');
const fs         = require('fs');

const SSH_KEY = process.env.SSH_KEY_PATH || '/opt/rsmp-it-platform/keys/rs_master_key';

// GET /api/update/config
router.get('/config', async (req, res) => {
  try {
    const r = await query('SELECT * FROM update_config ORDER BY id LIMIT 1');
    res.json(r.rows[0] || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/update/config
router.put('/config', requireOperator, async (req, res) => {
  try {
    const { schedule_time, mode, bandwidth_kb, auto_restart, notify_users } = req.body;
    const existing = await query('SELECT id FROM update_config ORDER BY id LIMIT 1');
    const id = existing.rows[0]?.id;
    if (id) {
      await query(
        `UPDATE update_config SET schedule_time=?, mode=?, bandwidth_kb=?,
         auto_restart=?, notify_users=?, updated_at=NOW() WHERE id=?`,
        [schedule_time, mode, bandwidth_kb, auto_restart, notify_users, id]
      );
    } else {
      await query(
        `INSERT INTO update_config (schedule_time, mode, bandwidth_kb, auto_restart, notify_users)
         VALUES (?,?,?,?,?)`,
        [schedule_time, mode, bandwidth_kb, auto_restart, notify_users]
      );
    }
    await query("INSERT INTO audit_logs (user_id, action, details) VALUES (?,'update_config',?)",
      [req.session.userId, JSON.stringify({ schedule_time, mode })]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/update/run — manual update ke client tertentu
router.post('/run', requireOperator, async (req, res) => {
  const { clientIds } = req.body;
  if (!clientIds?.length) return res.status(400).json({ error: 'clientIds kosong' });

  res.json({ message: `Update dimulai untuk ${clientIds.length} client` });

  // Jalankan async
  runUpdates(clientIds, req.session.userId).catch(console.error);
});

// POST /api/update/run-all — update semua Linux client
router.post('/run-all', requireOperator, async (req, res) => {
  const r = await query("SELECT id FROM clients WHERE os_type='linux' AND ssh_ready=true AND status='online'");
  const clientIds = r.rows.map(c => c.id);
  res.json({ message: `Update dimulai untuk ${clientIds.length} client online`, count: clientIds.length });
  runUpdates(clientIds, req.session.userId).catch(console.error);
});

async function updateClient(client) {
  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: client.ip_address, port: client.ssh_port || 22,
      username: client.ssh_user || 'rsadmin',
      privateKey: fs.readFileSync(SSH_KEY, 'utf8'),
      readyTimeout: 10000,
    });

    const cfg = await query('SELECT * FROM update_config LIMIT 1');
    const c   = cfg.rows[0] || {};
    const dlLimitOpt = c.bandwidth_kb
      ? `-o Acquire::http::Dl-Limit=${parseInt(c.bandwidth_kb, 10)} \\\n  `
      : '';

    const updateScript = `
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq 2>&1
apt-get upgrade -y -qq \\
  ${dlLimitOpt}-o Dpkg::Options::="--force-confdef" \\
  -o Dpkg::Options::="--force-confold" 2>&1
apt-get autoremove -y -qq 2>&1
echo "UPDATE_DONE"
    `.trim();

    const r = await ssh.execCommand(`sudo bash -c '${updateScript}'`);
    ssh.dispose();

    const ok = r.stdout.includes('UPDATE_DONE');
    await query('UPDATE clients SET last_update=NOW() WHERE id=?', [client.id]);

    return { ok, output: r.stdout + (r.stderr ? '\n' + r.stderr : '') };
  } catch (e) {
    ssh.dispose();
    return { ok: false, error: e.message };
  }
}

async function runUpdates(clientIds, userId) {
  const clients = (await query('SELECT * FROM clients WHERE id IN (?)', [clientIds])).rows;
  const PARALLEL = 5;

  for (let i = 0; i < clients.length; i += PARALLEL) {
    const batch = clients.slice(i, i + PARALLEL);
    await Promise.allSettled(batch.map(async (c) => {
      const result = await updateClient(c);
      await query(
        `INSERT INTO update_jobs (client_id, status, output, finished_at)
         VALUES (?,?,?,NOW())`,
        [c.id, result.ok ? 'success' : 'failed', result.output || result.error]
      );
    }));
  }
}

// GET /api/update/history
router.get('/history', async (req, res) => {
  try {
    const r = await query(`
      SELECT uj.*, c.name as client_name, c.ip_address
      FROM update_jobs uj
      LEFT JOIN clients c ON uj.client_id=c.id
      ORDER BY uj.created_at DESC LIMIT 100
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.runUpdates = runUpdates;
