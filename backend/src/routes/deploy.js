// ── routes/deploy.js ───────────────────────────────
const router     = require('express').Router();
const { NodeSSH } = require('node-ssh');
const { query }  = require('../config/db');
const { requireOperator } = require('../middleware/auth');
const { v4: uuid } = require('uuid');
const fs         = require('fs');
const path       = require('path');

const SSH_KEY    = process.env.SSH_KEY_PATH || '/opt/rsmp-it-platform/keys/rs_master_key';
const SCRIPT_DIR = path.join(process.env.APP_DIR || '/opt/rsmp-it-platform', 'scripts');

const SCRIPTS = {
  '01': { name: 'Install Aplikasi RS', file: '01_install_apps.sh' },
  '02': { name: 'Setup Auto-Update', file: '02_autoupdate.sh' },
  '03': { name: 'Hardening & Konfigurasi', file: '03_hardening.sh' },
  'all': { name: 'Semua Script (01+02+03)', file: null },
};

// App key valid untuk 01_install_apps.sh. Whitelist -> cegah injeksi shell.
const APP_KEYS = ['libreoffice', 'firefox', 'rustdesk', 'anydesk', 'pdf', 'foxit', 'archive', 'printer', 'media', 'extras'];

// GET /api/deploy/jobs
router.get('/jobs', async (req, res) => {
  try {
    const r = await query(`
      SELECT dj.*, u.full_name as created_by_name
      FROM deploy_jobs dj
      LEFT JOIN users u ON dj.created_by=u.id
      ORDER BY dj.created_at DESC LIMIT 50
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/deploy/jobs/:id
router.get('/jobs/:id', async (req, res) => {
  try {
    const r = await query('SELECT * FROM deploy_jobs WHERE id=?', [req.params.id]);
    const job = r.rows[0];
    // MariaDB JSON = LONGTEXT -> driver balikin string. Parse biar frontend
    // bisa baca job.results.results (hasil per-client) & summary.
    if (job && typeof job.results === 'string') {
      try { job.results = JSON.parse(job.results); } catch { /* biarkan apa adanya */ }
    }
    res.json(job);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/deploy/run
router.post('/run', requireOperator, async (req, res) => {
  const { scriptType, clientIds, apps } = req.body;
  if (!scriptType || !clientIds?.length) {
    return res.status(400).json({ error: 'scriptType dan clientIds wajib' });
  }

  const script = SCRIPTS[scriptType];
  if (!script) return res.status(400).json({ error: 'Script tidak valid' });

  // Filter app key ke whitelist. Kosong = script pasang semua (default).
  const selectedApps = Array.isArray(apps) ? apps.filter(a => APP_KEYS.includes(a)) : [];

  // Buat job record
  const jobResult = await query(
    `INSERT INTO deploy_jobs (job_name, script_type, targets, status, created_by)
     VALUES (?, ?, ?, 'running', ?)`,
    [script.name, scriptType, JSON.stringify(clientIds), req.session.userId]
  );
  const jobId = jobResult.insertId;

  res.json({ jobId, message: 'Deploy job dimulai' });

  // Jalankan async
  runDeployJob(jobId, scriptType, clientIds, req.session.userId, selectedApps).catch(console.error);
});

async function deployToClient(client, scriptType, selectedApps = []) {
  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: client.ip_address, port: client.ssh_port || 22,
      username: client.ssh_user || 'rsadmin',
      privateKey: fs.readFileSync(SSH_KEY, 'utf8'),
      readyTimeout: 15000,
    });

    const scripts = scriptType === 'all'
      ? ['01_install_apps.sh', '02_autoupdate.sh', '03_hardening.sh']
      : [SCRIPTS[scriptType].file];

    // Arg app cuma untuk 01_install_apps.sh. Sudah difilter whitelist di /run.
    const appArgs = selectedApps.length ? ' ' + selectedApps.join(' ') : '';

    let output = '';
    let failedScript = null;
    for (const scriptFile of scripts) {
      const localPath = path.join(SCRIPT_DIR, scriptFile);
      if (!fs.existsSync(localPath)) {
        output += `[ERROR] Script ${scriptFile} tidak ditemukan di server\n`;
        failedScript = scriptFile;
        continue;
      }
      // Upload script
      await ssh.putFile(localPath, `/tmp/${scriptFile}`);
      await ssh.execCommand(`chmod +x /tmp/${scriptFile}`);

      // Jalankan script (01 dapat daftar app terpilih sebagai argumen)
      const args = scriptFile === '01_install_apps.sh' ? appArgs : '';
      const r = await ssh.execCommand(`sudo bash /tmp/${scriptFile}${args}`, {
        execOptions: { pty: true },
        onStdout: (chunk) => { output += chunk.toString(); },
        onStderr: (chunk) => { output += chunk.toString(); },
      });
      output += r.stdout + (r.stderr ? '\n' + r.stderr : '');

      // Cleanup
      await ssh.execCommand(`rm -f /tmp/${scriptFile}`);

      // exit non-zero (script set -e gagal) -> tandai gagal, stop kalau mode all
      if (r.code !== 0) { failedScript = scriptFile; break; }
    }

    ssh.dispose();
    if (failedScript) {
      return { ok: false, error: `Script ${failedScript} gagal (cek Audit Log untuk detail)`, output };
    }
    // Update lastUpdate client hanya kalau semua sukses
    await query('UPDATE clients SET last_update=NOW() WHERE id=?', [client.id]);
    return { ok: true, output };
  } catch (e) {
    ssh.dispose();
    return { ok: false, error: e.message };
  }
}

async function runDeployJob(jobId, scriptType, clientIds, userId, selectedApps = []) {
  const results = {};
  const PARALLEL = 5;

  // Ambil info clients
  const clientsResult = await query(
    `SELECT * FROM clients WHERE id IN (?)`, [clientIds]
  );
  const clients = clientsResult.rows;

  // Proses batch
  for (let i = 0; i < clients.length; i += PARALLEL) {
    const batch = clients.slice(i, i + PARALLEL);
    const batchResults = await Promise.allSettled(
      batch.map(async (c) => {
        const r = await deployToClient(c, scriptType, selectedApps);
        results[c.id] = { name: c.name, ip: c.ip_address, ...r };

        await query(
          `INSERT INTO command_logs (client_id, user_id, command, output, exit_code)
           VALUES (?,?,?,?,?)`,
          [c.id, userId, `deploy:${scriptType}`, r.output || r.error, r.ok ? 0 : 1]
        );
      })
    );
  }

  const success = Object.values(results).filter(r => r.ok).length;
  const failed  = Object.values(results).filter(r => !r.ok).length;

  await query(
    `UPDATE deploy_jobs SET status='finished', results=?, finished_at=NOW() WHERE id=?`,
    [JSON.stringify({ results, summary: { success, failed, total: clients.length } }), jobId]
  );
}

module.exports = router;
