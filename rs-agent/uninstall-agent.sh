#!/bin/bash
# ================================================================
#  RSMP-IT — Linux Client Agent Uninstaller v5.0
#  Jalankan: sudo bash uninstall-agent.sh
#  Hapus user rsadmin juga: REMOVE_RSADMIN_USER=yes sudo bash uninstall-agent.sh
# ================================================================
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' NC='\033[0m'
ok()   { echo -e "${G}[OK]${NC}  $1"; }
info() { echo -e "${Y}[..]${NC}  $1"; }
warn() { echo -e "${Y}[!]${NC}   $1"; }
err()  { echo -e "${R}[!!]${NC}  $1"; exit 1; }

[ "$EUID" -ne 0 ] && err "Harus sudo!"

echo "================================================================"
echo "  RSMP-IT Agent Uninstaller v5.0 — $(date)"
echo "================================================================"

# Beritahu platform agar client hilang dari dashboard (sebelum config dihapus).
CONF=/etc/rsmp-agent.conf
[ -f "$CONF" ] || CONF=/etc/rs-agent.conf
if [ -f "$CONF" ]; then
  RS_SERVER=$(grep '^RS_SERVER=' "$CONF" | cut -d= -f2-)
  RS_CLIENT_ID=$(grep '^RS_CLIENT_ID=' "$CONF" | cut -d= -f2-)
  RS_AGENT_TOKEN=$(grep '^RS_AGENT_TOKEN=' "$CONF" | cut -d= -f2-)
  if [ -n "$RS_SERVER" ] && [ -n "$RS_CLIENT_ID" ]; then
    info "Hapus client dari dashboard platform..."
    if curl -sf --connect-timeout 8 -X POST "${RS_SERVER}/api/agent/unregister" \
         -H "Content-Type: application/json" \
         -H "X-Agent-Token: ${RS_AGENT_TOKEN}" \
         -d "{\"clientId\":${RS_CLIENT_ID}}" >/dev/null 2>&1; then
      ok "Client dihapus dari dashboard"
    else
      warn "Gagal hubungi platform, hapus manual dari halaman Clients"
    fi
  fi
fi

info "Stop & disable services..."
for s in rsmp-agent x11vnc rsmp-update.timer rsmp-update.service; do
  systemctl stop "$s" 2>/dev/null || true
  systemctl disable "$s" 2>/dev/null || true
done
ok "Services dihentikan"

info "Hapus unit files..."
rm -f /etc/systemd/system/rsmp-agent.service \
      /etc/systemd/system/x11vnc.service \
      /etc/systemd/system/rsmp-update.service \
      /etc/systemd/system/rsmp-update.timer
systemctl daemon-reload
ok "Unit files dihapus"

info "Hapus file agent & config..."
rm -rf /opt/rsmp-agent /etc/rsmp-agent
rm -f /etc/rsmp-agent.conf /etc/rs-agent.conf
rm -f /var/log/rsmp-agent.log /var/log/rsmp-agent-install.log /var/log/rsmp-update.log /var/log/rsmp-it-platform/x11vnc.log
rm -f /usr/local/bin/rsmp-do-update.sh
ok "File dihapus"

info "Hapus sudoers rsadmin..."
rm -f /etc/sudoers.d/rsmp-rsadmin
ok "Sudoers dihapus"

if [ "${REMOVE_RSADMIN_USER:-}" = "yes" ]; then
  if id rsadmin &>/dev/null; then
    info "Hapus user rsadmin (REMOVE_RSADMIN_USER=yes)..."
    pkill -u rsadmin 2>/dev/null || true
    sleep 1
    userdel -r rsadmin 2>/dev/null || warn "Gagal hapus user rsadmin sepenuhnya, cek manual"
    ok "User rsadmin dihapus"
  fi
else
  info "User rsadmin TIDAK dihapus (set REMOVE_RSADMIN_USER=yes kalau mau hapus juga)"
fi

echo ""
echo "================================================================"
echo "  AGENT UNINSTALLED"
echo "================================================================"
echo "  Catatan:"
echo "  - Rule ufw (22/tcp, 5901/tcp) TIDAK dihapus otomatis, cek: ufw status"
echo "  - Sleep/suspend mask TIDAK di-unmask otomatis, cek: systemctl list-unit-files | grep -E 'sleep|suspend'"
echo "================================================================"
