const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const { query } = require('../config/db');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib' });

    const result = await query(
      'SELECT id, username, password, full_name, role, active FROM users WHERE username=?', [username]
    );
    const user = result.rows[0];
    if (!user || !user.active) return res.status(401).json({ error: 'Username atau password salah' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Username atau password salah' });

    await query('UPDATE users SET last_login=NOW() WHERE id=?', [user.id]);

    req.session.userId   = user.id;
    req.session.username = user.username;
    req.session.role     = user.role;
    req.session.fullName = user.full_name;

    await query(
      "INSERT INTO audit_logs (user_id, action, ip_address) VALUES (?,'login',?)",
      [user.id, req.ip]
    );

    res.json({ id: user.id, username: user.username, fullName: user.full_name, role: user.role });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not logged in' });
  res.json({
    id: req.session.userId,
    username: req.session.username,
    role: req.session.role,
    fullName: req.session.fullName,
  });
});

// POST /api/auth/change-password
router.post('/change-password', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { oldPassword, newPassword } = req.body;
    const result = await query('SELECT password FROM users WHERE id=?', [req.session.userId]);
    const valid = await bcrypt.compare(oldPassword, result.rows[0].password);
    if (!valid) return res.status(400).json({ error: 'Password lama salah' });

    const hashed = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password=? WHERE id=?', [hashed, req.session.userId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/auth/users (admin only)
router.get('/users', async (req, res) => {
  if (req.session?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const r = await query('SELECT id,username,full_name,role,active,created_at,last_login FROM users ORDER BY id');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/auth/users (admin only)
const VALID_ROLES = ['admin', 'operator', 'viewer'];

router.post('/users', async (req, res) => {
  if (req.session?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { username, password, full_name, role } = req.body;
    const finalRole = role || 'viewer';
    if (!VALID_ROLES.includes(finalRole)) {
      return res.status(400).json({ error: `Role tidak valid. Pilihan: ${VALID_ROLES.join(', ')}` });
    }
    const hashed = await bcrypt.hash(password, 12);
    const ins = await query(
      'INSERT INTO users (username,password,full_name,role) VALUES (?,?,?,?)',
      [username, hashed, full_name, finalRole]
    );
    const r = await query('SELECT id,username,full_name,role FROM users WHERE id=?', [ins.insertId]);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
