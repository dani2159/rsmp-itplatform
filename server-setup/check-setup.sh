#!/bin/bash
# RSMP-IT check-setup.sh v5.0
G='\033[0;32m' R='\033[0;31m' Y='\033[1;33m' NC='\033[0m'
ok()   { echo -e "  ${G}✓${NC} $1"; }
fail() { echo -e "  ${R}✗${NC} $1"; ERR=$((ERR+1)); }
warn() { echo -e "  ${Y}!${NC} $1"; }
ERR=0; APP=/opt/rsmp-it-platform; ENV="$APP/backend/.env"
echo "=== RSMP-IT Setup Check v5.0 ==="
echo ""
echo "[ SERVICES ]"
for s in mariadb redis-server nginx rsmp-it-backend rsmp-it-novnc; do
  systemctl is-active "$s" &>/dev/null && ok "$s" || fail "$s TIDAK RUNNING"
done
for s in rustdesk-hbbs rustdesk-hbbr; do
  systemctl is-active "$s" &>/dev/null && ok "$s" || warn "$s (opsional)"
done
echo ""
echo "[ FILES KRITIS ]"
for f in "$APP/backend/.env" "$APP/backend/src/index.js" \
          "$APP/keys/rs_master_key" "$APP/novnc-proxy.py" \
          "/etc/nginx/sites-enabled/rsmp-it"; do
  [ -f "$f" ] || [ -L "$f" ] && ok "$f" || fail "MISSING: $f"
done
echo ""
echo "[ .ENV VARIABLES ]"
if [ -f "$ENV" ]; then
  for v in DB_HOST DB_NAME DB_USER DB_PASS SESSION_SECRET \
            SSH_KEY_PATH SERVER_IP WEB_PORT; do
    val=$(grep "^${v}=" "$ENV" 2>/dev/null | cut -d= -f2)
    [ -n "$val" ] && ok "$v = ${val:0:25}..." || fail "$v KOSONG!"
  done
fi
echo ""
echo "[ DATABASE ]"
DB=$(grep ^DB_NAME "$ENV" 2>/dev/null | cut -d= -f2 | tr -d ' ')
DBU=$(grep ^DB_USER "$ENV" 2>/dev/null | cut -d= -f2 | tr -d ' ')
DBP=$(grep ^DB_PASS "$ENV" 2>/dev/null | cut -d= -f2 | tr -d ' ')
mysql -u "$DBU" -p"$DBP" "$DB" -e "SELECT COUNT(*) FROM users" &>/dev/null && \
  ok "DB $DB accessible" || fail "DB $DB tidak accessible"
echo ""
echo "[ API ]"
curl -sf http://127.0.0.1:3001/api/health >/dev/null 2>&1 && \
  ok "Backend :3001 OK" || fail "Backend tidak merespons di :3001"
WP=$(grep ^WEB_PORT "$ENV" 2>/dev/null | cut -d= -f2 || echo 8080)
curl -sf "http://127.0.0.1:${WP}/api/health" >/dev/null 2>&1 && \
  ok "Nginx :${WP} OK" || fail "Nginx proxy gagal"
echo ""
echo "[ PYTHON PACKAGES ]"
for p in bcrypt websockets psutil; do
  python3 -c "import $p" 2>/dev/null && ok "python3 $p" || fail "python3 $p MISSING"
done
echo ""
if [ $ERR -eq 0 ]; then
  IP=$(grep ^SERVER_IP "$ENV" 2>/dev/null | cut -d= -f2 || hostname -I | awk '{print $1}')
  echo -e "${G}✓ SEMUA OK! URL: http://${IP}:${WP}${NC}"
else
  echo -e "${R}✗ $ERR ERROR. Perbaiki lalu cek lagi.${NC}"
fi
