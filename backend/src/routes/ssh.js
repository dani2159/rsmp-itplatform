// ── routes/ssh.js ──────────────────────────────────
const router   = require('express').Router();
const { NodeSSH } = require('node-ssh');
const { query }   = require('../config/db');
const { requireOperator } = require('../middleware/auth');
const fs          = require('fs');

const SSH_KEY = process.env.SSH_KEY_PATH || '/opt/rsmp-it-platform/keys/rs_master_key';

async function getClient(id) {
  const r = await query('SELECT * FROM clients WHERE id=?', [id]);
  return r.rows[0];
}

// POST /api/ssh/:id/exec — jalankan single command
router.post('/:id/exec', requireOperator, async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'Command kosong' });

  const client = await getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client tidak ditemukan' });

  const start = Date.now();
  const ssh   = new NodeSSH();

  try {
    await ssh.connect({
      host:       client.ip_address,
      port:       client.ssh_port || 22,
      username:   client.ssh_user || 'rsadmin',
      privateKey: fs.readFileSync(SSH_KEY, 'utf8'),
      readyTimeout: 10000,
    });

    const result = await ssh.execCommand(command, { execOptions: { pty: true } });
    const duration = Date.now() - start;

    await query(
      `INSERT INTO command_logs (client_id, user_id, command, output, exit_code, duration_ms)
       VALUES (?,?,?,?,?,?)`,
      [client.id, req.session.userId, command,
       result.stdout + (result.stderr ? '\n' + result.stderr : ''),
       result.code || 0, duration]
    );

    ssh.dispose();
    res.json({ stdout: result.stdout, stderr: result.stderr, exitCode: result.code, duration });
  } catch (e) {
    ssh.dispose();
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ssh/:id/exec-sudo — jalankan sebagai sudo
router.post('/:id/exec-sudo', requireOperator, async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'Command kosong' });
  const client = await getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client tidak ditemukan' });

  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: client.ip_address, port: client.ssh_port || 22,
      username: client.ssh_user || 'rsadmin',
      privateKey: fs.readFileSync(SSH_KEY, 'utf8'),
      readyTimeout: 10000,
    });

    const result = await ssh.execCommand(`sudo -n ${command}`, { execOptions: { pty: true } });
    ssh.dispose();

    await query(
      `INSERT INTO command_logs (client_id, user_id, command, output, exit_code)
       VALUES (?,?,?,?,?)`,
      [client.id, req.session.userId, `sudo ${command}`,
       result.stdout + (result.stderr ? '\n' + result.stderr : ''), result.code || 0]
    );

    res.json({ stdout: result.stdout, stderr: result.stderr, exitCode: result.code });
  } catch (e) { ssh.dispose(); res.status(500).json({ error: e.message }); }
});

// POST /api/ssh/:id/upload-key — copy public key ke client
router.post('/:id/upload-key', requireOperator, async (req, res) => {
  const { password } = req.body;
  const client = await getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client tidak ditemukan' });

  const pubKey = fs.readFileSync(process.env.SSH_PUB_KEY_PATH, 'utf8').trim();

  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: client.ip_address, port: client.ssh_port || 22,
      username: client.ssh_user || 'rsadmin',
      password,
      readyTimeout: 10000,
    });

    await ssh.execCommand(`mkdir -p ~/.ssh && chmod 700 ~/.ssh`);
    await ssh.execCommand(`echo '${pubKey}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`);
    await ssh.execCommand(`sort -u ~/.ssh/authorized_keys -o ~/.ssh/authorized_keys`);

    ssh.dispose();
    await query('UPDATE clients SET ssh_ready=true WHERE id=?', [client.id]);
    await query("INSERT INTO audit_logs (user_id,action,target) VALUES (?,'upload_ssh_key',?)",
      [req.session.userId, client.name]);

    res.json({ ok: true, message: 'SSH key berhasil diinstall' });
  } catch (e) { ssh.dispose(); res.status(500).json({ error: e.message }); }
});

// POST /api/ssh/:id/test
router.post('/:id/test', async (req, res) => {
  const client = await getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client tidak ditemukan' });

  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: client.ip_address, port: client.ssh_port || 22,
      username: client.ssh_user || 'rsadmin',
      privateKey: fs.readFileSync(SSH_KEY, 'utf8'),
      readyTimeout: 8000,
    });

    const info = await ssh.execCommand(
      'echo "ok" && uname -a && uptime && df -h / | tail -1 && free -m | grep Mem'
    );
    ssh.dispose();

    await query('UPDATE clients SET ssh_ready=true, last_seen=NOW() WHERE id=?', [client.id]);
    res.json({ ok: true, info: info.stdout });
  } catch (e) {
    ssh.dispose();
    await query('UPDATE clients SET ssh_ready=false WHERE id=?', [client.id]);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/ssh/:id/system-info — ambil info sistem lengkap
router.get('/:id/system-info', async (req, res) => {
  const client = await getClient(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client tidak ditemukan' });

  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: client.ip_address, port: client.ssh_port || 22,
      username: client.ssh_user || 'rsadmin',
      privateKey: fs.readFileSync(SSH_KEY, 'utf8'),
      readyTimeout: 8000,
    });

    const script = `
echo "=HOSTNAME=" && hostname
echo "=OS=" && cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2
echo "=UPTIME=" && uptime -p
echo "=CPU=" && top -bn2 -d0.3 | grep "Cpu(s)" | tail -1 | awk '{print $2}' | cut -d'%' -f1
echo "=RAM=" && free -m | awk 'NR==2{printf "%.1f", $3*100/$2}'
echo "=RAMDETAIL=" && free -m | awk 'NR==2{printf "%dMB/%dMB", $3, $2}'
echo "=DISK=" && df -h / | tail -1 | awk '{print $5}' | tr -d '%'
echo "=DISKDETAIL=" && df -h / | tail -1 | awk '{print $3"/"$2}'
echo "=IP=" && hostname -I | awk '{print $1}'
echo "=KERNEL=" && uname -r
echo "=UPDATES=" && apt list --upgradable 2>/dev/null | grep -c upgradable || echo 0
echo "=LOADAVG=" && cat /proc/loadavg | cut -d' ' -f1-3
echo "=BOOTTIME=" && who -b 2>/dev/null | awk '{print $3" "$4}' || uptime -s
echo "=LOGGEDUSERS=" && who 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ','
echo "=SERVICES=" && for s in ssh rsmp-agent x11vnc rustdesk; do echo -n "$s:$(systemctl is-active $s 2>/dev/null),"; done
    `.trim();

    const r = await ssh.execCommand(script);
    ssh.dispose();

    const parse = (key) => {
      const m = r.stdout.match(new RegExp(`=${key}=\\n([^\\n]+)`));
      return m ? m[1].trim() : null;
    };

    const info = {
      hostname:        parse('HOSTNAME'),
      os:              parse('OS'),
      uptime:          parse('UPTIME'),
      cpuUsage:        parseFloat(parse('CPU') || 0),
      ramUsage:        parseFloat(parse('RAM') || 0),
      ramDetail:       parse('RAMDETAIL'),
      diskUsage:       parseFloat(parse('DISK') || 0),
      diskDetail:      parse('DISKDETAIL'),
      ip:              parse('IP'),
      kernel:          parse('KERNEL'),
      packagesPending: Math.max(0, parseInt(parse('UPDATES') || 0) - 1),
      loadAvg:         parse('LOADAVG'),
      bootTime:        parse('BOOTTIME'),
      loggedUsers:     (parse('LOGGEDUSERS') || '').replace(/,$/, ''),
      services:        parse('SERVICES'),
    };

    await query(
      `UPDATE clients SET
        hostname=?, os_version=?, uptime=?, cpu_usage=?,
        ram_usage=?, disk_usage=?, packages_pending=?,
        load_avg=?, boot_time=?, logged_users=?,
        ram_detail=?, disk_detail=?,
        last_seen=NOW(), status='online'
       WHERE id=?`,
      [info.hostname, info.os, info.uptime, info.cpuUsage,
       info.ramUsage, info.diskUsage, info.packagesPending,
       info.loadAvg, info.bootTime, info.loggedUsers,
       info.ramDetail, info.diskDetail,
       client.id]
    );

    res.json(info);
  } catch (e) { ssh.dispose(); res.status(500).json({ error: e.message }); }
});

// POST /api/ssh/bulk-key-upload — upload key ke banyak client sekaligus
router.post('/bulk-key-upload', requireOperator, async (req, res) => {
  const { clientIds, password } = req.body;
  if (!clientIds?.length) return res.status(400).json({ error: 'clientIds kosong' });

  const pubKey = fs.readFileSync(process.env.SSH_PUB_KEY_PATH, 'utf8').trim();
  const results = [];

  for (const id of clientIds) {
    const client = await getClient(id);
    if (!client) { results.push({ id, ok: false, error: 'Not found' }); continue; }

    const ssh = new NodeSSH();
    try {
      await ssh.connect({
        host: client.ip_address, port: client.ssh_port || 22,
        username: client.ssh_user || 'rsadmin',
        password, readyTimeout: 8000,
      });
      await ssh.execCommand(`mkdir -p ~/.ssh && chmod 700 ~/.ssh`);
      await ssh.execCommand(`echo '${pubKey}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`);
      ssh.dispose();
      await query('UPDATE clients SET ssh_ready=true WHERE id=?', [id]);
      results.push({ id, name: client.name, ok: true });
    } catch (e) {
      ssh.dispose();
      results.push({ id, name: client.name, ok: false, error: e.message });
    }
  }

  res.json({ results });
});

module.exports = router;
