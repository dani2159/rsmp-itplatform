-- Schema RSMP-IT Platform. Sumber kebenaran: server-setup/install-server.sh
-- (STEP 8). Kalau ubah schema di sana, samakan juga di sini.
-- Dijalankan otomatis oleh image MariaDB resmi lewat docker-entrypoint-initdb.d,
-- database aktif sudah MYSQL_DATABASE (lihat docker-compose.yml).

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL, full_name VARCHAR(100),
  role VARCHAR(20) DEFAULT 'staff', active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, last_login TIMESTAMP NULL);

CREATE TABLE IF NOT EXISTS clients (
  id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL,
  hostname VARCHAR(100), ip_address VARCHAR(45) NOT NULL UNIQUE,
  mac_address VARCHAR(20),
  os_type VARCHAR(10) DEFAULT 'linux', os_version VARCHAR(100),
  location VARCHAR(100), department VARCHAR(50), category VARCHAR(50),
  ssh_user VARCHAR(50) DEFAULT 'rsadmin', ssh_port INTEGER DEFAULT 22,
  vnc_port INTEGER DEFAULT 5901, vnc_password VARCHAR(32),
  rustdesk_id VARCHAR(100), status VARCHAR(20) DEFAULT 'unknown',
  ssh_ready BOOLEAN DEFAULT false, agent_version VARCHAR(20),
  last_seen TIMESTAMP NULL, last_update TIMESTAMP NULL, uptime VARCHAR(100),
  cpu_usage FLOAT, ram_usage FLOAT, disk_usage FLOAT,
  packages_pending INTEGER DEFAULT 0, load_avg VARCHAR(50),
  boot_time VARCHAR(50), running_apps TEXT, top_processes TEXT,
  network_info TEXT, logged_users TEXT, services_status TEXT,
  cpu_temp FLOAT, installed_apps TEXT, notes TEXT,
  ram_detail VARCHAR(50), disk_detail VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS tickets (
  id INT AUTO_INCREMENT PRIMARY KEY, ticket_no VARCHAR(20) UNIQUE NOT NULL,
  title VARCHAR(200) NOT NULL, description TEXT,
  client_id INTEGER, assigned_to INTEGER, created_by INTEGER,
  priority VARCHAR(20) DEFAULT 'medium', status VARCHAR(20) DEFAULT 'open',
  category VARCHAR(50), resolution TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL);

CREATE TABLE IF NOT EXISTS command_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INTEGER, user_id INTEGER,
  command TEXT NOT NULL, output TEXT, exit_code INTEGER,
  duration_ms INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL);

CREATE TABLE IF NOT EXISTS deploy_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY, job_name VARCHAR(100), script_type VARCHAR(50),
  targets JSON, status VARCHAR(20) DEFAULT 'pending',
  created_by INTEGER,
  results JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, finished_at TIMESTAMP NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL);

CREATE TABLE IF NOT EXISTS update_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INTEGER,
  status VARCHAR(20) DEFAULT 'pending', output TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, finished_at TIMESTAMP NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INTEGER,
  action VARCHAR(100) NOT NULL, target VARCHAR(200),
  details JSON, ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL);

CREATE TABLE IF NOT EXISTS update_config (
  id INT AUTO_INCREMENT PRIMARY KEY, schedule_time VARCHAR(5) DEFAULT '02:00',
  mode VARCHAR(20) DEFAULT 'all', bandwidth_kb INTEGER DEFAULT 1024,
  auto_restart BOOLEAN DEFAULT false, notify_users BOOLEAN DEFAULT false,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS system_config (
  `key` VARCHAR(100) PRIMARY KEY, value TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS client_status_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  status VARCHAR(10) NOT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  INDEX idx_client_time (client_id, changed_at));

CREATE TABLE IF NOT EXISTS alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NULL,
  type VARCHAR(30) NOT NULL,
  message VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  INDEX idx_created (created_at));

INSERT IGNORE INTO update_config (schedule_time) VALUES ('02:00');
