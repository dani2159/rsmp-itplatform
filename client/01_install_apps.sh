#!/bin/bash
# ============================================================
#  RSMP-IT — 01_install_apps.sh
#  Install aplikasi client Linux Mint / Xubuntu XFCE.
#  Pemakaian:
#    sudo bash 01_install_apps.sh                 # install SEMUA app
#    sudo bash 01_install_apps.sh libreoffice firefox rustdesk
#  App key: libreoffice firefox rustdesk anydesk pdf archive extras
#  (desktop XFCE + dependencies dasar SELALU dipasang.)
# ============================================================
set -e
export DEBIAN_FRONTEND=noninteractive

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

[ "$EUID" -ne 0 ] && err "Jalankan dengan sudo!"
LOG="/var/log/rsmp-install-apps.log"
exec > >(tee -a "$LOG") 2>&1

# Daftar app yang diminta. Kosong = semua.
ALL_APPS="libreoffice firefox rustdesk anydesk pdf foxit archive printer media extras"
SELECTED="$*"
[ -z "$SELECTED" ] && SELECTED="$ALL_APPS"
want() { echo " $SELECTED " | grep -q " $1 "; }

# Tunggu apt/dpkg lock lepas (Mint Update / aptdaemon sering pegang di background).
wait_apt() {
  for i in $(seq 1 60); do
    fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock \
          /var/lib/apt/lists/lock >/dev/null 2>&1 || return 0
    [ "$i" = 1 ] && info "Menunggu apt lock lepas..."
    sleep 5
  done
  info "apt lock masih terpakai >5 menit, hentikan updater background..."
  systemctl stop unattended-upgrades 2>/dev/null || true
  pkill -f aptd 2>/dev/null || true
  sleep 3
}

echo "======================================"
echo " RSMP Install Apps — $(date)"
echo " Dipilih: $SELECTED"
echo "======================================"

info "Update sistem..."
wait_apt
apt-get update -qq
apt-get upgrade -y -qq \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold"
ok "Sistem updated"

info "Install dependencies dasar..."
wait_apt
apt-get install -y -qq \
  curl wget gnupg2 apt-transport-https \
  software-properties-common ca-certificates \
  gdebi-core python3 python3-pip net-tools
ok "Dependencies installed"

# ── Desktop XFCE (SELALU — untuk x11vnc share display :0) ──
# VNC server-nya (x11vnc) dipasang install-agent.sh, bukan di sini.
info "Install desktop XFCE..."
wait_apt
apt-get install -y -qq xfce4 xfce4-terminal dbus-x11 xfonts-base openssh-server
ok "Desktop XFCE installed"

# ── LibreOffice ──────────────────────────────────
if want libreoffice; then
  info "Install LibreOffice..."
  wait_apt
  add-apt-repository -y ppa:libreoffice/ppa 2>/dev/null || true
  apt-get update -qq
  apt-get install -y -qq libreoffice libreoffice-l10n-id libreoffice-help-id
  ok "LibreOffice installed"
fi

# ── Firefox ──────────────────────────────────────
if want firefox; then
  info "Install Firefox (resmi Mozilla)..."
  snap remove firefox 2>/dev/null || true
  install -d -m 0755 /etc/apt/keyrings
  wget -q https://packages.mozilla.org/apt/repo-signing-key.gpg \
    -O /etc/apt/keyrings/packages.mozilla.org.asc 2>/dev/null || true
  echo "deb [signed-by=/etc/apt/keyrings/packages.mozilla.org.asc] \
    https://packages.mozilla.org/apt mozilla main" \
    > /etc/apt/sources.list.d/mozilla.list
  echo 'Package: *
Pin: origin packages.mozilla.org
Pin-Priority: 1000' > /etc/apt/preferences.d/mozilla
  wait_apt
  apt-get update -qq
  apt-get install -y -qq firefox || apt-get install -y -qq firefox-esr
  ok "Firefox installed"
fi

# ── RustDesk ─────────────────────────────────────
if want rustdesk; then
  info "Install RustDesk..."
  RDVER=$(curl -s https://api.github.com/repos/rustdesk/rustdesk/releases/latest \
    | grep '"tag_name"' | sed 's/.*"v\?\([^"]*\)".*/\1/' | head -1 || echo "1.2.3")
  wget -q "https://github.com/rustdesk/rustdesk/releases/latest/download/rustdesk-${RDVER}-x86_64.deb" \
    -O /tmp/rustdesk.deb 2>/dev/null || true
  if [ -s /tmp/rustdesk.deb ]; then
    dpkg -i /tmp/rustdesk.deb 2>/dev/null || apt-get install -f -y -qq
    ok "RustDesk installed"
  else
    echo "[WARN] RustDesk download gagal, skip"
  fi
fi

# ── AnyDesk ──────────────────────────────────────
if want anydesk; then
  info "Install AnyDesk..."
  install -d -m 0755 /etc/apt/keyrings
  wget -qO - https://keys.anydesk.com/repos/DEB-GPG-KEY \
    | gpg --dearmor -o /etc/apt/keyrings/anydesk.gpg 2>/dev/null || true
  echo "deb [signed-by=/etc/apt/keyrings/anydesk.gpg] \
    http://deb.anydesk.com/ all main" \
    > /etc/apt/sources.list.d/anydesk.list
  wait_apt
  apt-get update -qq
  apt-get install -y -qq anydesk || echo "[WARN] AnyDesk skip"
  ok "AnyDesk installed (atau skip)"
fi

# ── PDF Reader ────────────────────────────────────
if want pdf; then
  info "Install PDF Reader (Okular)..."
  wait_apt
  apt-get install -y -qq okular || true
  ok "PDF Reader installed"
fi

# ── Foxit PDF Reader (best-effort, installer InstallBuilder silent) ──
if want foxit; then
  info "Install Foxit PDF Reader (best-effort)..."
  ( set +e
    URL="https://cdn01.foxitsoftware.com/pub/foxit/reader/desktop/linux/2.x/2.4/en_us/FoxitReader.enu.setup.2.4.4.0911(r057d814).x64.run.tar.gz"
    cd /tmp
    if wget -q --timeout=90 -O foxit.tar.gz "$URL"; then
      tar xzf foxit.tar.gz 2>/dev/null
      RUN=$(ls FoxitReader*.run 2>/dev/null | head -1)
      if [ -n "$RUN" ]; then
        chmod +x "$RUN"
        # InstallBuilder mendukung mode unattended (silent, tanpa GUI).
        "./$RUN" --mode unattended --prefix /opt/foxitreader </dev/null >/dev/null 2>&1
        if [ -x /opt/foxitreader/FoxitReader ]; then
          ln -sf /opt/foxitreader/FoxitReader /usr/local/bin/foxitreader
          echo "[OK] Foxit terpasang di /opt/foxitreader"
        else
          echo "[WARN] Foxit gagal install (installer tidak silent), skip"
        fi
      else
        echo "[WARN] File installer Foxit tidak ditemukan, skip"
      fi
    else
      echo "[WARN] Download Foxit gagal (URL/jaringan), skip"
    fi
    rm -f /tmp/foxit.tar.gz /tmp/FoxitReader*.run
  )
  ok "Foxit selesai (atau di-skip)"
fi

# ── Archive tools ─────────────────────────────────
if want archive; then
  info "Install archive tools..."
  wait_apt
  apt-get install -y -qq \
    p7zip-full p7zip-rar unrar-free file-roller zip unzip
  ok "Archive tools installed"
fi

# ── Printer & scanner ─────────────────────────────
if want printer; then
  info "Install printer & scanner..."
  wait_apt
  apt-get install -y -qq \
    printer-driver-all system-config-printer cups \
    simple-scan sane-utils
  ok "Printer & scanner installed"
fi

# ── Media player ──────────────────────────────────
if want media; then
  info "Install VLC media player..."
  wait_apt
  apt-get install -y -qq vlc
  ok "VLC installed"
fi

# ── Tools tambahan ────────────────────────────────
if want extras; then
  info "Install tools tambahan..."
  wait_apt
  apt-get install -y -qq \
    xfce4-screenshooter timeshift gdebi \
    htop neofetch gparted
  ok "Tools tambahan installed"
fi

# ── Cleanup ────────────────────────────────────────
apt-get autoremove -y -qq
apt-get autoclean -qq
rm -f /tmp/rustdesk.deb /tmp/anydesk.deb

echo ""
echo "======================================"
echo " INSTALL APPS SELESAI — $(date)"
echo " Log: $LOG"
echo " Lanjut: sudo bash 02_autoupdate.sh"
echo "======================================"
