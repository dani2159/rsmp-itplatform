// Buat/reset user admin pertama. Setara STEP 9 di server-setup/install-server.sh
// (versi bare-metal pakai python3 bcrypt); dipakai untuk deployment Docker.
// Jalankan: node src/utils/seed-admin.js  (baca env ADMIN_PASSWORD, default random)
require('dotenv').config();
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

async function main() {
  const password = process.env.ADMIN_PASSWORD ||
    require('crypto').randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  const hash = await bcrypt.hash(password, 12);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'rsmpitadmin',
    password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'rsmpitdb',
  });

  await conn.execute(
    `INSERT INTO users (username, password, full_name, role)
     VALUES ('admin', ?, 'Administrator', 'admin')
     ON DUPLICATE KEY UPDATE password = VALUES(password)`,
    [hash]
  );
  await conn.end();

  console.log('Admin user siap.');
  console.log(`  username: admin`);
  console.log(`  password: ${password}`);
}

main().catch((e) => { console.error('Gagal seed admin:', e.message); process.exit(1); });
