#!/bin/bash
# ============================================================
#  RSMP-IT — 03_hardening.sh
#  Hardening: matikan sleep, lock screen, setup VNC, firewall
# ============================================================
set -e
export DEBIAN_FRONTEND=noninteractive
[ "$EUID" -ne 0 ] && { echo "Jalankan dengan sudo!"; exit 1; }

REAL_USER="${SUDO_USER:-$(logname 2>/dev/null || echo rsadmin)}"
REAL_HOME=$(getent passwd "$REAL_USER" | cut -d: -f6 2>/dev/null || echo "/home/$REAL_USER")
LOG="/var/log/rsmp-hardening.log"
exec > >(tee -a "$LOG") 2>&1

echo "======================================"
echo " RSMP Hardening — $(date)"
echo " User: $REAL_USER ($REAL_HOME)"
echo "======================================"

# ── 1. Matikan sleep/hibernate ────────────────────
echo "[INFO] Matikan sleep/hibernate..."
systemctl mask sleep.target suspend.target hibernate.target \
  hybrid-sleep.target 2>/dev/null || true

# Logind config
cat >> /etc/systemd/logind.conf << 'EOF'
HandleSuspendKey=ignore
HandleHibernateKey=ignore
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
IdleAction=ignore
EOF
systemctl restart systemd-logind 2>/dev/null || true
echo "[OK] Sleep dinonaktifkan"

# ── 2. Screensaver/lock screen (XFCE) ────────────
echo "[INFO] Nonaktifkan screensaver..."
mkdir -p "$REAL_HOME/.config/xfce4/xfconf/xfce-perchannel-xml"

cat > "$REAL_HOME/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-screensaver.xml" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfce4-screensaver" version="1.0">
  <property name="saver" type="empty">
    <property name="enabled" type="bool" value="false"/>
    <property name="mode" type="int" value="0"/>
  </property>
  <property name="lock" type="empty">
    <property name="enabled" type="bool" value="false"/>
  </property>
</channel>
EOF

cat > "$REAL_HOME/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-power-manager.xml" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfce4-power-manager" version="1.0">
  <property name="xfce4-power-manager" type="empty">
    <property name="dpms-enabled" type="bool" value="false"/>
    <property name="blank-on-ac" type="int" value="0"/>
    <property name="dpms-on-ac-sleep" type="uint" value="0"/>
    <property name="dpms-on-ac-off" type="uint" value="0"/>
    <property name="inactivity-on-ac" type="uint" value="0"/>
    <property name="presentation-mode" type="bool" value="true"/>
  </property>
</channel>
EOF

cat > "$REAL_HOME/.xscreensaver" << 'EOF'
mode: off
lock: False
timeout: 0
EOF

chown -R "$REAL_USER:$REAL_USER" "$REAL_HOME/.config" "$REAL_HOME/.xscreensaver" 2>/dev/null || true
echo "[OK] Screensaver dinonaktifkan"

# ── 3. Autostart cleanup ──────────────────────────
# Matikan popup mengganggu: welcome/update Mint + update-notifier Xubuntu.
mkdir -p "$REAL_HOME/.config/autostart"
for desktop in mintupdate mintwelcome mintreport \
               update-notifier update-manager ubuntu-release-upgrader \
               org.gnome.Software-mint; do
  cat > "$REAL_HOME/.config/autostart/${desktop}.desktop" << DEOF
[Desktop Entry]
Hidden=true
NoDisplay=true
X-GNOME-Autostart-enabled=false
Name=${desktop}
Type=Application
DEOF
done
# Autostart: matikan blank/DPMS X tiap login (persist antar-reboot).
cat > "$REAL_HOME/.config/autostart/rsmp-nosleep.desktop" << 'DEOF'
[Desktop Entry]
Type=Application
Name=RSMP No Sleep
Exec=sh -c "xset s off -dpms"
X-GNOME-Autostart-enabled=true
DEOF
chown -R "$REAL_USER:$REAL_USER" "$REAL_HOME/.config/autostart" 2>/dev/null || true

# Matikan notif update Xubuntu/Ubuntu (update-notifier) via gsettings user.
sudo -u "$REAL_USER" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u "$REAL_USER")/bus" \
  gsettings set com.ubuntu.update-notifier no-show-notifications true 2>/dev/null || true

# Matikan popup XFCE "monitor baru terhubung" (Xubuntu + Mint XFCE).
# xfsettingsd baca properti /Notify di channel displays; false = tanpa popup.
cat > "$REAL_HOME/.config/xfce4/xfconf/xfce-perchannel-xml/displays.xml" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<channel name="displays" version="1.0">
  <property name="Notify" type="bool" value="false"/>
</channel>
EOF
chown "$REAL_USER:$REAL_USER" "$REAL_HOME/.config/xfce4/xfconf/xfce-perchannel-xml/displays.xml" 2>/dev/null || true

# File XML di atas bisa ke-overwrite xfsettingsd (cache di memory) saat logout.
# Terapkan LANGSUNG ke daemon xfconf sesi aktif -> efek seketika + persist.
RUID=$(id -u "$REAL_USER" 2>/dev/null || echo 1000)
xq() {
  sudo -u "$REAL_USER" \
    DISPLAY=:0 \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$RUID/bus" \
    xfconf-query "$@" 2>/dev/null || true
}
# Popup "monitor baru terhubung" OFF
xq -c displays -p /Notify -n -t bool -s false
# Power manager: jangan pernah blank/DPMS/sleep (PC harus tetap nyala)
xq -c xfce4-power-manager -p /xfce4-power-manager/dpms-enabled       -n -t bool -s false
xq -c xfce4-power-manager -p /xfce4-power-manager/blank-on-ac        -n -t int  -s 0
xq -c xfce4-power-manager -p /xfce4-power-manager/dpms-on-ac-sleep   -n -t uint -s 0
xq -c xfce4-power-manager -p /xfce4-power-manager/dpms-on-ac-off     -n -t uint -s 0
xq -c xfce4-power-manager -p /xfce4-power-manager/inactivity-on-ac   -n -t uint -s 0
xq -c xfce4-power-manager -p /xfce4-power-manager/presentation-mode  -n -t bool -s true
# Screensaver & lock OFF
xq -c xfce4-screensaver -p /saver/enabled -n -t bool -s false
xq -c xfce4-screensaver -p /lock/enabled  -n -t bool -s false
# Matikan blank & DPMS X seketika (sesi berjalan)
sudo -u "$REAL_USER" DISPLAY=:0 xset s off -dpms 2>/dev/null || true
echo "[OK] Notif monitor & autosleep dimatikan (live + persist)"

# ── 4. Firewall UFW ───────────────────────────────
echo "[INFO] Konfigurasi firewall..."
apt-get install -y -qq ufw
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment 'SSH'
ufw allow 5901/tcp  comment 'VNC'
ufw allow 7070/tcp  comment 'RustDesk'
ufw allow 21115:21119/tcp comment 'RustDesk Server'
ufw allow 80/tcp    comment 'HTTP'
ufw allow 443/tcp   comment 'HTTPS'
ufw --force enable
echo "[OK] Firewall aktif"

# ── 5. VNC & SSH ──────────────────────────────────
# SENGAJA TIDAK di-setup di sini. install-agent.sh sudah pasang:
#   - VNC via x11vnc (share display :0, port 5901)
#   - SSH server + master key rsadmin
# Dulu bagian ini install TigerVNC vncserver-rsmp@ -> rebutan port 5901
# dengan x11vnc agent (crash-loop). Dihapus supaya tidak double/konflik.

# ── 6. Optimasi XFCE ──────────────────────────────
mkdir -p "$REAL_HOME/.config/xfce4/xfconf/xfce-perchannel-xml"
cat > "$REAL_HOME/.config/xfce4/xfconf/xfce-perchannel-xml/xfwm4.xml" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfwm4" version="1.0">
  <property name="general" type="empty">
    <property name="use_compositing" type="bool" value="false"/>
    <property name="wrap_workspaces" type="bool" value="false"/>
    <property name="wrap_windows" type="bool" value="false"/>
  </property>
</channel>
EOF
chown -R "$REAL_USER:$REAL_USER" "$REAL_HOME/.config/xfce4" 2>/dev/null || true

echo ""
echo "======================================"
echo " HARDENING SELESAI — $(date)"
echo ""
echo " Status:"
systemctl is-active x11vnc 2>/dev/null | \
  xargs printf "  VNC (agent) : %s\n"
ufw status | head -2
echo ""
echo " Catatan: VNC & SSH dikelola install-agent.sh, bukan script ini."
echo " Log     : $LOG"
echo "======================================"
