# RSMP-IT Platform

Platform monitoring & manajemen IT internal untuk Rumah Sakit — memantau semua PC/client (Linux & Windows), remote desktop, deploy aplikasi massal, kelola tiket IT, dan auto-update, dari satu dashboard web.

## Arsitektur

```
┌─────────────┐      HTTP (session)      ┌──────────────────┐
│   Browser   │ ────────────────────────▶│  Backend (Node)   │
│  (React)    │◀──────────────────────── │  Express + MariaDB │
└─────────────┘                          └─────────┬─────────┘
                                                     │ SSH (master key) /
                                                     │ HTTP push (agent)
                                        ┌────────────┼────────────┐
                                        ▼                         ▼
                              ┌──────────────────┐     ┌──────────────────┐
                              │  Client Linux     │     │  Client Windows   │
                              │  rsmp-agent.py    │     │  rs-agent.ps1     │
                              │  x11vnc :5901     │     │  TightVNC :5901   │
                              └──────────────────┘     └──────────────────┘
```

- **Backend**: Node.js + Express, sesi login (`express-session` + MariaDB store), RBAC 3-tier (`viewer` < `operator` < `admin`).
- **Frontend**: React + Vite, styling pakai design system SIMRS ZAIDAN (Tailwind v4 compiled → `design-system.css`, dimuat statis, bukan lewat build pipeline Tailwind v3 milik app).
- **Database**: MariaDB.
- **Agent**: berjalan di tiap client, push metrik ke server tiap 60 detik lewat HTTP (`X-Agent-Token` auth), bukan pull/polling dari server.
- **Remote desktop**: VNC (x11vnc di Linux, TightVNC di Windows) di-tunnel lewat noVNC WebSocket proxy (`novnc-proxy.py`) — browser connect langsung tanpa VNC client terpisah.

## Fitur

| Halaman | Fungsi |
|---|---|
| **Dashboard** | Ringkasan online/offline, breakdown OS, trend, uptime fleet 7 hari, status tiket, status RustDesk server |
| **Semua Client** | List semua client, filter OS/status/departemen, ping massal, tambah/import/hapus client |
| **Detail Client** | Metrik lengkap (CPU/RAM/disk/uptime/proses/network/service), riwayat uptime, terminal, remote desktop, SSH setup |
| **Remote Desktop** | VNC via browser (noVNC) untuk Linux & Windows; RustDesk sebagai alternatif |
| **Terminal** | SSH shell langsung dari browser (xterm.js) ke client Linux |
| **Deploy Massal** | Kirim script ke banyak client Linux sekaligus (install aplikasi pilihan, auto-update, hardening) |
| **Update Control** | Jadwal & kontrol update paket OS client Linux |
| **SSH Key Setup** | Distribusi SSH master key ke client Linux |
| **ISO Builder** | Build custom ISO Linux Mint (base image saja — instalasi agent tetap lewat one-liner, bukan baked-in) |
| **RustDesk Server** | Kelola RustDesk server self-hosted (hbbs/hbbr) |
| **IT Tickets** | Tiket keluhan IT internal, status open/in-progress/closed, prioritas |
| **Audit Log** | Riwayat semua aktivitas & command yang dijalankan |
| **Pengaturan** | Agent token, password VNC default, info server, SSH public key |

## Agent

Dua varian agent, fungsional setara, arsitektur push-based (bukan agent yang di-poll server):

**Linux** (`rs-agent/`) — `rsmp-agent.py` jalan sebagai `systemd` service. Install (`install-agent.sh`) sekaligus setup user `rsadmin`, x11vnc (share display asli, bukan session baru), SSH server + master key, dan register otomatis ke server.

**Windows** (`rs-agent-windows/`) — `rs-agent.ps1` jalan sebagai Scheduled Task (principal SYSTEM, tanpa perlu login). Install (`install-agent-windows.bat`) pasang TightVNC (setara x11vnc), register sinkron saat instalasi (langsung muncul di dashboard), RDP **sengaja tidak** diaktifkan — remote pakai VNC/RustDesk saja.

Keduanya: kirim heartbeat 60 detik (metrik + status), auto-unregister dari dashboard saat di-uninstall, uninstaller otomatis ter-bundle saat instalasi.

## Struktur Proyek

```
backend/            Node.js API (Express, route per fitur di src/routes/)
frontend/            React + Vite (halaman di src/pages/, layout di src/components/)
rs-agent/             Agent Linux + installer/uninstaller
rs-agent-windows/     Agent Windows + installer/uninstaller
client/               Script deploy massal (01_install_apps, 02_autoupdate, 03_hardening)
server-setup/         Script setup & finalize server, ISO builder, util
nginx/                Konfigurasi reverse proxy
```

## Stack

- **Backend**: Node.js, Express, MariaDB, express-session, node-ssh
- **Frontend**: React, Vite, Tailwind, Recharts, xterm.js, noVNC
- **Agent**: Python 3 (Linux), PowerShell (Windows)
- **Infra**: Nginx (reverse proxy + static), systemd (service Linux server & client)

## Instalasi

### 1. Server (Ubuntu)

```bash
# Kalau ada error dpkg/debconf lock, jalankan dulu:
sudo bash server-setup/fix-dpkg-lock.sh

# Install server (MariaDB, Node, Nginx, Redis, dll — interaktif tanya nama RS, IP, port):
sudo bash server-setup/install-server.sh

# Copy project ke lokasi live:
sudo cp -r . /opt/rsmp-it-platform/

# Finalize (npm install, build frontend, apply sudoers, start service):
sudo bash server-setup/finalize-setup.sh

# Opsional — RustDesk self-hosted:
sudo bash server-setup/install-rustdesk-server.sh

# Validasi semua service OK:
bash server-setup/check-setup.sh
```

Port web default `8080` — kalau bentrok, script otomatis pilih port bebas berikutnya (begitu juga port DB, default `3307`). Password admin & port final ditampilkan di akhir `install-server.sh` (tersimpan juga di `/root/rsmp-it-info.txt`).

Setelah server jalan, ambil **Agent Token** di halaman **Settings** (login admin) — dipakai semua client untuk register/heartbeat. Halaman Settings juga punya tombol **"Copy Install Command"** (Linux & Windows) yang generate one-liner lengkap otomatis — cara paling gampang install client.

### 2. Client Linux (Linux Mint / Xubuntu XFCE)

Paling gampang: copy one-liner dari **Settings → Agent Token → Install Command (Linux)** di web, paste di terminal client. Manual:

```bash
# Install agent (wajib) — pasang x11vnc, SSH, register ke server:
curl -sf http://IP_SERVER:PORT/api/agent/download/install-agent.sh -o install-agent.sh
RS_SERVER=http://IP_SERVER:PORT RS_AGENT_TOKEN=xxx sudo bash install-agent.sh

# Uninstall (juga otomatis tersimpan di client sebagai /usr/local/bin/rsmp-uninstall):
sudo rsmp-uninstall
```

Install aplikasi/hardening/auto-update **direkomendasikan lewat halaman Deploy Massal di web** (bisa pilih aplikasi mana yang mau dipasang, jalan paralel ke banyak client, hasil per-client keliatan). Untuk jalankan manual di satu mesin:

```bash
sudo bash client/01_install_apps.sh              # semua app
sudo bash client/01_install_apps.sh firefox pdf   # pilih app tertentu
sudo bash client/02_autoupdate.sh                 # unattended-upgrades
sudo bash client/03_hardening.sh                  # no-sleep, no-notif, firewall
```

### 3. Client Windows

Paling gampang: copy one-liner dari **Settings → Agent Token → Install Command (Windows)** di web, paste di PowerShell **Administrator**. Manual (`rs-agent.ps1` harus ada di folder yang sama):

```bat
:: Jalankan sebagai Administrator:
install-agent-windows.bat

:: Uninstall (juga otomatis tersimpan di C:\RS-Agent\uninstall-agent-windows.bat):
uninstall-agent-windows.bat
```

Installer pasang TightVNC (port 5901, remote desktop) dan Scheduled Task (agent jalan sebagai SYSTEM). RDP **tidak** diaktifkan.

### Fix Error Umum

| Masalah | Solusi |
| --- | --- |
| `debconf: config.dat is locked` | `sudo bash server-setup/fix-dpkg-lock.sh` |
| MariaDB gagal install | Sudah pakai repo resmi MariaDB (bukan repo Ubuntu default) |
| `pip install bcrypt` gagal | Sudah `pip install --upgrade pip setuptools wheel` dulu sebelum bcrypt |
| RustDesk server timeout cek versi | Sudah pakai URL download langsung, tidak cek GitHub API |
| Client tidak muncul di dashboard | Cek agent jalan (`systemctl status rsmp-agent` / Task Scheduler `RSMPAgent`), token benar, server reachable |
| Remote desktop gagal connect | Cek port 5901 kebuka (`ss -tlnp \| grep 5901`), service noVNC proxy jalan (`systemctl status rsmp-it-novnc`) |

### Struktur File Live (server)

```text
/opt/rsmp-it-platform/
├── backend/          ← Node.js API
├── frontend/dist/    ← React build
├── keys/             ← SSH master key
├── scripts/agent/    ← Agent files (di-serve ke client)
├── novnc-proxy.py    ← VNC WebSocket proxy
└── backend/.env      ← Config (RAHASIA)

/var/log/rsmp-it-platform/
├── backend.log
├── backend-error.log
└── novnc.log
```
