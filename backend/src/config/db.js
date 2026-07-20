const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'rsmpitdb',
  user:     process.env.DB_USER || 'rsmpitadmin',
  password: process.env.DB_PASS,
  connectionLimit: 20,
  waitForConnections: true,
  connectTimeout: 10000,
});

const query = async (text, params) => {
  const [result] = await pool.query(text, params);
  if (Array.isArray(result)) return { rows: result };
  return { rows: [], insertId: result.insertId, affectedRows: result.affectedRows };
};

module.exports = { pool, query };
