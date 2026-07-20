// ── routes/tickets.js ──────────────────────────────
const router = require('express').Router();
const { query } = require('../config/db');
const { requireOperator } = require('../middleware/auth');

const genTicketNo = () => {
  const d = new Date();
  return `TKT-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
};

router.get('/', async (req, res) => {
  try {
    const { status, priority, assigned_to } = req.query;
    let sql = `
      SELECT t.*, c.name as client_name, c.ip_address,
             u1.full_name as assigned_name, u2.full_name as created_by_name
      FROM tickets t
      LEFT JOIN clients c ON t.client_id=c.id
      LEFT JOIN users u1 ON t.assigned_to=u1.id
      LEFT JOIN users u2 ON t.created_by=u2.id
      WHERE 1=1`;
    const params = [];
    if (status)      { params.push(status);      sql += ' AND t.status=?'; }
    if (priority)    { params.push(priority);    sql += ' AND t.priority=?'; }
    if (assigned_to) { params.push(assigned_to); sql += ' AND t.assigned_to=?'; }
    sql += ' ORDER BY t.created_at DESC';
    const r = await query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { title, description, client_id, priority, category, assigned_to } = req.body;
    const ticket_no = genTicketNo();
    const ins = await query(
      `INSERT INTO tickets (ticket_no,title,description,client_id,priority,category,assigned_to,created_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [ticket_no,title,description,client_id,priority||'medium',category,assigned_to,req.session.userId]
    );
    const r = await query('SELECT * FROM tickets WHERE id=?', [ins.insertId]);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const r = await query(`
      SELECT t.*, c.name as client_name, c.ip_address,
             u1.full_name as assigned_name, u2.full_name as created_by_name
      FROM tickets t
      LEFT JOIN clients c ON t.client_id=c.id
      LEFT JOIN users u1 ON t.assigned_to=u1.id
      LEFT JOIN users u2 ON t.created_by=u2.id
      WHERE t.id=?`, [req.params.id]);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireOperator, async (req, res) => {
  try {
    const { title, description, status, priority, category, assigned_to, resolution } = req.body;
    const closedAt = status === 'closed' ? 'NOW()' : 'NULL';
    await query(
      `UPDATE tickets SET title=?,description=?,status=?,priority=?,
       category=?,assigned_to=?,resolution=?,updated_at=NOW(),
       closed_at=${closedAt} WHERE id=?`,
      [title,description,status,priority,category,assigned_to,resolution,req.params.id]
    );
    const r = await query('SELECT * FROM tickets WHERE id=?', [req.params.id]);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireOperator, async (req, res) => {
  try {
    await query('DELETE FROM tickets WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/stats/summary', async (req, res) => {
  try {
    const r = await query(`
      SELECT
        SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) AS closed,
        SUM(CASE WHEN priority='high' AND status!='closed' THEN 1 ELSE 0 END) AS \`high_priority\`,
        COUNT(*) AS total
      FROM tickets`);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
