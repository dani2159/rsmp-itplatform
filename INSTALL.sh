#!/bin/bash
# ================================================================
#  RSMP-IT Platform — One Click Install v5.0
#  Jalankan: sudo bash INSTALL.sh
# ================================================================
G='\033[0;32m' C='\033[0;36m' R='\033[0;31m' NC='\033[0m'
[ "$EUID" -ne 0 ] && { echo -e "${R}Jalankan: sudo bash INSTALL.sh${NC}"; exit 1; }
SD="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP=/opt/rsmp-it-platform

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  RSMP-IT Platform v5.0 Installer    ║"
echo "╚══════════════════════════════════════╝"
echo ""

echo -e "${C}[1/4] Server Setup...${NC}"
bash "$SD/server-setup/install-server.sh"

echo -e "${C}[2/4] Copy Files...${NC}"
mkdir -p "$APP/scripts/agent"
cp -r "$SD/backend" "$APP/" 2>/dev/null || true
cp -r "$SD/frontend" "$APP/" 2>/dev/null || true
cp "$SD/server-setup/"*.sh "$APP/scripts/" 2>/dev/null || true
cp "$SD/server-setup/"*.py "$APP/" 2>/dev/null || true
cp "$SD/rs-agent/"* "$APP/scripts/agent/" 2>/dev/null || true
cp "$SD/rs-agent-windows/"* "$APP/scripts/agent/" 2>/dev/null || true
find "$APP/scripts" -name "*.sh" -exec chmod +x {} \; 2>/dev/null || true
find "$APP/scripts" -name "*.py" -exec chmod +x {} \; 2>/dev/null || true
echo -e "${G}Files copied${NC}"

echo -e "${C}[3/4] Finalize (npm install + build frontend)...${NC}"
bash "$SD/server-setup/finalize-setup.sh"

echo -e "${C}[4/4] RustDesk Server (opsional)...${NC}"
read -p "Install RustDesk self-hosted? (y/N): " RD
[[ "${RD,,}" == "y" ]] && bash "$SD/server-setup/install-rustdesk-server.sh"

echo ""
bash "$SD/server-setup/check-setup.sh"

ENV="$APP/backend/.env"
IP=$(grep ^SERVER_IP "$ENV" 2>/dev/null | cut -d= -f2 || hostname -I | awk '{print $1}')
WP=$(grep ^WEB_PORT "$ENV" 2>/dev/null | cut -d= -f2 || echo 8080)
echo ""
echo "╔══════════════════════════════════════╗"
echo "║        INSTALASI SELESAI!            ║"
echo "║  URL  : http://${IP}:${WP}"
echo "║  Info : cat /root/rsmp-it-info.txt  ║"
echo "╚══════════════════════════════════════╝"
