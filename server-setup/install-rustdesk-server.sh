#!/bin/bash
# RSMP-IT install-rustdesk-server.sh v5.0
# Hardcode URL, tidak check GitHub API (yang sering timeout)
set -euo pipefail
[ "$EUID" -ne 0 ] && { echo "Harus sudo!"; exit 1; }
G='\033[0;32m' Y='\033[1;33m' R='\033[0;31m' NC='\033[0m'
ok()   { echo -e "${G}[OK]${NC}  $1"; }
info() { echo -e "${Y}[..]${NC}  $1"; }
warn() { echo -e "${Y}[!]${NC}   $1"; }

DATA=/var/lib/rustdesk-server; INST=/opt/rustdesk-server
mkdir -p "$DATA" "$INST" /var/log/rsmp-it-platform
DEF=$(ip -4 route get 8.8.8.8 2>/dev/null | awk '{print $7;exit}' || hostname -I | awk '{print $1}')
read -p "IP Server [$DEF]: " SIP; SIP="${SIP:-$DEF}"

info "Download RustDesk Server..."
DL=false; RDVER=1.1.12

for fname in \
  "rustdesk-server-linux-x86_64.zip" \
  "rustdesk-server-linux-amd64.zip"; do
  URL="https://github.com/rustdesk/rustdesk-server/releases/download/${RDVER}/${fname}"
  info "Coba: $URL"
  if wget -q --timeout=60 --tries=2 "$URL" -O /tmp/rdserver.zip 2>/dev/null && \
     [ -s /tmp/rdserver.zip ]; then
    unzip -o /tmp/rdserver.zip -d /tmp/rdext/ 2>/dev/null
    HBBS=$(find /tmp/rdext -name hbbs -type f | head -1)
    HBBR=$(find /tmp/rdext -name hbbr -type f | head -1)
    if [ -n "$HBBS" ] && [ -n "$HBBR" ]; then
      cp "$HBBS" "$INST/hbbs"; cp "$HBBR" "$INST/hbbr"
      chmod +x "$INST/hbbs" "$INST/hbbr"
      DL=true; ok "Binary OK dari ZIP"; break
    fi
    rm -rf /tmp/rdext /tmp/rdserver.zip
  fi
done

[ "$DL" = false ] && {
  warn "ZIP gagal, download binary langsung..."
  for arch in x86_64-unknown-linux-musl x86_64-linux-musl; do
    for bin in hbbs hbbr; do
      URL="https://github.com/rustdesk/rustdesk-server/releases/download/${RDVER}/${bin}-${arch}"
      wget -q --timeout=30 "$URL" -O "$INST/$bin" 2>/dev/null && \
        [ -s "$INST/$bin" ] && chmod +x "$INST/$bin" || true
    done
  done
  [ -f "$INST/hbbs" ] && [ -f "$INST/hbbr" ] && DL=true
}

[ "$DL" = false ] && {
  echo "GAGAL download. Manual download:"
  echo "1. Buka https://github.com/rustdesk/rustdesk-server/releases"
  echo "2. Copy hbbs & hbbr ke $INST/"
  echo "3. chmod +x $INST/hbbs $INST/hbbr"
  echo "4. Jalankan script ini lagi"
  exit 1
}

info "Generate key..."
cd "$DATA"
timeout 5 "$INST/hbbs" --key-only 2>/dev/null || { "$INST/hbbs" & sleep 4; kill $! 2>/dev/null || true; sleep 1; }
[ -f "$DATA/id_ed25519.pub" ] && ok "Key: $(cat $DATA/id_ed25519.pub)" || info "Key dibuat saat start"

cat > /etc/systemd/system/rustdesk-hbbs.service << EOF
[Unit]
Description=RustDesk hbbs (Signal)
After=network.target
[Service]
Type=simple
User=root
WorkingDirectory=${DATA}
ExecStart=${INST}/hbbs -r ${SIP}:21117 -k _
Restart=always
RestartSec=5
LimitNOFILE=1000000
StandardOutput=append:/var/log/rsmp-it-platform/rustdesk-hbbs.log
StandardError=append:/var/log/rsmp-it-platform/rustdesk-hbbs.log
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/rustdesk-hbbr.service << EOF
[Unit]
Description=RustDesk hbbr (Relay)
After=network.target
[Service]
Type=simple
User=root
WorkingDirectory=${DATA}
ExecStart=${INST}/hbbr -k _
Restart=always
RestartSec=5
LimitNOFILE=1000000
StandardOutput=append:/var/log/rsmp-it-platform/rustdesk-hbbr.log
StandardError=append:/var/log/rsmp-it-platform/rustdesk-hbbr.log
[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now rustdesk-hbbs rustdesk-hbbr
sleep 3

PUB=$(cat "$DATA/id_ed25519.pub" 2>/dev/null || echo "")
ENV=/opt/rsmp-it-platform/backend/.env
if [ -f "$ENV" ]; then
  DB=$(grep ^DB_NAME "$ENV" | cut -d= -f2 | tr -d ' ')
  DBU=$(grep ^DB_USER "$ENV" | cut -d= -f2 | tr -d ' ')
  DBP=$(grep ^DB_PASS "$ENV" | cut -d= -f2 | tr -d ' ')
  mysql -u "$DBU" -p"$DBP" "$DB" -e \
    "INSERT INTO system_config (\`key\`,value) VALUES
       ('rustdesk_host','${SIP}'),('rustdesk_port','21116'),
       ('rustdesk_relay','${SIP}:21117'),('rustdesk_pubkey','${PUB}')
     ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=NOW();" \
    2>/dev/null || true
fi

echo ""
echo "=== RustDesk Server SELESAI ==="
echo "  ID Server  : $SIP"
echo "  Relay      : $SIP:21117"
echo "  Public Key : $PUB"
