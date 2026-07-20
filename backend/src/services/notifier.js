// ── services/notifier.js ───────────────────────────
// Alert terpusat: simpan ke tabel alerts (buat panel dashboard) + kirim
// Telegram kalau bot dikonfigurasi di Settings (telegram_bot_token/chat_id).
const { query } = require('../config/db');

const DISK_CRIT    = 90;  // %
const CPU_CRIT     = 95;  // %
const CPU_STREAK_N = 3;   // heartbeat berturut-turut (~3 menit)

// ponytail: dedup in-memory, single process -- restart backend = alert aktif
// bisa kekirim ulang sekali. Pindah ke kolom resolved_at kalau itu mengganggu.
const active    = new Map(); // "clientId:type" -> true (alert sedang aktif)
const cpuStreak = new Map(); // clientId -> hitungan heartbeat CPU tinggi berturut

async function init() {
  await query(`CREATE TABLE IF NOT EXISTS alerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NULL,
    type VARCHAR(30) NOT NULL,
    message VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    INDEX idx_created (created_at))`);
  console.log('[Notifier] siap');
}

async function sendTelegram(text) {
  const r = await query(
    "SELECT `key`, value FROM system_config WHERE `key` IN ('telegram_bot_token','telegram_chat_id')");
  const cfg = {};
  r.rows.forEach(row => cfg[row.key] = row.value);
  if (!cfg.telegram_bot_token || !cfg.telegram_chat_id) return false;

  const resp = await fetch(`https://api.telegram.org/bot${cfg.telegram_bot_token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: cfg.telegram_chat_id, text, parse_mode: 'HTML' }),
  });
  if (!resp.ok) throw new Error(`Telegram HTTP ${resp.status}: ${await resp.text()}`);
  return true;
}

// Insert ke tabel alerts + kirim Telegram. Tanpa dedup -- pemanggil yang
// menentukan kapan (dipakai langsung untuk event satu-kali seperti recovery).
async function notify(clientId, type, message) {
  try {
    await query('INSERT INTO alerts (client_id, type, message) VALUES (?,?,?)',
      [clientId, type, message]);
  } catch (e) { console.error('[Notifier] insert:', e.message); }
  sendTelegram(`<b>RSMP-IT</b>\n${message}`)
    .catch(e => console.error('[Notifier] telegram:', e.message));
}

// Dedup: satu alert per client per type sampai resolveAlert.
async function raiseAlert(clientId, type, message) {
  const key = `${clientId}:${type}`;
  if (active.has(key)) return;
  active.set(key, true);
  await notify(clientId, type, message);
}

// Return true kalau memang ada alert aktif yang di-clear (buat pesan recovery).
function resolveAlert(clientId, type) {
  return active.delete(`${clientId}:${type}`);
}

// Dipanggil tiap heartbeat. client = { id, name, cpu, disk }
async function checkMetrics(client) {
  const { id, name, cpu, disk } = client;
  if (disk != null) {
    if (disk >= DISK_CRIT) {
      await raiseAlert(id, 'disk', `💾 Disk ${name} ${Number(disk).toFixed(0)}% (ambang ${DISK_CRIT}%)`);
    } else if (resolveAlert(id, 'disk')) {
      await notify(id, 'disk-ok', `💾 Disk ${name} kembali normal (${Number(disk).toFixed(0)}%)`);
    }
  }
  if (cpu != null) {
    if (cpu >= CPU_CRIT) {
      const n = (cpuStreak.get(id) || 0) + 1;
      cpuStreak.set(id, n);
      if (n >= CPU_STREAK_N) {
        await raiseAlert(id, 'cpu', `🔥 CPU ${name} ${Number(cpu).toFixed(0)}% selama ${n} menit`);
      }
    } else {
      cpuStreak.delete(id);
      if (resolveAlert(id, 'cpu')) {
        await notify(id, 'cpu-ok', `🔥 CPU ${name} kembali normal (${Number(cpu).toFixed(0)}%)`);
      }
    }
  }
}

module.exports = { init, sendTelegram, notify, raiseAlert, resolveAlert, checkMetrics };
