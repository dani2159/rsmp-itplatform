// ── routes/rustdesk.js ─────────────────────────────
// Manajemen RustDesk Server (hbbs + hbbr) dari web dashboard
const router = require('express').Router()
const { query } = require('../config/db')
const { requireAdmin, requireOperator } = require('../middleware/auth')
const { execSync } = require('child_process')
const net = require('net')
const http = require('http')
const fs = require('fs')
const path = require('path')

// Bare-metal: hbbs/hbbr jalan sebagai systemd service di host yang sama
// (localhost). Docker: hbbs/hbbr jalan di container terpisah, dijangkau
// lewat nama service compose. Override via env di docker-compose.yml.
const DATA_DIR    = process.env.RUSTDESK_DATA_DIR || '/var/lib/rustdesk-server'
const HBBS_HOST   = process.env.RUSTDESK_HBBS_HOST || 'localhost'
const HBBR_HOST   = process.env.RUSTDESK_HBBR_HOST || 'localhost'
// Diset hanya di deployment Docker (docker-compose.yml) -- lewat
// docker-socket-proxy yang cuma izinin baca+restart container, bukan akses
// penuh Docker API (yang setara root host kalau di-mount langsung).
const DOCKER_PROXY_URL = process.env.DOCKER_PROXY_URL || null
// host/relay are interpolated into a bash heredoc when deploying config to
// clients over SSH — this pattern rejects anything but hostname/IP/port
// characters, which also rules out the newline needed to break out of the
// heredoc delimiter.
const HOST_RE = /^[A-Za-z0-9.\-]{1,255}$/
const RELAY_RE = /^[A-Za-z0-9.\-:]{1,255}$/

// ── Helper ────────────────────────────────────────
function readPubKey() {
  try {
    const f = path.join(DATA_DIR, 'id_ed25519.pub')
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : null
  } catch { return null }
}

// Cek port TCP langsung -- lebih akurat dari systemctl is-active (yang cuma
// bilang "proses jalan", bukan "beneran nerima koneksi"), dan satu-satunya
// cara yang kerja di Docker (hbbs/hbbr container terpisah, tanpa systemd).
function checkPort(host, port, timeout = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const done = (ok) => { socket.destroy(); resolve(ok) }
    socket.setTimeout(timeout)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    socket.connect(port, host)
  })
}

// Panggil Docker Engine API lewat docker-socket-proxy (bukan socket langsung).
function dockerProxyRequest(method, urlPath) {
  return new Promise((resolve, reject) => {
    const base = new URL(DOCKER_PROXY_URL)
    const req = http.request({
      host: base.hostname, port: base.port, method, path: urlPath, timeout: 5000,
    }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`Docker API ${res.statusCode}: ${body}`))
        try { resolve(body ? JSON.parse(body) : null) } catch { resolve(null) }
      })
    })
    req.on('timeout', () => req.destroy(new Error('Docker API timeout')))
    req.on('error', reject)
    req.end()
  })
}

// Restart container compose service by name (lookup lewat label compose,
// bukan nama container fisik -- gak bergantung pola penamaan compose).
async function restartComposeService(serviceName) {
  const filters = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.service=${serviceName}`] }))
  const containers = await dockerProxyRequest('GET', `/containers/json?filters=${filters}`)
  if (!containers || !containers.length) throw new Error(`Container service '${serviceName}' tidak ditemukan`)
  await dockerProxyRequest('POST', `/containers/${containers[0].Id}/restart`)
}

// GET /api/rustdesk/status — info server RustDesk
router.get('/status', async (req, res) => {
  try {
    const [hbbsOk, hbbrOk] = await Promise.all([
      checkPort(HBBS_HOST, 21116),
      checkPort(HBBR_HOST, 21117),
    ])
    const pubKey = readPubKey()

    // Ambil config dari DB
    const cfg = await query(
      "SELECT `key`, value FROM system_config WHERE `key` LIKE 'rustdesk_%'"
    )
    const config = {}
    cfg.rows.forEach(r => { config[r.key.replace('rustdesk_', '')] = r.value })

    res.json({
      hbbs:    { running: hbbsOk, port: '21115, 21116' },
      hbbr:    { running: hbbrOk, port: '21117, 21119' },
      pubKey:  pubKey || config.pubkey || null,
      host:    config.host || null,
      relay:   config.relay || null,
      overall: hbbsOk && hbbrOk,
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/rustdesk/restart — restart services
router.post('/restart', requireOperator, async (req, res) => {
  const { service } = req.body  // 'hbbs' | 'hbbr' | 'all'
  try {
    if (DOCKER_PROXY_URL) {
      // Docker: restart container lewat docker-socket-proxy (akses dibatasi
      // ke operasi container read+restart saja, lihat docker-compose.yml).
      if (service === 'hbbs' || service === 'all') await restartComposeService('rustdesk-hbbs')
      if (service === 'hbbr' || service === 'all') await restartComposeService('rustdesk-hbbr')
    } else {
      // Bare-metal: backend jalan sebagai www-data -- systemctl restart
      // butuh root, lewat sudo dengan rule NOPASSWD sempit (finalize-setup.sh).
      if (service === 'hbbs' || service === 'all') execSync('sudo systemctl restart rustdesk-hbbs', { timeout: 10000 })
      if (service === 'hbbr' || service === 'all') execSync('sudo systemctl restart rustdesk-hbbr', { timeout: 10000 })
    }
    res.json({ ok: true, message: `${service} restarted` })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/rustdesk/logs — log terbaru
router.get('/logs', (req, res) => {
  try {
    const { service = 'hbbs', lines = 50 } = req.query
    const logFile = `/var/log/rs-it-platform/rustdesk-${service}.log`
    if (!fs.existsSync(logFile)) return res.json({ logs: '(Log belum tersedia)' })
    const out = execSync(`tail -n ${lines} "${logFile}"`, { timeout: 5000 }).toString()
    res.json({ logs: out })
  } catch (e) { res.json({ logs: e.message }) }
})

// GET /api/rustdesk/config-string — string konfigurasi untuk client
router.get('/config-string', async (req, res) => {
  try {
    const cfg = await query(
      "SELECT `key`, value FROM system_config WHERE `key` LIKE 'rustdesk_%'"
    )
    const c = {}
    cfg.rows.forEach(r => { c[r.key.replace('rustdesk_', '')] = r.value })

    const pubKey = readPubKey() || c.pubkey || ''
    const host   = c.host || ''
    const relay  = c.relay || `${host}:21117`

    // Format config untuk RustDesk client (custom server string)
    // Format: host:port,relay:port,key
    const configStr = `${host}:21116,${relay},${pubKey}`

    res.json({
      host,
      relay,
      pubKey,
      configStr,
      // Untuk deployment massal via rs-agent
      agentConfig: {
        hbbsHost:  host,
        hbbsPort:  21116,
        hbbrHost:  relay.split(':')[0],
        hbbrPort:  21117,
        pubKey,
      }
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT /api/rustdesk/config — update konfigurasi
router.put('/config', requireAdmin, async (req, res) => {
  try {
    const { host, relay } = req.body
    if (host && !HOST_RE.test(host)) {
      return res.status(400).json({ error: 'Format host tidak valid' })
    }
    if (relay && !RELAY_RE.test(relay)) {
      return res.status(400).json({ error: 'Format relay tidak valid' })
    }
    if (host) await query(
      "INSERT INTO system_config(`key`,value,updated_at) VALUES('rustdesk_host',?,NOW()) ON DUPLICATE KEY UPDATE value=VALUES(value)",
      [host]
    )
    if (relay) await query(
      "INSERT INTO system_config(`key`,value,updated_at) VALUES('rustdesk_relay',?,NOW()) ON DUPLICATE KEY UPDATE value=VALUES(value)",
      [relay]
    )
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/rustdesk/deploy-config/:clientId — push RustDesk config ke client Linux via SSH
router.post('/deploy-config/:clientId', requireOperator, async (req, res) => {
  const { NodeSSH } = require('node-ssh')
  const fs2 = require('fs')
  const SSH_KEY = process.env.SSH_KEY_PATH

  try {
    const clientRow = await query('SELECT * FROM clients WHERE id=?', [req.params.clientId])
    const client = clientRow.rows[0]
    if (!client) return res.status(404).json({ error: 'Client tidak ditemukan' })

    const cfgRow = await query(
      "SELECT `key`, value FROM system_config WHERE `key` LIKE 'rustdesk_%'"
    )
    const c = {}
    cfgRow.rows.forEach(r => { c[r.key.replace('rustdesk_', '')] = r.value })

    const host   = c.host || ''
    const relay  = c.relay || `${host}:21117`
    const pubKey = readPubKey() || c.pubkey || ''

    const ssh = new NodeSSH()
    await ssh.connect({
      host: client.ip_address,
      port: client.ssh_port || 22,
      username: client.ssh_user || 'rsadmin',
      privateKey: fs2.readFileSync(SSH_KEY, 'utf8'),
      readyTimeout: 10000,
    })

    // Deploy RustDesk config ke client Linux
    const configScript = `
mkdir -p ~/.config/rustdesk
cat > ~/.config/rustdesk/RustDesk2.toml << 'RDEOF'
[options]
custom-rendezvous-server = "${host}"
relay-server = "${relay}"
api-server = ""
key = "${pubKey}"
RDEOF
# Juga untuk root
sudo mkdir -p /root/.config/rustdesk
sudo cp ~/.config/rustdesk/RustDesk2.toml /root/.config/rustdesk/
echo "RustDesk config applied"
    `.trim()

    const result = await ssh.execCommand(configScript)
    ssh.dispose()

    res.json({
      ok: true,
      output: result.stdout,
      message: `RustDesk config berhasil di-deploy ke ${client.name}`
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/rustdesk/deploy-config-bulk — push ke banyak client
router.post('/deploy-config-bulk', requireOperator, async (req, res) => {
  const { clientIds } = req.body
  if (!clientIds?.length) return res.status(400).json({ error: 'clientIds wajib' })

  try {
    const { NodeSSH } = require('node-ssh')
    const fs2 = require('fs')
    const SSH_KEY = process.env.SSH_KEY_PATH

    const cfgRow = await query(
      "SELECT `key`, value FROM system_config WHERE `key` LIKE 'rustdesk_%'"
    )
    const c = {}
    cfgRow.rows.forEach(r => { c[r.key.replace('rustdesk_', '')] = r.value })

    const host   = c.host || ''
    const relay  = c.relay || `${host}:21117`
    const pubKey = readPubKey() || c.pubkey || ''

    const clients = (await query('SELECT * FROM clients WHERE id IN (?)', [clientIds])).rows
    const PARALLEL = 5
    const results = []

    for (let i = 0; i < clients.length; i += PARALLEL) {
      const batch = clients.slice(i, i + PARALLEL)
      await Promise.allSettled(batch.map(async (client) => {
        const ssh = new NodeSSH()
        try {
          await ssh.connect({
            host: client.ip_address,
            port: client.ssh_port || 22,
            username: client.ssh_user || 'rsadmin',
            privateKey: fs2.readFileSync(SSH_KEY, 'utf8'),
            readyTimeout: 8000,
          })
          await ssh.execCommand(`
            mkdir -p ~/.config/rustdesk &&
            cat > ~/.config/rustdesk/RustDesk2.toml << 'RDEOF'
[options]
custom-rendezvous-server = "${host}"
relay-server = "${relay}"
key = "${pubKey}"
RDEOF
          `)
          ssh.dispose()
          results.push({ id: client.id, name: client.name, ok: true })
        } catch (e) {
          ssh.dispose()
          results.push({ id: client.id, name: client.name, ok: false, error: e.message })
        }
      }))
    }

    res.json({ results })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

module.exports = router
