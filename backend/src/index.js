require('dotenv').config();
const express     = require('express');
const session     = require('express-session');
const MySQLStore  = require('express-mysql-session')(session);
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const http        = require('http');
const WebSocket   = require('ws');
const path        = require('path');
const { pool }    = require('./config/db');

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

const sessionStore = new MySQLStore({
  host:     process.env.DB_HOST || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER || 'rsmpitadmin',
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || 'rsmpitdb',
  createDatabaseTable: true,
});

if (process.env.NODE_ENV === 'production' && !process.env.AGENT_TOKEN) {
  throw new Error('AGENT_TOKEN wajib di-set di .env saat NODE_ENV=production');
}
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET wajib di-set di .env saat NODE_ENV=production');
}

const authRoutes    = require('./routes/auth');
const clientRoutes  = require('./routes/clients');
const ticketRoutes  = require('./routes/tickets');
const deployRoutes  = require('./routes/deploy');
const updateRoutes  = require('./routes/update');
const sshRoutes     = require('./routes/ssh');
const agentRoutes    = require('./routes/agent');
const rustdeskRoutes = require('./routes/rustdesk');
const sysModule      = require('./routes/system');
const { handleTerminalWS, handleAgentWS } = require('./services/terminal');
const { requireAuth } = require('./middleware/auth');
const scheduler       = require('./services/scheduler');
const offlineSweep    = require('./services/offlineSweep');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server, path: '/ws' });

const CORS_ORIGIN = process.env.CORS_ORIGIN ||
  `http://${process.env.SERVER_IP || 'localhost'}:${process.env.WEB_PORT || '8080'}`;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('combined'));
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'rs-it-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
}));

// Public routes (no auth required)
app.use('/api/auth',  authRoutes);
app.use('/api/agent', agentRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString(), version: '1.0.0' }));

// Protected routes
app.use('/api/clients', requireAuth, clientRoutes);
app.use('/api/tickets', requireAuth, ticketRoutes);
app.use('/api/deploy',  requireAuth, deployRoutes);
app.use('/api/update',  requireAuth, updateRoutes);
app.use('/api/ssh',     requireAuth, sshRoutes);
app.use('/api/system',  requireAuth, sysModule);
app.use('/api/logs',     requireAuth, sysModule.logsRouter);
app.use('/api/iso',     requireAuth, sysModule.isoRouter);
app.use('/api/rustdesk',requireAuth, rustdeskRoutes);

app.use('/uploads', express.static(
  path.join(process.env.APP_DIR || '/opt/rsmp-it-platform', 'uploads')
));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

wss.on('connection', (ws, req) => {
  const url  = new URL(req.url, `http://${req.headers.host}`);
  const type = url.searchParams.get('type');
  if (type === 'terminal') handleTerminalWS(ws, req, url.searchParams.get('client'), sessionStore);
  else if (type === 'agent') handleAgentWS(ws, req, url.searchParams.get('token'));
  else ws.close(4000, 'Unknown type');
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`RS-IT Backend running on port ${PORT}`);
  scheduler.init();
  offlineSweep.init();
});

process.on('SIGTERM', () => {
  wss.clients.forEach((ws) => ws.terminate());
  wss.close();
  server.close(() => {
    pool.end();
    process.exit(0);
  });
  // server.close() waits for all keep-alive connections to end, which can
  // hang indefinitely — force exit so systemd doesn't wait its full
  // TimeoutStopSec (90s default) on every restart/redeploy.
  setTimeout(() => process.exit(1), 8000).unref();
});
