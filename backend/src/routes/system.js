// ── routes/system.js ───────────────────────────────
const router       = require('express').Router();
const { query }    = require('../config/db');
const fs           = require('fs');
const path         = require('path');
const { execFile } = require('child_process');
const { requireAdmin, requireOperator } = require('../middleware/auth');

const APP_DIR = process.env.APP_DIR || '/opt/rsmp-it-platform';
const ISO_DIR = path.join(APP_DIR, 'isos');
const KEY_FILE = process.env.SSH_PUB_KEY_PATH || path.join(APP_DIR, 'keys/rs_master_key.pub');

router.get('/config', async (req, res) => {
  try {
    const r = await query('SELECT `key`, value FROM system_config');
    const config = {};
    r.rows.forEach(row => config[row.key] = row.value);
    try { config.pub_key = fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, 'utf8').trim() : ''; } catch(e) { config.pub_key = ''; }
    res.json(config);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/config', requireAdmin, async (req, res) => {
  try {
    if (Object.values(req.body).some(v => typeof v === 'string' && /[\r\n]/.test(v))) {
      return res.status(400).json({ error: 'Config values cannot contain newline characters' });
    }
    for (const [key, value] of Object.entries(req.body)) {
      await query(
        'INSERT INTO system_config (`key`, value, updated_at) VALUES (?,?,NOW()) ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=NOW()',
        [key, value]
      );
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/pub-key', (req, res) => {
  try {
    const key = fs.readFileSync(KEY_FILE, 'utf8').trim();
    res.json({ key });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/agent-token', (req, res) => {
  if (req.session?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  res.json({ token: process.env.AGENT_TOKEN || '' });
});

// GET /api/system/alerts — riwayat alert buat panel dashboard
router.get('/alerts', async (req, res) => {
  try {
    const r = await query(`
      SELECT a.id, a.client_id, a.type, a.message, a.created_at, c.name AS client_name
      FROM alerts a LEFT JOIN clients c ON a.client_id=c.id
      ORDER BY a.created_at DESC LIMIT 30`);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/system/alerts/test — cek konfigurasi bot Telegram
router.post('/alerts/test', requireAdmin, async (req, res) => {
  try {
    const notifier = require('../services/notifier');
    const sent = await notifier.sendTelegram('✅ Test notifikasi RSMP-IT Platform berhasil');
    if (!sent) return res.status(400).json({ error: 'Bot token / chat ID belum diisi di Settings' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

// ── routes/logs.js ─────────────────────────────────
const logsRouter = require('express').Router();

logsRouter.get('/audit', async (req, res) => {
  try {
    const r = await query(`
      SELECT al.*, u.full_name, u.username
      FROM audit_logs al LEFT JOIN users u ON al.user_id=u.id
      ORDER BY al.created_at DESC LIMIT 200`);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

logsRouter.get('/commands', async (req, res) => {
  try {
    const { clientId } = req.query;
    let sql = `
      SELECT cl.*, c.name as client_name, u.full_name
      FROM command_logs cl
      LEFT JOIN clients c ON cl.client_id=c.id
      LEFT JOIN users u ON cl.user_id=u.id
      WHERE 1=1`;
    const params = [];
    if (clientId) { params.push(clientId); sql += ' AND cl.client_id=?'; }
    sql += ' ORDER BY cl.created_at DESC LIMIT 500';
    const r = await query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports.logsRouter = logsRouter;

// ── routes/iso.js ──────────────────────────────────
const isoRouter = require('express').Router();

isoRouter.get('/list', (req, res) => {
  try {
    if (!fs.existsSync(ISO_DIR)) { res.json([]); return; }
    const files = fs.readdirSync(ISO_DIR)
      .filter(f => f.endsWith('.iso'))
      .map(f => {
        const stat = fs.statSync(path.join(ISO_DIR, f));
        return { name: f, size: stat.size, created: stat.mtime };
      });
    res.json(files);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

isoRouter.post('/build', async (req, res) => {
  const { baseIso, label, serverUrl } = req.body;
  if (!baseIso) return res.status(400).json({ error: 'baseIso wajib' });

  if (!fs.existsSync(baseIso)) {
    return res.status(400).json({ error: `ISO base tidak ditemukan di server: ${baseIso}` });
  }

  // Cari script build
  const scriptCandidates = [
    path.join(APP_DIR, 'scripts', '04_build_iso.sh'),
    path.join(APP_DIR, 'server-setup', '04_build_iso.sh'),
    '/opt/rsmp-it-platform/scripts/04_build_iso.sh',
  ];
  let buildScript = scriptCandidates.find(s => fs.existsSync(s));
  if (!buildScript) {
    return res.status(501).json({ error: 'Fitur ISO Builder belum tersedia — script 04_build_iso.sh belum ada di server' });
  }

  const jobId = Date.now();
  res.json({ message: 'ISO build dimulai (proses ~30-60 menit)', jobId });

  const buildVars = {
    BASE_ISO:   baseIso,
    ISO_LABEL:  label || 'LinuxMint-RSMP',
    ISO_DIR,
    SERVER_URL: serverUrl || `http://${process.env.SERVER_IP || 'localhost'}:${process.env.WEB_PORT || '8080'}`,
    APP_DIR,
  };
  // sudo (non-interactive, no -E support on this system) resets env by
  // default -- pass vars explicitly as VAR=value args instead, which the
  // NOPASSWD:SETENV: sudoers rule permits for exactly this command.
  const envArgs = Object.entries(buildVars).map(([k, v]) => `${k}=${v}`);

  const logDir = '/var/log/rsmp-it-platform';
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = `${logDir}/iso-build-${jobId}.log`;
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  // Bukan opsional: 'error' tanpa listener adalah unhandled exception di Node
  // dan mematikan seluruh proses backend, bukan cuma job build ini.
  logStream.on('error', (e) => console.error(`ISO build ${jobId}: gagal tulis log — ${e.message}`));
  logStream.write(`=== ISO Build ${jobId} dimulai: ${new Date().toISOString()} ===\n`);
  logStream.write(`Script: ${buildScript}\n`);
  logStream.write(`Label: ${label || 'LinuxMint-RSMP'}\n\n`);

  // Remaster ISO butuh root (mount/umount, chroot, apt-get) -- backend jalan
  // sebagai www-data, jadi lewat sudo dengan rule NOPASSWD sempit (lihat
  // finalize-setup.sh) yang cuma izinkan script ini persis, bukan shell bebas.
  const child = execFile('sudo', [...envArgs, 'bash', buildScript], { timeout: 7200000 });
  child.on('error', (e) => {
    logStream.write(`\n=== ISO BUILD GAGAL START: ${e.message} ===\n`);
    logStream.end();
    console.error(`ISO build ${jobId}: gagal start — ${e.message}`);
  });
  child.stdout?.pipe(logStream, { end: false });
  child.stderr?.pipe(logStream, { end: false });
  child.on('close', (code) => {
    const result = code === 0 ? 'BERHASIL' : `GAGAL (exit ${code})`;
    logStream.write(`\n=== ISO BUILD ${result}: ${new Date().toISOString()} ===\n`);
    logStream.end();
    console.log(`ISO build ${jobId}: ${result}`);
  });
});

isoRouter.get('/download/:name', (req, res) => {
  const file = path.join(ISO_DIR, path.basename(req.params.name));
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'File tidak ditemukan' });
  res.download(file);
});

// DELETE /api/iso/:name — hapus ISO hasil build
isoRouter.delete('/:name', requireOperator, (req, res) => {
  try {
    const name = path.basename(req.params.name);
    if (!name.endsWith('.iso')) return res.status(400).json({ error: 'Nama file tidak valid' });
    const file = path.join(ISO_DIR, name);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'File tidak ditemukan' });
    fs.unlinkSync(file);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

isoRouter.get('/pubkey/download', (req, res) => {
  res.download(KEY_FILE, 'rs_master_key.pub');
});
// GET /api/iso/jobs/:id/status — cek status ISO build
isoRouter.get('/jobs/:id/status', (req, res) => {
  const jobId = req.params.id;
  const logFile = `/var/log/rsmp-it-platform/iso-build-${jobId}.log`;

  let status = 'unknown';
  let logContent = '';

  // Cek apakah log file ada dan baca progressnya
  if (fs.existsSync(logFile)) {
    try {
      const log = fs.readFileSync(logFile, 'utf8');
      logContent = log.slice(-5000); // 5KB terakhir
      if (log.includes('ISO BUILD SELESAI')) status = 'finished';
      else if (log.includes('[ERROR]')) status = 'error';
      else status = 'running';
    } catch(e) { status = 'running'; }
  }

  // Cek ISO dir untuk file baru
  let isoFile = null;
  try {
    if (fs.existsSync(ISO_DIR)) {
      const files = fs.readdirSync(ISO_DIR)
        .filter(f => f.endsWith('.iso'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(ISO_DIR,f)).mtime }))
        .sort((a,b) => b.mtime - a.mtime);
      if (files.length) isoFile = files[0].name;
    }
  } catch(e) {}

  res.json({ jobId, status, logContent, isoFile });
});

// GET /api/iso/jobs/:id/log — ambil log build lengkap
isoRouter.get('/jobs/:id/log', (req, res) => {
  const jobId = req.params.id;
  const logFile = `/var/log/rsmp-it-platform/iso-build-${jobId}.log`;
  const mainLog = '/var/log/rsmp-it-platform/iso-build.log';

  // Coba log spesifik dulu, fallback ke log utama
  const targetLog = fs.existsSync(logFile) ? logFile : mainLog;

  if (!fs.existsSync(targetLog)) {
    return res.json({ log: 'Log file belum tersedia. Build mungkin belum dimulai atau baru saja dimulai.' });
  }

  try {
    const log = fs.readFileSync(targetLog, 'utf8');
    res.json({ log: log.slice(-10000) }); // 10KB terakhir
  } catch(e) {
    res.json({ log: 'Gagal baca log: ' + e.message });
  }
});

module.exports.isoRouter = isoRouter;
