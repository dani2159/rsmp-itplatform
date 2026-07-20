#!/bin/bash
# ================================================================
#  RSMP-IT — finalize-setup.sh v5.0
#  Copy files, npm install, build frontend, start services
# ================================================================
export DEBIAN_FRONTEND=noninteractive
export PIP_BREAK_SYSTEM_PACKAGES=1
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' C='\033[0;36m' NC='\033[0m'
ok()    { echo -e "${G}[OK]${NC}  $1"; }
info()  { echo -e "${Y}[..]${NC}  $1"; }
warn()  { echo -e "${Y}[!]${NC}   $1"; }
err()   { echo -e "${R}[!!]${NC}  $1"; exit 1; }
title() { echo -e "\n${C}━━━ $1 ━━━${NC}"; }

[ "$EUID" -ne 0 ] && err "Harus sudo"

APP=/opt/rsmp-it-platform
PROJ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG=/var/log/rsmp-it-platform/finalize.log
mkdir -p /var/log/rsmp-it-platform
exec > >(tee -a "$LOG") 2>&1

echo "================================================================"
echo "  RSMP-IT Finalize v5.0 — $(date)"
echo "  Project: $PROJ"
echo "================================================================"

[ ! -f "$APP/backend/.env" ] && err ".env tidak ada! Jalankan install-server.sh dulu"

DB=$(grep ^DB_NAME "$APP/backend/.env" | cut -d= -f2 | tr -d ' ')
DBU=$(grep ^DB_USER "$APP/backend/.env" | cut -d= -f2 | tr -d ' ')
SIP=$(grep ^SERVER_IP "$APP/backend/.env" | cut -d= -f2 | tr -d ' ')
WP=$(grep ^WEB_PORT "$APP/backend/.env" | cut -d= -f2 | tr -d ' ')
info "DB=$DB user=$DBU server=$SIP:$WP"

title "COPY BACKEND"
if [ -d "$PROJ/backend/src" ]; then
  mkdir -p "$APP/backend/src"
  cp -r "$PROJ/backend/src/"* "$APP/backend/src/" 2>/dev/null || true
  [ -f "$PROJ/backend/package.json" ] && \
    cp "$PROJ/backend/package.json" "$APP/backend/"
  ok "Backend source copied"
else
  warn "Backend src tidak ditemukan di $PROJ/backend/src"
fi

title "COPY FRONTEND"
if [ -d "$PROJ/frontend/src" ]; then
  mkdir -p "$APP/frontend"
  cp -r "$PROJ/frontend/"* "$APP/frontend/" 2>/dev/null || true
  ok "Frontend source copied"
else
  warn "Frontend tidak ditemukan"
fi

title "COPY SCRIPTS"
mkdir -p "$APP/scripts/agent"
for f in 01_install_apps.sh 02_autoupdate.sh 03_hardening.sh \
          04_build_iso.sh install-rustdesk-server.sh \
          fix-dpkg-lock.sh check-setup.sh migrate-db.sh; do
  # Script deploy client (01/02/03) hidup di client/ (sumber utama);
  # sisanya (04, util) di server-setup/. client/ menang bila ada.
  src="$PROJ/client/$f"; [ -f "$src" ] || src="$PROJ/server-setup/$f"
  [ -f "$src" ] && { cp "$src" "$APP/scripts/$f"; chmod +x "$APP/scripts/$f"; ok "$f"; }
done

for f in novnc-proxy.py; do
  src="$PROJ/server-setup/$f"
  [ -f "$src" ] && { cp "$src" "$APP/$f"; chmod +x "$APP/$f"; ok "$f"; }
done

for f in rsmp-agent.py install-agent.sh uninstall-agent.sh; do
  src="$PROJ/rs-agent/$f"
  [ -f "$src" ] && { cp "$src" "$APP/scripts/agent/$f"; chmod +x "$APP/scripts/agent/$f"; ok "agent/$f"; }
done

mkdir -p "$APP/scripts/agent-windows"
for f in rs-agent.ps1 install-agent-windows.bat uninstall-agent-windows.bat; do
  src="$PROJ/rs-agent-windows/$f"
  [ -f "$src" ] && { cp "$src" "$APP/scripts/agent-windows/$f"; ok "agent-windows/$f"; }
done

title "UPGRADE PIP & PYTHON PACKAGES"
python3 -m pip install --upgrade pip setuptools wheel -q 2>&1 | tail -3
python3 -m pip install bcrypt websockets psutil requests -q 2>&1 | tail -3
ok "Python packages OK"

title "NPM INSTALL BACKEND"
[ ! -f "$APP/backend/package.json" ] && err "package.json tidak ada!"
cd "$APP/backend"
npm install --production 2>&1 | tail -15
node -e "require('bcrypt')" 2>/dev/null || npm install bcrypt 2>&1 | tail -5
ok "Node deps OK"

title "VERIFY DB CONNECTION"
DBP=$(grep ^DB_PASS "$APP/backend/.env" | cut -d= -f2 | tr -d ' ')
mysql -u "$DBU" -p"$DBP" "$DB" -e "SELECT 1" &>/dev/null && \
  ok "DB connection OK" || warn "DB connection gagal, cek .env"

title "BUILD FRONTEND"
if [ -d "$APP/frontend" ] && [ -f "$APP/frontend/package.json" ]; then
  cd "$APP/frontend"
  npm install 2>&1 | tail -15
  npm run build 2>&1 | tail -20
  ok "Frontend built → $APP/frontend/dist"
else
  warn "Frontend tidak ada, skip build"
fi

title "PERMISSIONS"
chown -R www-data:www-data "$APP" 2>/dev/null || true
chmod -R 755 "$APP"
chmod 600 "$APP/keys/rs_master_key" 2>/dev/null || true
chmod 600 "$APP/backend/.env"
chown www-data:www-data "$APP/backend/.env" "$APP/keys/rs_master_key" 2>/dev/null || true
chown -R www-data:www-data /var/log/rsmp-it-platform
ok "Permissions OK"

title "SUDOERS ISO BUILDER"
# ISO remaster (mount/chroot/apt-get) butuh root; backend jalan sebagai
# www-data. Izinkan HANYA script 04_build_iso.sh ini persis, bukan shell bebas.
cat > /etc/sudoers.d/rsmp-iso-builder << SUDOEOF
www-data ALL=(root) NOPASSWD:SETENV: /usr/bin/bash $APP/scripts/04_build_iso.sh, /bin/bash $APP/scripts/04_build_iso.sh
SUDOEOF
chmod 440 /etc/sudoers.d/rsmp-iso-builder
visudo -c -f /etc/sudoers.d/rsmp-iso-builder 2>/dev/null && ok "Sudoers ISO builder OK" || \
  { rm -f /etc/sudoers.d/rsmp-iso-builder; warn "Sudoers ISO builder invalid, dilewati"; }

title "SUDOERS RUSTDESK RESTART"
# Sama alasan: dashboard "Restart RustDesk" jalan systemctl sebagai
# www-data, butuh root. Rule sempit -- cuma restart hbbs/hbbr.
cat > /etc/sudoers.d/rsmp-rustdesk << 'SUDOEOF'
www-data ALL=(root) NOPASSWD: /usr/bin/systemctl restart rustdesk-hbbs, /usr/bin/systemctl restart rustdesk-hbbr, /bin/systemctl restart rustdesk-hbbs, /bin/systemctl restart rustdesk-hbbr
SUDOEOF
chmod 440 /etc/sudoers.d/rsmp-rustdesk
visudo -c -f /etc/sudoers.d/rsmp-rustdesk 2>/dev/null && ok "Sudoers RustDesk OK" || \
  { rm -f /etc/sudoers.d/rsmp-rustdesk; warn "Sudoers RustDesk invalid, dilewati"; }

title "FIX NGINX MAP DIRECTIVE"
if ! grep -q "connection_upgrade" /etc/nginx/nginx.conf 2>/dev/null; then
  sed -i '/^http {/a\\    map $http_upgrade $connection_upgrade {\n        default upgrade;\n        '"''"' close;\n    }' \
    /etc/nginx/nginx.conf 2>/dev/null || true
fi
nginx -t 2>&1 && systemctl reload nginx && ok "Nginx OK" || warn "Nginx cek: nginx -t"

title "START SERVICES"
systemctl daemon-reload
for svc in rsmp-it-backend rsmp-it-novnc; do
  systemctl restart "$svc" 2>/dev/null || true
  sleep 3
  systemctl is-active "$svc" &>/dev/null && ok "$svc running" || \
    warn "$svc gagal — cek: journalctl -eu $svc -n 30"
done

title "TEST API"
sleep 3
for i in 1 2 3 4 5; do
  curl -sf http://127.0.0.1:3001/api/health >/dev/null 2>&1 && \
    { ok "Backend API merespons"; break; } || { info "Tunggu... ($i/5)"; sleep 4; }
done
curl -sf "http://127.0.0.1:${WP}/api/health" >/dev/null 2>&1 && \
  ok "Nginx proxy OK di :${WP}" || warn "Nginx proxy belum merespons"

echo ""
echo "================================================================"
echo "  SELESAI! Buka: http://${SIP}:${WP}"
echo "  Login: admin / (lihat /root/rsmp-it-info.txt)"
echo ""
echo "  Status:"
for s in rsmp-it-backend rsmp-it-novnc mariadb redis-server nginx; do
  st=$(systemctl is-active "$s" 2>/dev/null || echo inactive)
  [ "$st" = active ] && printf "  ${G}✓${NC} %s\n" "$s" || \
    printf "  ${R}✗${NC} %s (%s)\n" "$s" "$st"
done
echo "================================================================"
