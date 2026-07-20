const router = require('express').Router();
const ping   = require('ping');
const { query } = require('../config/db');
const { redisClient } = require('../config/redis');
const { requireOperator } = require('../middleware/auth');
const { recordStatusChange } = require('../services/statusHistory');
const { RANGE_MS, computeUptime } = require('../utils/uptime');

const CLIENT_COLUMNS = `
  id, name, hostname, ip_address, mac_address, os_type, os_version,
  location, department, category, ssh_user, ssh_port, vnc_port, vnc_password,
  rustdesk_id, status, ssh_ready, agent_version, last_seen, last_update,
  uptime, cpu_usage, ram_usage, disk_usage, packages_pending, load_avg,
  boot_time, running_apps, top_processes, network_info, logged_users,
  services_status, cpu_temp, installed_apps, notes, ram_detail, disk_detail,
  created_at
`;

// GET /api/clients
router.get('/', async (req, res) => {
  try {
    const { os_type, status, department, search } = req.query;
    let sql = `SELECT ${CLIENT_COLUMNS} FROM clients WHERE 1=1`;
    const params = [];
    if (os_type)    { params.push(os_type);    sql += ' AND os_type=?'; }
    if (status)     { params.push(status);     sql += ' AND status=?'; }
    if (department) { params.push(department); sql += ' AND department=?'; }
    if (search) {
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      sql += ' AND (name LIKE ? OR ip_address LIKE ? OR hostname LIKE ?)';
    }
    sql += ' ORDER BY name';
    const r = await query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/clients/stats
router.get('/stats', async (req, res) => {
  try {
    const r = await query(`
      SELECT
        SUM(CASE WHEN status='online'   THEN 1 ELSE 0 END) AS online,
        SUM(CASE WHEN status='offline'  THEN 1 ELSE 0 END) AS offline,
        SUM(CASE WHEN status='unknown'  THEN 1 ELSE 0 END) AS unknown,
        SUM(CASE WHEN os_type='linux'   THEN 1 ELSE 0 END) AS linux,
        SUM(CASE WHEN os_type='windows' THEN 1 ELSE 0 END) AS windows,
        SUM(CASE WHEN ssh_ready=true    THEN 1 ELSE 0 END) AS ssh_ready,
        SUM(packages_pending) AS total_updates,
        COUNT(*) AS total
      FROM clients
    `);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/clients/uptime-summary?range=24h|7d|30d — fleet-wide uptime
router.get('/uptime-summary', async (req, res) => {
  try {
    const windowMs = RANGE_MS[req.query.range] || RANGE_MS['24h'];
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - windowMs);

    const clients = await query('SELECT id, name FROM clients');
    const results = [];
    for (const c of clients.rows) {
      const priorRow = await query(
        'SELECT status FROM client_status_history WHERE client_id=? AND changed_at < ? ORDER BY changed_at DESC LIMIT 1',
        [c.id, windowStart]
      );
      const withinRows = await query(
        'SELECT status, changed_at FROM client_status_history WHERE client_id=? AND changed_at >= ? AND changed_at <= ? ORDER BY changed_at ASC',
        [c.id, windowStart, windowEnd]
      );
      const priorStatus = priorRow.rows[0]?.status || 'online';
      const { uptimePercent, incidents } = computeUptime(priorStatus, withinRows.rows, windowStart, windowEnd);
      results.push({ clientId: c.id, name: c.name, uptimePercent, incidentCount: incidents.length });
    }

    const fleetAveragePercent = results.length
      ? Math.round((results.reduce((sum, r) => sum + r.uptimePercent, 0) / results.length) * 100) / 100
      : 100;
    const worst = [...results].sort((a, b) => a.uptimePercent - b.uptimePercent).slice(0, 5);

    res.json({ fleetAveragePercent, worst, range: req.query.range || '24h' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/clients/:id
router.get('/:id', async (req, res) => {
  try {
    const r = await query(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE id=?`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Client tidak ditemukan' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/clients/:id/history?range=24h|7d|30d — uptime% + incident timeline
router.get('/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const windowMs = RANGE_MS[req.query.range] || RANGE_MS['24h'];
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - windowMs);

    const clientRow = await query('SELECT id FROM clients WHERE id=?', [id]);
    if (!clientRow.rows.length) return res.status(404).json({ error: 'Client tidak ditemukan' });

    const priorRow = await query(
      'SELECT status FROM client_status_history WHERE client_id=? AND changed_at < ? ORDER BY changed_at DESC LIMIT 1',
      [id, windowStart]
    );
    const withinRows = await query(
      'SELECT status, changed_at FROM client_status_history WHERE client_id=? AND changed_at >= ? AND changed_at <= ? ORDER BY changed_at ASC',
      [id, windowStart, windowEnd]
    );

    const priorStatus = priorRow.rows[0]?.status || 'online';
    const { uptimePercent, incidents } = computeUptime(priorStatus, withinRows.rows, windowStart, windowEnd);

    res.json({ uptimePercent, incidents, range: req.query.range || '24h' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/clients
router.post('/', requireOperator, async (req, res) => {
  try {
    const {
      name, hostname, ip_address, mac_address, os_type, os_version,
      location, department, category, ssh_user, ssh_port, vnc_port,
      rustdesk_id, notes
    } = req.body;

    if (!name || !ip_address) return res.status(400).json({ error: 'Nama dan IP wajib' });

    const ins = await query(`
      INSERT INTO clients
        (name,hostname,ip_address,mac_address,os_type,os_version,location,department,category,ssh_user,ssh_port,vnc_port,rustdesk_id,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [name,hostname,ip_address,mac_address,os_type||'linux',os_version,
       location,department,category,ssh_user||'rsadmin',ssh_port||22,vnc_port||5900,rustdesk_id,notes]
    );
    const r = await query(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE id=?`, [ins.insertId]);

    await query("INSERT INTO audit_logs (user_id,action,target,details) VALUES (?,'add_client',?,?)",
      [req.session.userId, name, JSON.stringify({ ip: ip_address })]);

    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/clients/:id
router.put('/:id', requireOperator, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, hostname, ip_address, mac_address, os_type, os_version,
      location, department, category, ssh_user, ssh_port, vnc_port,
      rustdesk_id, notes, ssh_ready
    } = req.body;

    await query(`
      UPDATE clients SET
        name=?, hostname=?, ip_address=?, mac_address=?,
        os_type=?, os_version=?, location=?, department=?,
        category=?, ssh_user=?, ssh_port=?, vnc_port=?,
        rustdesk_id=?, notes=?, ssh_ready=?
      WHERE id=?`,
      [name,hostname,ip_address,mac_address,os_type,os_version,
       location,department,category,ssh_user,ssh_port,vnc_port,
       rustdesk_id,notes,ssh_ready,id]
    );
    const r = await query(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE id=?`, [id]);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/clients/:id
router.delete('/:id', requireOperator, async (req, res) => {
  try {
    const r = await query('SELECT name FROM clients WHERE id=?', [req.params.id]);
    await query('DELETE FROM clients WHERE id=?', [req.params.id]);
    await query("INSERT INTO audit_logs (user_id,action,target) VALUES (?,'delete_client',?)",
      [req.session.userId, r.rows[0]?.name]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/clients/:id/ping
router.post('/:id/ping', async (req, res) => {
  try {
    const r = await query('SELECT ip_address, name FROM clients WHERE id=?', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Client tidak ditemukan' });
    const { ip_address, name } = r.rows[0];

    const result = await ping.promise.probe(ip_address, { timeout: 5 });
    const status = result.alive ? 'online' : 'offline';

    await recordStatusChange(req.params.id, status);
    await query('UPDATE clients SET status=?, last_seen=NOW() WHERE id=?', [status, req.params.id]);
    res.json({ alive: result.alive, time: result.time, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/clients/:id/wake — Wake-on-LAN (magic packet)
router.post('/:id/wake', requireOperator, async (req, res) => {
  try {
    const r = await query('SELECT ip_address, mac_address, network_info, name FROM clients WHERE id=?', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Client tidak ditemukan' });
    const c = r.rows[0];

    let mac = c.mac_address;
    if (!mac && c.network_info) { try { mac = JSON.parse(c.network_info).mac } catch {} }
    if (!mac) return res.status(400).json({ error: 'MAC address belum diketahui (tunggu agent lapor / isi manual di Edit Client)' });

    const clean = String(mac).replace(/[^0-9a-fA-F]/g, '');
    if (clean.length !== 12) return res.status(400).json({ error: `MAC tidak valid: ${mac}` });

    const macBuf = Buffer.from(clean, 'hex');
    const packet = Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(macBuf)]);
    // ponytail: broadcast dihitung asumsi subnet /24 dari IP client -- cukup
    // untuk LAN RS; hitung dari netmask asli kalau nanti ada subnet lain.
    const bcast = c.ip_address.split('.').slice(0, 3).join('.') + '.255';

    const dgram = require('dgram');
    const sock = dgram.createSocket('udp4');
    sock.bind(() => {
      sock.setBroadcast(true);
      // Kirim ke broadcast + unicast IP terakhir (jaga-jaga ARP masih cached).
      sock.send(packet, 9, bcast, () => {
        sock.send(packet, 9, c.ip_address, () => sock.close());
      });
    });
    sock.on('error', () => { try { sock.close() } catch {} });

    res.json({ ok: true, name: c.name, mac, broadcast: bcast });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/clients/ping-all
router.post('/ping-all', async (req, res) => {
  try {
    const clients = await query('SELECT id, ip_address FROM clients');
    const results = await Promise.allSettled(
      clients.rows.map(async (c) => {
        const r = await ping.promise.probe(c.ip_address, { timeout: 5 });
        const status = r.alive ? 'online' : 'offline';
        await recordStatusChange(c.id, status);
        await query('UPDATE clients SET status=?, last_seen=NOW() WHERE id=?', [status, c.id]);
        return { id: c.id, status, time: r.time };
      })
    );
    res.json({ results: results.map(r => r.value || r.reason) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/clients/import - Import dari hosts.txt
router.post('/import', requireOperator, async (req, res) => {
  try {
    const { text, os_type } = req.body;
    const lines = text.split('\n');
    let added = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const parts = trimmed.split(/\s+/);
      const ip = parts[0];
      const comment = line.split('#')[1]?.trim() || '';
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) continue;

      const existing = await query('SELECT id FROM clients WHERE ip_address=?', [ip]);
      if (existing.rows.length) continue;

      await query(
        `INSERT INTO clients (name, ip_address, os_type, department)
         VALUES (?, ?, ?, 'Import')`,
        [comment || `PC-${ip.split('.').pop()}`, ip, os_type || 'linux']
      );
      added++;
    }
    res.json({ added });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/clients/export/hosts
router.get('/export/hosts', async (req, res) => {
  try {
    const r = await query("SELECT ip_address, name, location FROM clients WHERE os_type='linux' ORDER BY name");
    const txt = '# RS-IT Platform — Linux Hosts\n' +
      r.rows.map(c => `${c.ip_address}  # ${c.name} - ${c.location || ''}`).join('\n');
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="hosts.txt"');
    res.send(txt);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
