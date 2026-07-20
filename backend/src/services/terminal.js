const { Client }     = require('ssh2');
const { query }      = require('../config/db');
const fs             = require('fs');
const cookieSignature = require('cookie-signature');
const { recordStatusChange } = require('./statusHistory');

const SSH_KEY = process.env.SSH_KEY_PATH || '/opt/rsmp-it-platform/keys/rs_master_key';

// Active sessions: clientId -> Set of ws
const sessions = new Map();

const SESSION_STORE_TIMEOUT_MS = 5000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'rs-it-secret-change-me';

function storeGet(sessionStore, sid) {
  return new Promise((resolve) => {
    sessionStore.get(sid, (err, session) => {
      if (err || !session || !session.userId) return resolve(null);
      resolve(session);
    });
  });
}

function timeoutAfter(ms) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), ms);
  });
}

async function getSessionFromCookie(req, sessionStore) {
  const header = req.headers.cookie || '';
  const match = header.match(/(?:^|;\s*)connect\.sid=([^;]+)/);
  if (!match) return null;

  let raw = decodeURIComponent(match[1]);
  // express-session signs cookies as "s:<sid>.<signature>" — strip the "s:" prefix
  // then verify the HMAC signature the same way express-session/cookie-signature does.
  if (raw.startsWith('s:')) raw = raw.slice(2);
  const sid = cookieSignature.unsign(raw, SESSION_SECRET);
  if (sid === false) return null;

  // Race the store lookup against a timeout so a hung MySQL-backed store
  // callback can't leave the WebSocket handler waiting forever.
  return Promise.race([
    storeGet(sessionStore, sid),
    timeoutAfter(SESSION_STORE_TIMEOUT_MS),
  ]);
}

async function handleTerminalWS(ws, req, clientId, sessionStore) {
  const session = await getSessionFromCookie(req, sessionStore);
  if (!session) { ws.close(4401, 'Unauthorized'); return; }

  if (!clientId) { ws.close(4001, 'clientId required'); return; }

  let clientInfo;
  try {
    const r = await query('SELECT * FROM clients WHERE id=?', [clientId]);
    clientInfo = r.rows[0];
    if (!clientInfo) { ws.close(4004, 'Client not found'); return; }
  } catch (e) { ws.close(4005, 'DB error'); return; }

  const ssh  = new Client();
  let stream = null;

  ssh.on('ready', () => {
    ssh.shell({ term: 'xterm-256color', rows: 24, cols: 80 }, (err, s) => {
      if (err) { ws.close(4006, 'Shell error'); return; }
      stream = s;

      ws.send(JSON.stringify({ type: 'connected', message: `Connected to ${clientInfo.name} (${clientInfo.ip_address})\r\n` }));

      stream.on('data', (data) => {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'data', data: data.toString('base64') }));
        }
      });

      stream.stderr.on('data', (data) => {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'data', data: data.toString('base64') }));
        }
      });

      stream.on('close', () => {
        ws.close();
        ssh.end();
      });
    });
  });

  ssh.on('error', (err) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'error', message: `SSH Error: ${err.message}` }));
    }
    ws.close();
  });

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'input' && stream) {
        stream.write(Buffer.from(data.data, 'base64'));
      } else if (data.type === 'resize' && stream) {
        stream.setWindow(data.rows, data.cols, 0, 0);
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    if (stream) stream.end();
    ssh.end();
  });

  // Connect SSH
  try {
    ssh.connect({
      host:        clientInfo.ip_address,
      port:        clientInfo.ssh_port || 22,
      username:    clientInfo.ssh_user || 'rsadmin',
      privateKey:  fs.readFileSync(SSH_KEY),
      readyTimeout: 10000,
    });
  } catch (e) {
    ws.close(4007, e.message);
  }

  // Log session start
  await query(
    `INSERT INTO command_logs (client_id, command, output) VALUES (?, ?, ?)`,
    [clientId, '[TERMINAL SESSION STARTED]', `Terminal session ke ${clientInfo.name}`]
  ).catch(() => {});
}

// Agent WebSocket — untuk client yang report status
function handleAgentWS(ws, req, token) {
  let clientId = null;

  if (process.env.AGENT_TOKEN && token !== process.env.AGENT_TOKEN) {
    ws.close(4001, 'Invalid agent token');
    return;
  }

  ws.on('message', async (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === 'register') {
        clientId = data.clientId;
        // Update status client dari agent heartbeat
        await recordStatusChange(clientId, 'online').catch(() => {});
        await query(
          `UPDATE clients SET
            status='online', last_seen=NOW(),
            cpu_usage=?, ram_usage=?, disk_usage=?,
            uptime=?, packages_pending=?,
            hostname=?, os_version=?, agent_version=?
           WHERE id=?`,
          [data.cpu, data.ram, data.disk, data.uptime,
           data.packagesPending, data.hostname, data.os,
           data.agentVersion, clientId]
        ).catch(() => {});

        ws.send(JSON.stringify({ type: 'ack', message: 'registered' }));
      }
    } catch (e) {}
  });

  ws.on('close', async () => {
    if (clientId) {
      await recordStatusChange(clientId, 'offline').catch(() => {});
      await query("UPDATE clients SET status='offline' WHERE id=?", [clientId]).catch(() => {});
    }
  });
}

module.exports = { handleTerminalWS, handleAgentWS };
