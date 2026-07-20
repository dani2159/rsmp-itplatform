#!/bin/bash
# ================================================================
#  RSMP-IT — 01_install_apps.sh v5.0
#  Install semua aplikasi client Linux Mint XFCE
#  Robust: retry, fallback, pip upgrade dulu
# ================================================================
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export PIP_BREAK_SYSTEM_PACKAGES=1

R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' NC='\033[0m'
ok()   { echo -e "${G}[OK]${NC}  $1"; }
info() { echo -e "${Y}[..]${NC}  $1"; }
warn() { echo -e "${Y}[!]${NC}   $1"; }

[ "$EUID" -ne 0 ] && { echo "Harus sudo!"; exit 1; }
LOG=/var/log/rsmp-install-apps.log
mkdir -p /var/log
exec > >(tee -a "$LOG") 2>&1

echo "================================================================"
echo "  RSMP-IT Install Apps v5.0 — $(date)"
echo "================================================================"

# Bersihkan lock
for f in /var/lib/dpkg/lock /var/lib/dpkg/lock-frontend \
          /var/cache/apt/archives/lock; do
  rm -f "$f" 2>/dev/null || true
done
dpkg --configure -a 2>/dev/null || true

safe_apt() {
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q \
    -o Dpkg::Options::="--force-confdef" \
    -o Dpkg::Options::="--force-confold" \
    --fix-broken "$@" 2>&1 | tail -6 || warn "Ada package yang gagal install"
}

info "Update repos..."
apt-get update -qq 2>&1 | tail -3

info "Upgrade sistem..."
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -q \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold" 2>&1 | tail -5

# ── DEPENDENCIES ─────────────────────────────────────────────────
info "Install dependencies..."
safe_apt curl wget gnupg2 apt-transport-https ca-certificates \
         software-properties-common python3 python3-pip net-tools

# ── PIP UPGRADE (WAJIB DULU) ─────────────────────────────────────
info "Upgrade pip..."
python3 -m pip install --upgrade pip setuptools wheel -q 2>&1 | tail -3
python3 -m pip install psutil bcrypt requests -q 2>&1 | tail -3
ok "pip + Python packages OK"

# ── LIBREOFFICE ──────────────────────────────────────────────────
info "Install LibreOffice..."
add-apt-repository -y ppa:libreoffice/ppa 2>/dev/null || true
apt-get update -qq 2>/dev/null || true
safe_apt libreoffice libreoffice-l10n-id libreoffice-help-id
ok "LibreOffice OK"

# ── FIREFOX ──────────────────────────────────────────────────────
info "Install Firefox..."
snap remove firefox 2>/dev/null || true
install -d -m 0755 /etc/apt/keyrings

FF_OK=false
for i in 1 2 3; do
  wget -q --timeout=30 \
    https://packages.mozilla.org/apt/repo-signing-key.gpg \
    -O /etc/apt/keyrings/packages.mozilla.org.asc 2>/dev/null && \
  [ -s /etc/apt/keyrings/packages.mozilla.org.asc ] && { FF_OK=true; break; }
  sleep 5
done

if [ "$FF_OK" = true ]; then
  echo "deb [signed-by=/etc/apt/keyrings/packages.mozilla.org.asc] \
https://packages.mozilla.org/apt mozilla main" \
    > /etc/apt/sources.list.d/mozilla.list
  printf 'Package: *\nPin: origin packages.mozilla.org\nPin-Priority: 1000\n' \
    > /etc/apt/preferences.d/mozilla
  apt-get update -qq 2>/dev/null || true
  safe_apt firefox && ok "Firefox Mozilla OK" || safe_apt firefox-esr
else
  warn "Pakai firefox-esr (Mozilla key gagal download)"
  safe_apt firefox-esr
fi

# ── RUSTDESK ─────────────────────────────────────────────────────
info "Install RustDesk..."
RD_OK=false
for RDVER in "1.2.3" "1.2.2" "1.2.1"; do
  for FNAME in "rustdesk-${RDVER}-x86_64.deb" "rustdesk-${RDVER}-amd64.deb"; do
    URL="https://github.com/rustdesk/rustdesk/releases/download/${RDVER}/${FNAME}"
    if wget -q --timeout=60 --tries=2 "$URL" -O /tmp/rustdesk.deb 2>/dev/null && \
       [ -s /tmp/rustdesk.deb ]; then
      dpkg -i /tmp/rustdesk.deb 2>/dev/null || apt-get install -f -y -q 2>/dev/null
      rm -f /tmp/rustdesk.deb
      RD_OK=true; ok "RustDesk $RDVER OK"; break 2
    fi
  done
done
[ "$RD_OK" = false ] && warn "RustDesk gagal download — install manual nanti"

# ── ANYDESK ──────────────────────────────────────────────────────
info "Install AnyDesk..."
AD_OK=false
wget -qO- https://keys.anydesk.com/repos/DEB-GPG-KEY 2>/dev/null | \
  gpg --dearmor -o /etc/apt/keyrings/anydesk.gpg 2>/dev/null || true
if [ -s /etc/apt/keyrings/anydesk.gpg ]; then
  echo "deb [signed-by=/etc/apt/keyrings/anydesk.gpg] \
http://deb.anydesk.com/ all main" > /etc/apt/sources.list.d/anydesk.list
  apt-get update -qq 2>/dev/null || true
  safe_apt anydesk && AD_OK=true && ok "AnyDesk OK"
fi
[ "$AD_OK" = false ] && warn "AnyDesk gagal (opsional)"

# ── TIGERVNC ─────────────────────────────────────────────────────
info "Install TigerVNC..."
safe_apt tigervnc-standalone-server tigervnc-common \
         xfce4 xfce4-terminal dbus-x11 xfonts-base
ok "TigerVNC OK"

# ── PDF READER ───────────────────────────────────────────────────
safe_apt okular && ok "Okular (PDF) OK" || warn "Okular gagal"

# ── ARCHIVE TOOLS ────────────────────────────────────────────────
safe_apt p7zip-full p7zip-rar unrar-free file-roller zip unzip
ok "Archive tools OK"

# ── TOOLS LAIN ───────────────────────────────────────────────────
safe_apt remmina remmina-plugin-rdp openssh-server \
         printer-driver-all system-config-printer \
         xfce4-screenshooter timeshift unattended-upgrades
ok "Tools tambahan OK"

# ── CLEANUP ──────────────────────────────────────────────────────
apt-get autoremove -y -q 2>/dev/null || true
apt-get autoclean -q 2>/dev/null || true

echo ""
echo "================================================================"
echo "  INSTALL APPS SELESAI! — $(date)"
echo "  Log: $LOG"
echo ""
echo "  Selanjutnya:"
echo "  sudo bash 02_autoupdate.sh"
echo "  sudo bash 03_hardening.sh"
echo "================================================================"
