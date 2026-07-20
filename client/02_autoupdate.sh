#!/bin/bash
# ============================================================
#  RSMP-IT — 02_autoupdate.sh
#  Setup auto-update silent jam 02:00, tanpa notif, tanpa restart
# ============================================================
set -e
export DEBIAN_FRONTEND=noninteractive
[ "$EUID" -ne 0 ] && { echo "Jalankan dengan sudo!"; exit 1; }
LOG="/var/log/rsmp-autoupdate-setup.log"
exec > >(tee -a "$LOG") 2>&1
echo "======================================"
echo " RSMP Auto-Update Setup — $(date)"
echo "======================================"

apt-get install -y -qq unattended-upgrades apt-listchanges

cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}";
    "${distro_id}:${distro_codename}-security";
    "${distro_id}:${distro_codename}-updates";
    "${distro_id}:${distro_codename}-backports";
    "Mozilla:mozilla";
};
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Remove-New-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Automatic-Reboot-WithUsers "false";
Unattended-Upgrade::Mail "";
Unattended-Upgrade::MailOnlyOnError "false";
Acquire::http::Dl-Limit "1024";
EOF

cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF

# Update terjadwal jam 02:00 (rsmp-update.timer + rsmp-do-update.sh)
# SUDAH dibuat install-agent.sh -- tidak diulang di sini biar tidak double.
# Script ini fokus ke unattended-upgrades (auto security update apt native),
# yang tidak dipasang agent, sebagai pelengkap.

# Nonaktifkan needrestart prompt
[ -f /etc/needrestart/needrestart.conf ] && \
  sed -i "s/^#\?\\\$nrconf{restart}.*$/\\\$nrconf{restart} = 'a';/" \
    /etc/needrestart/needrestart.conf 2>/dev/null || true

# Sembunyikan Update Manager Mint
cat > /etc/xdg/autostart/mintupdate.desktop << 'EOF'
[Desktop Entry]
Hidden=true
NoDisplay=true
X-GNOME-Autostart-enabled=false
Name=Update Manager
Type=Application
EOF

echo ""
echo "======================================"
echo " AUTO-UPDATE SETUP SELESAI"
echo " unattended-upgrades aktif (auto security update)"
echo " Update terjadwal 02:00 WIB dikelola agent (rsmp-update.timer)"
echo " Lanjut: sudo bash 03_hardening.sh"
echo "======================================"
