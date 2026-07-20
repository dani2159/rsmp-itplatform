#!/bin/bash
# ================================================================
#  RSMP-IT — Linux Client Agent Installer v5.0
#  Fix semua error: pip, VNC PAM, user, sudoers
#  Jalankan: sudo bash install-agent.sh
#  Atau: RS_SERVER=http://192.168.1.10:8081 RS_AGENT_TOKEN=xxx sudo bash install-agent.sh
#  (Agent token dilihat di Settings > System, admin only)
# ================================================================
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
export PIP_BREAK_SYSTEM_PACKAGES=1

R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' NC='\033[0m'
ok()   { echo -e "${G}[OK]${NC}  $1"; }
info() { echo -e "${Y}[..]${NC}  $1"; }
warn() { echo -e "${Y}[!]${NC}   $1"; }
err()  { echo -e "${R}[!!]${NC}  $1"; exit 1; }

[ "$EUID" -ne 0 ] && err "Harus sudo!"

# ── INPUT ─────────────────────────────────────────────────────────
SERVER="${RS_SERVER:-}"
if [ -z "$SERVER" ]; then
  read -p "URL Server RSMP (contoh: http://192.168.1.10:8081): " SERVER
fi
[ -z "$SERVER" ] && SERVER="http://192.168.1.10:8081"

TOKEN="${RS_AGENT_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  read -p "Agent Token (lihat Settings > System di web admin): " TOKEN
fi

LOG=/var/log/rsmp-agent-install.log
mkdir -p /var/log
exec > >(tee -a "$LOG") 2>&1

RSADMIN_PASS="${RSADMIN_PASS:-$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | head -c16)}"
# Password VNC default sama untuk semua instalasi awal, dikirim ke server
# saat register biar web bisa auto-fill. Bisa diganti per-client nanti.
# Catatan: VNC classic auth (DES) cuma pakai 8 char pertama.
VNC_PASS="${VNC_PASS:-Rsmps@2025}"

echo "================================================================"
echo "  RSMP-IT Agent Installer v5.0 — $(date)"
echo "  Server: $SERVER"
echo "================================================================"

# ── BERSIHKAN LOCK ───────────────────────────────────────────────
info "Bersihkan lock dpkg..."
systemctl stop unattended-upgrades 2>/dev/null || true
for f in /var/lib/dpkg/lock /var/lib/dpkg/lock-frontend \
          /var/cache/apt/archives/lock /var/cache/debconf/config.dat.lock; do
  rm -f "$f" 2>/dev/null || true
done
dpkg --configure -a 2>&1 | tail -3 || true
ok "Lock OK"

# Fungsi apt robust
safe_apt() {
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q \
    -o Dpkg::Options::="--force-confdef" \
    -o Dpkg::Options::="--force-confold" \
    --fix-broken "$@" 2>&1 | tail -6 || warn "Beberapa package mungkin gagal"
}

# ── UPDATE ───────────────────────────────────────────────────────
info "Update repos..."
apt-get update -qq 2>&1 | tail -3

# ── INSTALL PACKAGES ─────────────────────────────────────────────
info "Install python3, pip, openssh..."
safe_apt python3 python3-pip python3-dev curl wget net-tools openssh-server

info "Install x11vnc (share desktop asli user, bukan session baru)..."
safe_apt x11vnc

ok "Packages OK"

# ── UPGRADE PIP DULU ─────────────────────────────────────────────
info "Upgrade pip (WAJIB sebelum install psutil/bcrypt)..."
python3 -m pip install --upgrade pip setuptools wheel -q 2>&1 | tail -3
python3 -m pip install psutil requests bcrypt -q 2>&1 | tail -3
python3 -c "import psutil" 2>/dev/null && ok "psutil OK" || warn "psutil gagal (opsional)"

# ── USER RSADMIN ─────────────────────────────────────────────────
info "Setup user rsadmin..."
if ! id rsadmin &>/dev/null; then
  useradd -m -s /bin/bash rsadmin
  usermod -aG sudo rsadmin
  echo "rsadmin:${RSADMIN_PASS}" | chpasswd
  ok "User rsadmin dibuat"
else
  echo "rsadmin:${RSADMIN_PASS}" | chpasswd 2>/dev/null || true
  info "User rsadmin sudah ada"
fi
RHOME=$(getent passwd rsadmin | cut -d: -f6)

# Home rsadmin wajib dimiliki rsadmin -- akun lama (OS reinstall/prior
# install) kadang punya home ke-root-owned, bikin xfce4-session gagal
# tulis .ICEauthority dan VNC crash-loop.
chown rsadmin:rsadmin "$RHOME"
chown -R rsadmin:rsadmin "$RHOME/.config" "$RHOME/.local" 2>/dev/null || true

# ── SSH ───────────────────────────────────────────────────────────
info "Enable SSH..."
systemctl enable --now ssh 2>/dev/null || systemctl enable --now sshd 2>/dev/null || true

mkdir -p "$RHOME/.ssh"
chmod 700 "$RHOME/.ssh"
touch "$RHOME/.ssh/authorized_keys"
chmod 600 "$RHOME/.ssh/authorized_keys"
chown -R rsadmin:rsadmin "$RHOME/.ssh"

# Download SSH key dari server
info "Download SSH key dari server..."
if curl -sf --connect-timeout 8 "${SERVER}/api/iso/pubkey/download" \
     -o /tmp/rsmp_key.pub 2>/dev/null && [ -s /tmp/rsmp_key.pub ]; then
  cat /tmp/rsmp_key.pub >> "$RHOME/.ssh/authorized_keys"
  sort -u "$RHOME/.ssh/authorized_keys" -o "$RHOME/.ssh/authorized_keys"
  rm -f /tmp/rsmp_key.pub
  ok "SSH key dari server OK"
else
  warn "Gagal download SSH key (opsional - upload manual via dashboard)"
fi
ok "SSH OK"

# ── SUDOERS ──────────────────────────────────────────────────────
info "Setup sudoers rsadmin..."
cat > /etc/sudoers.d/rsmp-rsadmin << 'SUDO'
rsadmin ALL=(ALL) NOPASSWD: \
  /usr/bin/apt-get, /usr/bin/apt, \
  /bin/systemctl, /usr/bin/systemctl, \
  /usr/bin/bash, /bin/bash, \
  /usr/bin/python3, \
  /usr/local/bin/rsmp-do-update.sh
SUDO
chmod 440 /etc/sudoers.d/rsmp-rsadmin
visudo -c -f /etc/sudoers.d/rsmp-rsadmin 2>/dev/null && \
  ok "Sudoers OK" || {
    rm -f /etc/sudoers.d/rsmp-rsadmin
    warn "Sudoers invalid, pakai ALL fallback"
    echo 'rsadmin ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/rsmp-rsadmin
    chmod 440 /etc/sudoers.d/rsmp-rsadmin
  }

# ── RSMP-AGENT ───────────────────────────────────────────────────
AGENT_DIR=/opt/rsmp-agent
AGENT_BIN=$AGENT_DIR/rsmp-agent.py
mkdir -p "$AGENT_DIR"
info "Install RSMP-Agent..."

# Coba download dari server dulu
DL_OK=false
if curl -sf --connect-timeout 10 \
     "${SERVER}/api/agent/download/rsmp-agent.py" \
     -o "$AGENT_BIN" 2>/dev/null && [ -s "$AGENT_BIN" ]; then
  DL_OK=true; ok "Agent dari server"
fi

# Cek file lokal
if [ "$DL_OK" = false ]; then
  for src in "$(dirname "$0")/rsmp-agent.py" \
             "/opt/rsmp-agent-src/rsmp-agent.py" \
             "/tmp/rsmp-agent.py"; do
    if [ -f "$src" ]; then
      cp "$src" "$AGENT_BIN"; DL_OK=true
      ok "Agent dari $src"; break
    fi
  done
fi

# Buat minimal agent jika semua gagal
if [ "$DL_OK" = false ]; then
  warn "Buat minimal agent..."
  python3 - << 'AGEOF' > "$AGENT_BIN"
#!/usr/bin/env python3
# RSMP Minimal Agent
import os,time,json,socket,subprocess,urllib.request
from datetime import datetime

def log(m): print(f"[{datetime.now():%H:%M:%S}] {m}",flush=True)
def run(c,t=8):
    try: return subprocess.run(c,shell=True,capture_output=True,text=True,timeout=t).stdout.strip()
    except: return ''
def conf():
    c={'RS_SERVER':'','RS_CLIENT_ID':'','RS_AGENT_TOKEN':'','RS_VNC_PASSWORD':''}
    for f in ['/etc/rsmp-agent.conf','/etc/rs-agent.conf']:
        if os.path.exists(f):
            for l in open(f):
                if '=' in l and not l.startswith('#'):
                    k,_,v=l.strip().partition('=')
                    c[k.strip()]=v.strip()
    return c
def post(url,d,token):
    b=json.dumps(d).encode()
    headers={'Content-Type':'application/json'}
    if token: headers['X-Agent-Token']=token
    r=urllib.request.Request(url,b,headers)
    return json.loads(urllib.request.urlopen(r,timeout=10).read())

c=conf()
S=c['RS_SERVER']; ID=c['RS_CLIENT_ID']; TOKEN=c['RS_AGENT_TOKEN']; VNCP=c['RS_VNC_PASSWORD']
if not ID and S:
    try:
        r=post(f'{S}/api/agent/register',{
            'hostname':socket.gethostname(),
            'ip':run("hostname -I|awk '{print $1}'"),
            'os':run("grep PRETTY_NAME /etc/os-release|cut -d'\"' -f2"),
            'agentVersion':'5.0.0','osType':'linux','vnc_password':VNCP},TOKEN)
        if r.get('clientId'):
            ID=r['clientId']
            open('/etc/rsmp-agent.conf','w').write(f'RS_SERVER={S}\nRS_CLIENT_ID={ID}\nRS_AGENT_TOKEN={TOKEN}\nRS_VNC_PASSWORD={VNCP}\n')
            log(f'ID: {ID}')
    except Exception as e: log(f'Register: {e}')
log(f'Agent start. Server={S}')
while True:
    try:
        if ID and S:
            post(f'{S}/api/agent/heartbeat',{
                'type':'heartbeat','clientId':ID,'agentVersion':'5.0.0',
                'hostname':socket.gethostname(),'osType':'linux',
                'cpu':0.0,'ram':0.0,'disk':0.0,'uptime':run('uptime -p'),
                'packagesPending':0},TOKEN)
    except: pass
    time.sleep(60)
AGEOF
fi
chmod +x "$AGENT_BIN"

# ── DAFTAR KE SERVER ─────────────────────────────────────────────
info "Registrasi ke server..."
MY_IP=$(ip -4 route get 8.8.8.8 2>/dev/null | awk '{print $7;exit}' \
        || hostname -I | awk '{print $1}')
MY_HOST=$(hostname)
MY_OS=$(grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d'"' -f2 || echo Linux)

RESP=$(curl -sf --connect-timeout 10 \
  -X POST "${SERVER}/api/agent/register" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Token: ${TOKEN}" \
  -d "{\"hostname\":\"${MY_HOST}\",\"ip\":\"${MY_IP}\",\"os\":\"${MY_OS}\",\
\"agentVersion\":\"5.0.0\",\"osType\":\"linux\",\"vnc_password\":\"${VNC_PASS}\"}" 2>/dev/null || echo "{}")

CID=$(python3 -c \
  "import sys,json; print(json.loads(sys.stdin.read()).get('clientId',''))" \
  <<< "$RESP" 2>/dev/null || echo "")

{
  echo "RS_SERVER=${SERVER}"
  [ -n "$CID" ] && echo "RS_CLIENT_ID=${CID}"
  echo "RS_AGENT_TOKEN=${TOKEN}"
  echo "RS_VNC_PASSWORD=${VNC_PASS}"
} > /etc/rsmp-agent.conf

[ -n "$CID" ] && ok "Terdaftar! ID: $CID" || \
  warn "Registrasi pending — agent retry otomatis"

# ── SERVICE RSMP-AGENT ────────────────────────────────────────────
info "Buat service rsmp-agent..."
cat > /etc/systemd/system/rsmp-agent.service << SVEOF
[Unit]
Description=RSMP-IT Agent v5.0
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=root
WorkingDirectory=${AGENT_DIR}
EnvironmentFile=-/etc/rsmp-agent.conf
ExecStart=/usr/bin/python3 ${AGENT_BIN}
Restart=always
RestartSec=30
StandardOutput=append:/var/log/rsmp-agent.log
StandardError=append:/var/log/rsmp-agent.log
[Install]
WantedBy=multi-user.target
SVEOF

systemctl daemon-reload
systemctl enable rsmp-agent
systemctl restart rsmp-agent
sleep 2
systemctl is-active rsmp-agent &>/dev/null && ok "rsmp-agent running" || \
  warn "rsmp-agent gagal — cek: journalctl -eu rsmp-agent -n 20"

# ── VNC SETUP (x11vnc, share display ASLI user yang login) ───────
# Beda sama TigerVNC vncserver: itu bikin desktop rsadmin baru yang
# kosong (bukan yang dilihat user). x11vnc nempel ke :0 (display fisik
# yang beneran dipakai user login), jadi IT support lihat & kontrol
# layar yang sama persis dengan user.
info "Setup x11vnc (share display :0)..."
# Bersihkan TigerVNC lama kalau ada (install versi sebelumnya) --
# dua-duanya pakai port 5901, bakal bentrok.
systemctl stop vncserver-rsmp@1 2>/dev/null || true
systemctl disable vncserver-rsmp@1 2>/dev/null || true
rm -f /etc/systemd/system/vncserver-rsmp@.service
mkdir -p /etc/rsmp-agent
x11vnc -storepasswd "${VNC_PASS}" /etc/rsmp-agent/vnc_passwd >/dev/null 2>&1
chown root:root /etc/rsmp-agent/vnc_passwd
chmod 600 /etc/rsmp-agent/vnc_passwd

cat > /etc/systemd/system/x11vnc.service << VSEOF
[Unit]
Description=RSMP-IT x11vnc (share display asli)
After=graphical.target display-manager.service
Wants=graphical.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/x11vnc -display :0 -auth guess -forever -shared \
    -noxdamage -repeat -rfbport 5901 \
    -rfbauth /etc/rsmp-agent/vnc_passwd \
    -o /var/log/rsmp-it-platform/x11vnc.log
Restart=always
RestartSec=5

[Install]
WantedBy=graphical.target
VSEOF

mkdir -p /var/log/rsmp-it-platform
systemctl daemon-reload
systemctl enable x11vnc
systemctl restart x11vnc 2>/dev/null || true
sleep 2
systemctl is-active x11vnc &>/dev/null && \
  ok "VNC running (port 5901, share display asli)" || \
  warn "VNC gagal — cek: journalctl -eu x11vnc -n 20"

# ── AUTO UPDATE ───────────────────────────────────────────────────
info "Setup auto-update jam 02:00..."
cat > /usr/local/bin/rsmp-do-update.sh << 'UPDEOF'
#!/bin/bash
LOG=/var/log/rsmp-update.log
echo "=== Update: $(date) ===" >> "$LOG"
ping -c1 -W5 8.8.8.8 &>/dev/null || { echo "No internet" >> "$LOG"; exit 0; }
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
apt-get update -qq >> "$LOG" 2>&1
apt-get upgrade -y -qq \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold" >> "$LOG" 2>&1
apt-get autoremove -y -qq >> "$LOG" 2>&1
echo "=== Done: $(date) ===" >> "$LOG"
UPDEOF
chmod +x /usr/local/bin/rsmp-do-update.sh

cat > /etc/systemd/system/rsmp-update.service << 'SVC'
[Unit]
Description=RSMP Auto Update
[Service]
Type=oneshot
ExecStart=/usr/local/bin/rsmp-do-update.sh
Nice=19
IOSchedulingClass=idle
SVC

cat > /etc/systemd/system/rsmp-update.timer << 'TMR'
[Unit]
Description=RSMP Update 02:00
[Timer]
OnCalendar=*-*-* 02:00:00
RandomizedDelaySec=1800
Persistent=true
[Install]
WantedBy=timers.target
TMR

systemctl daemon-reload
systemctl enable --now rsmp-update.timer
ok "Auto-update 02:00 WIB aktif"

# ── DISABLE SLEEP ─────────────────────────────────────────────────
systemctl mask sleep.target suspend.target \
  hibernate.target hybrid-sleep.target 2>/dev/null || true
ok "Sleep dinonaktifkan"

# ── UFW ───────────────────────────────────────────────────────────
safe_apt ufw 2>/dev/null || true
ufw allow 22/tcp   comment SSH 2>/dev/null || true
ufw allow 5901/tcp comment VNC 2>/dev/null || true
ufw --force enable 2>/dev/null || true

# ── UNINSTALLER LOKAL ─────────────────────────────────────────────
# Simpan uninstaller di client biar bisa dijalankan kapan saja tanpa
# download ulang: sudo rsmp-uninstall
if curl -sf --connect-timeout 8 "${SERVER}/api/agent/download/uninstall-agent.sh" \
     -o /usr/local/bin/rsmp-uninstall 2>/dev/null; then
  sed -i 's/\r$//' /usr/local/bin/rsmp-uninstall 2>/dev/null || true
  chmod +x /usr/local/bin/rsmp-uninstall
  ok "Uninstaller tersimpan: sudo rsmp-uninstall"
else
  warn "Uninstaller gagal diunduh (server tak terjangkau), lewati"
fi

echo ""
echo "================================================================"
echo "  RSMP-IT AGENT INSTALLED!"
echo "================================================================"
echo "  Client ID : ${CID:-PENDING (retry otomatis)}"
echo "  Server    : $SERVER"
echo "  VNC Port  : 5901  |  Password: ${VNC_PASS} (auto-fill di web, per-client)"
echo "  SSH User  : rsadmin  |  Password: ${RSADMIN_PASS}"
echo "  SIMPAN password rsadmin ini! Tidak ditampilkan lagi setelah script selesai."
echo ""
echo "  Status:"
for s in rsmp-agent x11vnc ssh rsmp-update.timer; do
  st=$(systemctl is-active "$s" 2>/dev/null || echo inactive)
  [ "$st" = active ] && printf "  ${G}✓${NC} %s\n" "$s" || \
    printf "  ${Y}?${NC} %s (%s)\n" "$s" "$st"
done
echo ""
echo "  Ganti VNC password: x11vnc -storepasswd <baru> /etc/rsmp-agent/vnc_passwd && systemctl restart x11vnc"
echo "  Uninstall agent   : sudo rsmp-uninstall"
echo "================================================================"
