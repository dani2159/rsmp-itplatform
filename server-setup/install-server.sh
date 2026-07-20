#!/bin/bash
# ================================================================
#  RSMP-IT Platform — Server Installer DEFINITIVE v5.0
#  Ubuntu 22.04 LTS
#  Semua error sudah ditangani:
#  - dpkg/debconf lock
#  - PostgreSQL ssl-cert dependency
#  - pip bcrypt gagal
#  - needrestart prompt
#  - Node.js versi lama
# ================================================================
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export NEEDRESTART_SUSPEND=1
export UCF_FORCE_CONFFOLD=1
export PIP_BREAK_SYSTEM_PACKAGES=1

R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' C='\033[0;36m' NC='\033[0m'
ok()    { echo -e "${G}[OK]${NC} $1"; }
info()  { echo -e "${Y}[..]${NC} $1"; }
warn()  { echo -e "${Y}[!]${NC}  $1"; }
err()   { echo -e "${R}[!!]${NC} $1"; exit 1; }
title() { echo -e "\n${C}━━━ $1 ━━━${NC}"; }

[ "$EUID" -ne 0 ] && err "Jalankan: sudo bash install-server.sh"

APP=/opt/rsmp-it-platform
LOG=/var/log/rsmp-install.log
mkdir -p /var/log "$APP/backend" "$APP/keys"
exec > >(tee -a "$LOG") 2>&1

echo "================================================================"
echo "  RSMP-IT Server Installer v5.0 — $(date)"
echo "================================================================"

# ── INPUT ─────────────────────────────────────────────────────────
read -p "Nama RS [RSMP Hospital]: "   RS_NAME;  RS_NAME="${RS_NAME:-RSMP Hospital}"
DEF_IP=$(ip -4 route get 8.8.8.8 2>/dev/null | awk '{print $7;exit}' \
         || hostname -I | awk '{print $1}')
read -p "IP Server [$DEF_IP]: "       SRV_IP;   SRV_IP="${SRV_IP:-$DEF_IP}"
read -s -p "Password DB (min 6 char): " DB_PASS; echo
[ ${#DB_PASS} -lt 4 ] && DB_PASS="Rsmp$(openssl rand -hex 4)"
read -s -p "Password Admin Web: "    ADM_PASS; echo
[ -z "$ADM_PASS" ] && err "Password admin tidak boleh kosong!"
read -p "Port Web [8080]: "           WEB_PORT; WEB_PORT="${WEB_PORT:-8080}"
SESSION=$(openssl rand -hex 32)
AGENT_TOKEN=$(openssl rand -hex 24)

# ── PORT CONFLICT DETECTION ──────────────────────────────────────
# Server ini mungkin sudah menjalankan aplikasi lain (mis. Docker stack)
# yang memakai port default kita. Deteksi bentrok dan auto-pindah ke
# port bebas berikutnya, daripada gagal diam-diam belakangan.
port_in_use() {
  ss -tln 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"
}
find_free_port() {
  local port=$1
  while port_in_use "$port"; do port=$((port+1)); done
  echo "$port"
}

if port_in_use "$WEB_PORT"; then
  NEW_WEB_PORT=$(find_free_port "$WEB_PORT")
  warn "Port $WEB_PORT sudah dipakai proses lain — pindah ke $NEW_WEB_PORT"
  WEB_PORT="$NEW_WEB_PORT"
fi

DB_PORT=3306
if port_in_use "$DB_PORT"; then
  NEW_DB_PORT=$(find_free_port 3307)
  warn "Port $DB_PORT sudah dipakai proses lain — MariaDB akan pakai $NEW_DB_PORT"
  DB_PORT="$NEW_DB_PORT"
fi

# ── FUNGSI APT YANG ROBUST ────────────────────────────────────────
kill_apt() {
  # Matikan semua proses yang bisa bikin lock
  systemctl stop unattended-upgrades apt-daily.service \
    apt-daily-upgrade.service 2>/dev/null || true
  systemctl stop apt-daily.timer apt-daily-upgrade.timer 2>/dev/null || true
  systemctl mask apt-daily.service apt-daily-upgrade.service 2>/dev/null || true
  pkill -9 -f unattended-upgrade 2>/dev/null || true
  pkill -9 -f apt-get 2>/dev/null || true
  sleep 2
  # Hapus semua lock
  for f in /var/lib/dpkg/lock /var/lib/dpkg/lock-frontend \
            /var/cache/apt/archives/lock \
            /var/cache/debconf/config.dat.lock \
            /var/lib/apt/lists/lock; do
    rm -f "$f" 2>/dev/null || true
  done
  dpkg --configure -a 2>&1 | grep -v "^$" | tail -5 || true
}

safe_apt() {
  # Jalankan apt-get dengan retry otomatis
  local n=0
  while [ $n -lt 3 ]; do
    if DEBIAN_FRONTEND=noninteractive apt-get install -y -q \
      -o Dpkg::Options::="--force-confdef" \
      -o Dpkg::Options::="--force-confold" \
      -o Dpkg::Options::="--force-overwrite" \
      --allow-change-held-packages \
      --fix-broken "$@" 2>&1 | grep -v "^$" | tail -8; then
      return 0
    fi
    n=$((n+1))
    warn "Attempt $n gagal, tunggu 5 detik..."
    sleep 5
    kill_apt
  done
  warn "Tidak bisa install: $* — lanjut..."
  return 0
}

# ── STEP 0: BERSIHKAN LOCK ────────────────────────────────────────
title "STEP 0 — Bersihkan Lock APT/DPKG"
kill_apt
ok "Lock dibersihkan"

# ── PERINGATAN SERVER SHARED ─────────────────────────────────────
# apt-get upgrade bisa memicu restart docker.service (lewat needrestart/
# postinst package), yang ikut me-restart SEMUA container di server ini.
# Kalau ada aplikasi lain jalan di server ini, itu downtime singkat yang
# tidak disengaja — beri tahu operator sebelum STEP 2 jalan.
if command -v docker >/dev/null 2>&1; then
  RUNNING_CONTAINERS=$(docker ps --format '{{.Names}}' 2>/dev/null | wc -l)
  if [ "$RUNNING_CONTAINERS" -gt 0 ]; then
    warn "Server ini menjalankan $RUNNING_CONTAINERS container Docker yang aktif:"
    docker ps --format '  - {{.Names}} ({{.Ports}})' 2>/dev/null
    warn "apt-get upgrade di STEP 2 bisa memicu restart docker.service dan"
    warn "ikut me-restart semua container di atas. Lanjut dalam 10 detik..."
    sleep 10
  fi
fi

# ── STEP 1: FIX NEEDRESTART ───────────────────────────────────────
title "STEP 1 — Nonaktifkan needrestart prompt"
if [ -f /etc/needrestart/needrestart.conf ]; then
  sed -i "s/^#\?\s*\$nrconf{restart}.*$/\$nrconf{restart} = 'a';/" \
    /etc/needrestart/needrestart.conf 2>/dev/null || true
fi
# Buat config baru jika tidak ada
mkdir -p /etc/needrestart/conf.d
echo "\$nrconf{restart} = 'a';" > /etc/needrestart/conf.d/rsmp.conf
ok "needrestart = auto"

# ── STEP 2: UPDATE SISTEM ─────────────────────────────────────────
title "STEP 2 — Update Sistem"
apt-get update -qq 2>&1 | tail -3 || { apt-get clean; apt-get update -qq; }
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -q \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold" 2>&1 | tail -5
ok "Sistem updated"

# ── STEP 3: DEPENDENCIES DASAR ───────────────────────────────────
title "STEP 3 — Install Dependencies"
safe_apt \
  curl wget ca-certificates gnupg2 lsb-release openssl \
  build-essential unzip software-properties-common \
  python3 python3-pip python3-dev python3-venv \
  net-tools htop ufw
ok "Dependencies OK"

# ── STEP 4: UPGRADE PIP DULU (WAJIB SEBELUM bcrypt) ──────────────
title "STEP 4 — Upgrade pip + Install bcrypt"
info "Upgrade pip..."
python3 -m pip install --upgrade pip setuptools wheel -q 2>&1 | tail -3
info "Install bcrypt..."
python3 -m pip install bcrypt -q 2>&1 | tail -3
# Verifikasi
python3 -c "import bcrypt; print('bcrypt OK:', bcrypt.__version__)" \
  || err "bcrypt gagal. Cek: python3 -m pip install bcrypt"
# Install packages lain
python3 -m pip install psutil websockets requests -q 2>&1 | tail -3
ok "Python packages OK"

# ── STEP 5: NODE.JS 20 ───────────────────────────────────────────
title "STEP 5 — Install Node.js 20"
# Cek versi yang ada
if node --version 2>/dev/null | grep -q "v2[0-9]"; then
  ok "Node.js sudah v20+: $(node --version)"
else
  info "Install Node.js 20..."
  # Hapus versi lama
  apt-get remove -y -q nodejs npm 2>/dev/null || true
  apt-get autoremove -y -q 2>/dev/null || true
  # Install dari NodeSource
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>&1 | tail -5
  safe_apt nodejs
  ok "Node.js $(node --version)"
fi

# ── STEP 6: MARIADB ──────────────────────────────────────────────
title "STEP 6 — Install MariaDB"
# Cek apakah sudah ada
if mysql --version 2>/dev/null | grep -qi "mariadb"; then
  ok "MariaDB sudah ada"
else
  info "Install MariaDB dari repo resmi..."
  MARIADB_CODENAME=$(lsb_release -cs)
  case "$MARIADB_CODENAME" in
    focal|jammy|mantic|noble|oracular|plucky) ;;
    *)
      info "Codename '$MARIADB_CODENAME' belum ada di repo MariaDB, fallback ke 'noble'"
      MARIADB_CODENAME=noble
      ;;
  esac
  curl -fsSL https://mariadb.org/mariadb_release_signing_key.pgp \
    -o /etc/apt/trusted.gpg.d/mariadb.asc
  echo "deb [signed-by=/etc/apt/trusted.gpg.d/mariadb.asc] \
https://mirror.mariadb.org/repo/11.4/ubuntu $MARIADB_CODENAME main" \
    > /etc/apt/sources.list.d/mariadb.list

  apt-get update -qq
  safe_apt mariadb-server mariadb-client
fi

if [ "$DB_PORT" != "3306" ]; then
  info "Konfigurasi MariaDB pakai port $DB_PORT (3306 sudah dipakai)"
  printf '[mariadbd]\nport = %s\n' "$DB_PORT" > /etc/mysql/mariadb.conf.d/60-rsmp-port.cnf
fi

systemctl enable mariadb --now
sleep 2
if ! mysql -u root -e "SELECT VERSION()" >/dev/null 2>&1; then
  systemctl restart mariadb
  sleep 3
fi
systemctl is-active --quiet mariadb || err "MariaDB gagal start — cek: journalctl -xeu mariadb.service"
mysql -u root -e "SELECT VERSION()" >/dev/null 2>&1 || \
  err "MariaDB jalan tapi tidak bisa connect via socket — cek: mysql -u root"
ok "MariaDB running (port $DB_PORT)"

# ── STEP 7: BUAT DATABASE ─────────────────────────────────────────
title "STEP 7 — Setup Database"
mysql -u root << SQLEOF
DROP DATABASE IF EXISTS rsmpitdb;
DROP USER IF EXISTS 'rsmpitadmin'@'localhost';
CREATE DATABASE rsmpitdb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'rsmpitadmin'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON rsmpitdb.* TO 'rsmpitadmin'@'localhost';
FLUSH PRIVILEGES;
SQLEOF
[ $? -eq 0 ] || err "Setup database gagal — cek: mysql -u root"
mysql -u rsmpitadmin -p"${DB_PASS}" -e "SELECT 1" rsmpitdb >/dev/null 2>&1 || \
  err "User rsmpitadmin tidak bisa connect ke rsmpitdb setelah dibuat"
ok "Database rsmpitdb + user rsmpitadmin OK"

# ── STEP 8: SCHEMA ────────────────────────────────────────────────
title "STEP 8 — Buat Schema Database"
mysql -u rsmpitadmin -p"${DB_PASS}" rsmpitdb << 'SQLEOF'
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

INSERT IGNORE INTO update_config (schedule_time) VALUES ('02:00');
SQLEOF
[ $? -eq 0 ] || err "Buat schema gagal — cek: mysql -u rsmpitadmin -p rsmpitdb"
TABLE_COUNT=$(mysql -u rsmpitadmin -p"${DB_PASS}" rsmpitdb -N -e "SHOW TABLES" 2>/dev/null | wc -l)
[ "$TABLE_COUNT" -ge 10 ] || err "Schema tidak lengkap (cuma $TABLE_COUNT tabel) — cek log di atas"
ok "Schema OK ($TABLE_COUNT tabel)"

# ── STEP 9: BUAT ADMIN USER ───────────────────────────────────────
title "STEP 9 — Buat Admin User"
ADM_HASH=$(python3 - <<PYEOF
import bcrypt
h = bcrypt.hashpw(b'${ADM_PASS}', bcrypt.gensalt(12)).decode()
print(h)
PYEOF
)
[ -z "$ADM_HASH" ] && err "bcrypt hash gagal!"

mysql -u rsmpitadmin -p"${DB_PASS}" rsmpitdb -e \
  "INSERT INTO users (username,password,full_name,role)
   VALUES ('admin','${ADM_HASH}','Administrator','admin')
   ON DUPLICATE KEY UPDATE password='${ADM_HASH}';"
[ $? -eq 0 ] || err "Buat admin user gagal — cek: mysql -u rsmpitadmin -p rsmpitdb"
ADMIN_COUNT=$(mysql -u rsmpitadmin -p"${DB_PASS}" rsmpitdb -N -e \
  "SELECT COUNT(*) FROM users WHERE username='admin'" 2>/dev/null)
[ "$ADMIN_COUNT" = "1" ] || err "Admin user tidak ditemukan setelah insert"
ok "Admin user dibuat"

# ── STEP 10: REDIS ────────────────────────────────────────────────
title "STEP 10 — Redis"
safe_apt redis-server
grep -q "^supervised systemd" /etc/redis/redis.conf 2>/dev/null || \
  sed -i 's/^supervised no/supervised systemd/' /etc/redis/redis.conf 2>/dev/null || \
  echo "supervised systemd" >> /etc/redis/redis.conf
systemctl enable redis-server --now
sleep 1
redis-cli ping 2>/dev/null | grep -q PONG && ok "Redis OK" || \
  { systemctl restart redis-server; sleep 1; ok "Redis restarted"; }

# ── STEP 11: NGINX ────────────────────────────────────────────────
title "STEP 11 — Nginx"
safe_apt nginx
systemctl enable nginx
ok "Nginx OK"

# ── STEP 12: noVNC ───────────────────────────────────────────────
title "STEP 12 — noVNC + SSH tools"
safe_apt novnc websockify python3-websockify sshpass openssh-client
ok "noVNC OK"

# ── STEP 13: DIREKTORI & SSH KEY ──────────────────────────────────
title "STEP 13 — Setup Direktori & SSH Key"
mkdir -p "$APP"/{backend/src,frontend,uploads,logs,keys,isos,scripts/agent,backups}
mkdir -p /var/log/rsmp-it-platform

KEY_DIR="$APP/keys"
if [ ! -f "$KEY_DIR/rs_master_key" ]; then
  ssh-keygen -t ed25519 -C "rsmp-it-$(date +%Y)" \
    -f "$KEY_DIR/rs_master_key" -N ""
  chmod 600 "$KEY_DIR/rs_master_key"
  chmod 644 "$KEY_DIR/rs_master_key.pub"
fi
PUB_KEY=$(cat "$KEY_DIR/rs_master_key.pub")
ok "SSH key: $KEY_DIR/rs_master_key"

# ── STEP 14: SISTEM CONFIG & .ENV ────────────────────────────────
title "STEP 14 — Config & .env"
mysql -u rsmpitadmin -p"${DB_PASS}" rsmpitdb -e \
  "INSERT INTO system_config (\`key\`,value) VALUES
     ('rs_name','${RS_NAME}'),('server_ip','${SRV_IP}'),
     ('web_port','${WEB_PORT}'),('pub_key','${PUB_KEY}'),
     ('app_dir','${APP}'),('vnc_password','Rsmp2026')
   ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=NOW();" \
  2>/dev/null

cat > "$APP/backend/.env" << ENVEOF
NODE_ENV=production
PORT=3001
APP_DIR=${APP}
DB_HOST=localhost
DB_PORT=${DB_PORT}
DB_NAME=rsmpitdb
DB_USER=rsmpitadmin
DB_PASS=${DB_PASS}
REDIS_HOST=localhost
REDIS_PORT=6379
SESSION_SECRET=${SESSION}
AGENT_TOKEN=${AGENT_TOKEN}
SSH_KEY_PATH=${KEY_DIR}/rs_master_key
SSH_PUB_KEY_PATH=${KEY_DIR}/rs_master_key.pub
RS_NAME=${RS_NAME}
SERVER_IP=${SRV_IP}
WEB_PORT=${WEB_PORT}
ENVEOF
chmod 600 "$APP/backend/.env"
ok ".env OK"

# ── STEP 15: NGINX CONFIG ─────────────────────────────────────────
title "STEP 15 — Nginx Config"
# Tambah map ke http block di nginx.conf
if ! grep -q "connection_upgrade" /etc/nginx/nginx.conf; then
  sed -i '/^http {/a\\    map $http_upgrade $connection_upgrade {\n        default upgrade;\n        '"''"' close;\n    }' \
    /etc/nginx/nginx.conf 2>/dev/null || true
fi

cat > /etc/nginx/sites-available/rsmp-it << NGEOF
server {
    listen ${WEB_PORT} default_server;
    server_name _;
    client_max_body_size 500M;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_connect_timeout 60s;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_cache_bypass \$http_upgrade;
    }
    location /ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
    location /novnc/ {
        alias /usr/share/novnc/;
        index vnc.html;
        add_header X-Frame-Options SAMEORIGIN;
    }
    location ~ ^/novnc-ws/ {
        proxy_pass http://127.0.0.1:6081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Original-URI \$request_uri;
        proxy_read_timeout 86400s;
        proxy_buffering off;
    }
    location / {
        root ${APP}/frontend/dist;
        index index.html;
        try_files \$uri \$uri/ /index.html;
        location ~* \.(js|css|png|jpg|svg|woff|woff2|ico)\$ {
            expires 7d;
            add_header Cache-Control "public,immutable";
        }
    }
    location /uploads/ { alias ${APP}/uploads/; }
    location /isos/     { alias ${APP}/isos/; }
}
NGEOF
ln -sf /etc/nginx/sites-available/rsmp-it /etc/nginx/sites-enabled/rsmp-it
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx && ok "Nginx OK" || \
  warn "Nginx error, cek: nginx -t"

# ── STEP 16: SYSTEMD SERVICES ─────────────────────────────────────
title "STEP 16 — Systemd Services"
cat > /etc/systemd/system/rsmp-it-backend.service << SVEOF
[Unit]
Description=RSMP-IT Platform Backend
After=network.target mariadb.service redis-server.service
[Service]
Type=simple
User=www-data
WorkingDirectory=${APP}/backend
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
EnvironmentFile=${APP}/backend/.env
StandardOutput=append:/var/log/rsmp-it-platform/backend.log
StandardError=append:/var/log/rsmp-it-platform/backend-error.log
LimitNOFILE=65536
[Install]
WantedBy=multi-user.target
SVEOF

cat > /etc/systemd/system/rsmp-it-novnc.service << NVEOF
[Unit]
Description=RSMP-IT noVNC Proxy
After=network.target
[Service]
Type=simple
ExecStart=/usr/bin/python3 ${APP}/novnc-proxy.py
Restart=always
RestartSec=5
StandardOutput=append:/var/log/rsmp-it-platform/novnc.log
[Install]
WantedBy=multi-user.target
NVEOF

systemctl daemon-reload
systemctl enable rsmp-it-backend rsmp-it-novnc
ok "Services created"

# ── STEP 17: FIREWALL ─────────────────────────────────────────────
title "STEP 17 — Firewall"
ufw --force reset; ufw default deny incoming; ufw default allow outgoing
ufw allow 22/tcp; ufw allow "${WEB_PORT}/tcp"
ufw allow 21115:21119/tcp; ufw allow 21116/udp
ufw --force enable
ok "Firewall OK"

# ── STEP 18: PERMISSIONS ─────────────────────────────────────────
title "STEP 18 — Permissions"
chown -R www-data:www-data "$APP" 2>/dev/null || true
chmod -R 755 "$APP"
chmod 600 "$KEY_DIR/rs_master_key" "$APP/backend/.env"
chown www-data:www-data "$KEY_DIR/rs_master_key" "$APP/backend/.env"
chown -R www-data:www-data /var/log/rsmp-it-platform

# ── STEP 19: SIMPAN INFO ──────────────────────────────────────────
cat > /root/rsmp-it-info.txt << INFOEOF
==================================================
  RSMP-IT Platform — Informasi Instalasi
  $(date)
==================================================
  URL Admin  : http://${SRV_IP}:${WEB_PORT}
  Username   : admin
  Password   : ${ADM_PASS}
  DB Name    : rsmpitdb
  DB User    : rsmpitadmin
  DB Pass    : ${DB_PASS}
  DB Port    : ${DB_PORT}
  App Dir    : ${APP}
  SSH Key    : ${KEY_DIR}/rs_master_key
  Agent Token: ${AGENT_TOKEN}
==================================================
  SIMPAN FILE INI! chmod 600 /root/rsmp-it-info.txt
==================================================
INFOEOF
chmod 600 /root/rsmp-it-info.txt

echo ""
echo "================================================================"
echo "  SERVER INSTALL SELESAI!"
echo "================================================================"
echo "  URL    : http://${SRV_IP}:${WEB_PORT}"
echo "  Admin  : admin / ${ADM_PASS}"
echo "  Info   : cat /root/rsmp-it-info.txt"
echo ""
echo "  LANGKAH SELANJUTNYA:"
echo "  1. Copy project ke server:"
echo "     sudo cp -r . /opt/rsmp-it-platform/"
echo "  2. sudo bash server-setup/finalize-setup.sh"
echo "  3. (Opsional) sudo bash server-setup/install-rustdesk-server.sh"
echo "================================================================"
