#!/bin/bash
# RSMP-IT migrate-db.sh v5.0
[ "$EUID" -ne 0 ] && { echo "Harus sudo!"; exit 1; }
ENV=/opt/rsmp-it-platform/backend/.env
DB=$(grep ^DB_NAME "$ENV" 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo rsmpitdb)
DBU=$(grep ^DB_USER "$ENV" 2>/dev/null | cut -d= -f2 | tr -d ' ' || echo rsmpitadmin)
DBP=$(grep ^DB_PASS "$ENV" 2>/dev/null | cut -d= -f2 | tr -d ' ')
echo "Migrate: $DB"
mysql --force -u "$DBU" -p"$DBP" "$DB" << 'SQL' 2>/dev/null
ALTER TABLE clients ADD COLUMN load_avg VARCHAR(50);
ALTER TABLE clients ADD COLUMN boot_time VARCHAR(50);
ALTER TABLE clients ADD COLUMN running_apps TEXT;
ALTER TABLE clients ADD COLUMN top_processes TEXT;
ALTER TABLE clients ADD COLUMN network_info TEXT;
ALTER TABLE clients ADD COLUMN logged_users TEXT;
ALTER TABLE clients ADD COLUMN services_status TEXT;
ALTER TABLE clients ADD COLUMN cpu_temp FLOAT;
ALTER TABLE clients ADD COLUMN installed_apps TEXT;
ALTER TABLE clients ADD COLUMN mac_address VARCHAR(20);
ALTER TABLE clients ADD COLUMN ram_detail VARCHAR(50);
ALTER TABLE clients ADD COLUMN disk_detail VARCHAR(50);
ALTER TABLE clients ADD COLUMN vnc_password VARCHAR(32);
CREATE TABLE IF NOT EXISTS client_status_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  status VARCHAR(10) NOT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  INDEX idx_client_time (client_id, changed_at));
SQL
mysql -u "$DBU" -p"$DBP" "$DB" -e "UPDATE users SET role='viewer' WHERE role='staff';" 2>/dev/null
echo "[OK] Migration selesai"
