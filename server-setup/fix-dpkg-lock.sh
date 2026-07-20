#!/bin/bash
# ================================================================
#  RSMP-IT — fix-dpkg-lock.sh v5.0
#  JALANKAN DULU jika ada error dpkg/debconf lock
#  Kemudian jalankan install-server.sh lagi
# ================================================================
[ "$EUID" -ne 0 ] && { echo "Harus sudo!"; exit 1; }

G='\033[0;32m' Y='\033[1;33m' NC='\033[0m'
ok()   { echo -e "${G}[OK]${NC}  $1"; }
info() { echo -e "${Y}[..]${NC}  $1"; }

echo "=== Fix DPKG/Debconf Lock v5.0 — $(date) ==="

info "Matikan proses yang bisa bikin lock..."
systemctl stop unattended-upgrades 2>/dev/null || true
systemctl stop apt-daily.service apt-daily-upgrade.service 2>/dev/null || true
systemctl stop apt-daily.timer apt-daily-upgrade.timer 2>/dev/null || true
systemctl mask apt-daily.service apt-daily-upgrade.service 2>/dev/null || true
pkill -9 -f "unattended-upgrade" 2>/dev/null || true
# Match against process name only (no -f) so this doesn't match its own
# invocation path (this script's filename contains "dpkg"/"apt-get" would too).
pkill -9 apt-get 2>/dev/null || true
pkill -9 dpkg 2>/dev/null || true
sleep 3
ok "Proses dihentikan"

info "Hapus lock files..."
for f in \
  /var/lib/dpkg/lock \
  /var/lib/dpkg/lock-frontend \
  /var/cache/apt/archives/lock \
  /var/cache/debconf/config.dat.lock \
  /var/lib/apt/lists/lock; do
  if [ -e "$f" ]; then
    rm -f "$f"
    echo "  Dihapus: $f"
  fi
done
ok "Lock files dihapus"

info "Perbaiki dpkg..."
dpkg --configure -a 2>&1 | tail -10
ok "dpkg --configure -a selesai"

info "Fix broken packages..."
DEBIAN_FRONTEND=noninteractive apt-get install -f -y -q \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold" 2>&1 | tail -10
ok "Fix broken selesai"

info "Reconfigure ssl-cert (sering jadi masalah PostgreSQL)..."
DEBIAN_FRONTEND=noninteractive dpkg --configure ssl-cert 2>/dev/null || true
DEBIAN_FRONTEND=noninteractive apt-get install -y -q ssl-cert 2>&1 | tail -5 || true
ok "ssl-cert OK"

echo ""
echo "================================================================"
echo "  DPKG LOCK SUDAH DIBERSIHKAN!"
echo "  Sekarang jalankan: sudo bash install-server.sh"
echo "================================================================"
