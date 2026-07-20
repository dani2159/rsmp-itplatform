// ── routes/agent.js ────────────────────────────────
const router = require('express').Router()
const { query } = require('../config/db')
const { recordStatusChange } = require('../services/statusHistory')
const path = require('path')
const fs   = require('fs')

function requireAgentToken(req, res, next) {
  const token = req.headers['x-agent-token'] || req.query.token
  if (process.env.AGENT_TOKEN && token !== process.env.AGENT_TOKEN) {
    return res.status(401).json({ error: 'Token agent tidak valid' })
  }
  next()
}

// POST /api/agent/register
router.post('/register', requireAgentToken, async (req, res) => {
  try {
    const { hostname, ip, os, agentVersion, osType, vnc_password, vnc_port } = req.body
    if (!ip) return res.status(400).json({ error: 'ip wajib' })
    const vport = vnc_port || 5901

    const existing = await query('SELECT id FROM clients WHERE ip_address=?', [ip])
    if (existing.rows.length) {
      await recordStatusChange(existing.rows[0].id, 'online')
      if (vnc_password) {
        await query(
          `UPDATE clients SET hostname=?, os_version=?, agent_version=?,
           vnc_password=?, vnc_port=?, last_seen=NOW(), status='online' WHERE ip_address=?`,
          [hostname, os, agentVersion, vnc_password, vport, ip]
        )
      } else {
        await query(
          `UPDATE clients SET hostname=?, os_version=?, agent_version=?,
           vnc_port=?, last_seen=NOW(), status='online' WHERE ip_address=?`,
          [hostname, os, agentVersion, vport, ip]
        )
      }
      return res.json({ clientId: existing.rows[0].id, registered: false })
    }

    const ins = await query(
      `INSERT INTO clients
        (name, hostname, ip_address, os_type, os_version, agent_version,
         vnc_password, vnc_port, status, last_seen, department)
       VALUES (?,?,?,?,?,?,?,?,'online',NOW(),'Auto-Registered')`,
      [hostname || `PC-${ip.split('.').pop()}`, hostname, ip,
       osType || 'linux', os, agentVersion, vnc_password || null, vport]
    )
    res.json({ clientId: ins.insertId, registered: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/agent/unregister — dipanggil uninstaller agar client hilang dari
// dashboard. FK clients pakai ON DELETE CASCADE/SET NULL, jadi aman dihapus.
router.post('/unregister', requireAgentToken, async (req, res) => {
  try {
    const { clientId, ip } = req.body
    if (!clientId && !ip) return res.status(400).json({ error: 'clientId atau ip wajib' })
    const r = clientId
      ? await query('DELETE FROM clients WHERE id=?', [clientId])
      : await query('DELETE FROM clients WHERE ip_address=?', [ip])
    res.json({ ok: true, removed: r.rowCount ?? r.affectedRows ?? 0 })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/agent/heartbeat
router.post('/heartbeat', requireAgentToken, async (req, res) => {
  try {
    const {
      clientId, cpu, ram, disk, uptime, packagesPending,
      hostname, os, agentVersion, ip,
      // New fields v3.0
      ramDetail, diskDetail, loadAvg, cpuTemp, bootTime,
      runningApps, topProcesses, loggedUsers,
      networkInfo, servicesStatus, installedApps,
    } = req.body

    if (!clientId) return res.status(400).json({ error: 'clientId wajib' })

    // Client sudah dihapus (uninstall/unregister) tapi proses agent masih jalan.
    // Jangan error / resurrect — suruh agent berhenti. Agent lama abaikan perintah
    // ini (heartbeat tetap 200, tidak memicu re-register), agent baru self-stop.
    const stillExists = await query('SELECT id FROM clients WHERE id=?', [clientId])
    if (!stillExists.rows.length) {
      return res.json({ ok: true, command: 'stop-agent' })
    }

    await recordStatusChange(clientId, 'online')

    const updateFields = [
      cpu, ram, disk, uptime, packagesPending,
      hostname, os, agentVersion,
      loadAvg || null, bootTime || null,
      runningApps || null, networkInfo || null, loggedUsers || null,
      ramDetail || null, diskDetail || null, cpuTemp || null,
      topProcesses || null, servicesStatus || null, installedApps || null,
      clientId
    ]

    await query(
      `UPDATE clients SET
        status='online', last_seen=NOW(),
        cpu_usage=?, ram_usage=?, disk_usage=?,
        uptime=?, packages_pending=?,
        hostname=?, os_version=?, agent_version=?,
        load_avg=?, boot_time=?,
        running_apps=?, network_info=?, logged_users=?,
        ram_detail=?, disk_detail=?, cpu_temp=?,
        top_processes=?, services_status=?, installed_apps=?
       WHERE id=?`,
      updateFields
    )

    // Self-heal: kalau agent lapor IP baru (DHCP renew, salah adapter kepilih
    // pas register pertama, dll), update tanpa perlu re-register manual.
    if (ip) {
      await query('UPDATE clients SET ip_address=? WHERE id=? AND ip_address != ?', [ip, clientId, ip])
        .catch(() => {}) // ip_address UNIQUE -- abaikan kalau IP itu udah dipakai client lain
    }

    res.json({ ok: true, command: null })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/agent/download/:file
router.get('/download/:file', (req, res) => {
  const allowed = ['rsmp-agent.py','rs-agent.py','install-agent.sh','uninstall-agent.sh',
                   '01_install_apps.sh','02_autoupdate.sh','03_hardening.sh',
                   'rs-agent.ps1','install-agent-windows.bat','uninstall-agent-windows.bat']
  const file = path.basename(req.params.file)
  if (!allowed.includes(file)) return res.status(403).json({ error: 'Tidak diizinkan' })

  const dirs = [
    path.join(process.env.APP_DIR || '/opt/rsmp-it-platform', 'scripts', 'agent'),
    path.join(process.env.APP_DIR || '/opt/rsmp-it-platform', 'scripts', 'agent-windows'),
    path.join(process.env.APP_DIR || '/opt/rsmp-it-platform', 'scripts'),
    path.join(__dirname, '../../../rs-agent'),
    path.join(__dirname, '../../../rs-agent-windows'),
  ]
  for (const dir of dirs) {
    const full = path.join(dir, file)
    if (fs.existsSync(full)) return res.download(full)
  }
  res.status(404).json({ error: 'File tidak ditemukan' })
})

module.exports = router
