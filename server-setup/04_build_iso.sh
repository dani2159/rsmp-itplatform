#!/bin/bash
# ================================================================
#  RSMP-IT — 04_build_iso.sh
#  Remaster Linux Mint XFCE ISO dengan RSMP agent pre-baked.
#  Dipanggil oleh backend/src/routes/system.js (isoRouter POST /build)
#  dengan env: BASE_ISO, ISO_LABEL, ISO_DIR, SERVER_URL, APP_DIR.
#
#  Hasil: ISO custom yang, setelah target-install Linux Mint selesai
#  dan boot pertama kali, otomatis menjalankan install-agent.sh
#  (RS_SERVER sudah di-bake ke SERVER_URL) via systemd oneshot service.
# ================================================================
set -euo pipefail

BASE_ISO="${BASE_ISO:?BASE_ISO wajib}"
ISO_LABEL="${ISO_LABEL:-LinuxMint-RSMP}"
ISO_DIR="${ISO_DIR:?ISO_DIR wajib}"
SERVER_URL="${SERVER_URL:?SERVER_URL wajib}"
APP_DIR="${APP_DIR:-/opt/rsmp-it-platform}"

[ "$EUID" -ne 0 ] && { echo "[ERROR] Harus root"; exit 1; }
[ -f "$BASE_ISO" ] || { echo "[ERROR] BASE_ISO tidak ditemukan: $BASE_ISO"; exit 1; }

# JANGAN pakai /tmp -- di server ini /tmp adalah tmpfs (RAM), ISO 3-4GB
# akan langsung menghabiskan RAM. Kerja di disk asli.
WORK="/var/tmp/rsmp-iso-build-$$"
MOUNT_DIR="$WORK/mount"
EXTRACT_DIR="$WORK/extract"
SQUASHFS_DIR="$WORK/squashfs-root"

cleanup() {
  mountpoint -q "$MOUNT_DIR" 2>/dev/null && umount -lf "$MOUNT_DIR" || true
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "[1/8] Install dependency remaster..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq squashfs-tools xorriso isolinux syslinux-utils genisoimage rsync

echo "[2/8] Mount base ISO..."
mkdir -p "$MOUNT_DIR" "$EXTRACT_DIR"
mount -o loop,ro "$BASE_ISO" "$MOUNT_DIR"

echo "[3/8] Copy ISO contents ke $EXTRACT_DIR..."
rsync -a "$MOUNT_DIR"/ "$EXTRACT_DIR"/
umount "$MOUNT_DIR"

echo "[4/8] Extract squashfs..."
SQUASHFS_FILE=$(find "$EXTRACT_DIR" -name "filesystem.squashfs" | head -1)
[ -z "$SQUASHFS_FILE" ] && { echo "[ERROR] filesystem.squashfs tidak ditemukan di ISO -- base ISO bukan Ubuntu/Mint casper-based?"; exit 1; }
unsquashfs -d "$SQUASHFS_DIR" "$SQUASHFS_FILE"

echo "[5/8] Inject RSMP agent + first-boot service..."
mkdir -p "$SQUASHFS_DIR/opt/rsmp-agent-src"
AGENT_SRC="$APP_DIR/scripts/agent"
cp "$AGENT_SRC/rsmp-agent.py" "$SQUASHFS_DIR/opt/rsmp-agent-src/rsmp-agent.py"
cp "$AGENT_SRC/install-agent.sh" "$SQUASHFS_DIR/opt/rsmp-agent-src/install-agent.sh"
chmod +x "$SQUASHFS_DIR/opt/rsmp-agent-src/install-agent.sh"

cat > "$SQUASHFS_DIR/opt/rsmp-agent-src/first-boot.sh" << FBEOF
#!/bin/bash
# Jalan sekali di target-install (bukan di live session) waktu boot pertama.
LOG=/var/log/rsmp-first-boot.log
echo "=== RSMP first-boot: \$(date) ===" >> "\$LOG"
for i in \$(seq 1 30); do
  ping -c1 -W2 8.8.8.8 &>/dev/null && break
  sleep 5
done
RS_SERVER="${SERVER_URL}" bash /opt/rsmp-agent-src/install-agent.sh >> "\$LOG" 2>&1
touch /opt/rsmp-agent-src/.installed
FBEOF
chmod +x "$SQUASHFS_DIR/opt/rsmp-agent-src/first-boot.sh"

cat > "$SQUASHFS_DIR/etc/systemd/system/rsmp-first-boot.service" << UNIT
[Unit]
Description=RSMP-IT Agent First-Boot Setup
After=network-online.target
Wants=network-online.target
ConditionPathExists=!/opt/rsmp-agent-src/.installed

[Service]
Type=oneshot
ExecStart=/opt/rsmp-agent-src/first-boot.sh
RemainAfterExit=yes
TimeoutStartSec=600

[Install]
WantedBy=multi-user.target
UNIT

chroot "$SQUASHFS_DIR" systemctl enable rsmp-first-boot.service

echo "[6/8] Rebuild squashfs..."
rm -f "$SQUASHFS_FILE"
mksquashfs "$SQUASHFS_DIR" "$SQUASHFS_FILE" -comp xz -noappend

echo "[7/8] Update filesystem.size..."
printf "%s" "$(du -sx --block-size=1 "$SQUASHFS_DIR" | cut -f1)" > "$EXTRACT_DIR/casper/filesystem.size"

echo "[8/8] Rebuild ISO (hybrid, BIOS+UEFI boot)..."
mkdir -p "$ISO_DIR"
OUT_ISO="$ISO_DIR/${ISO_LABEL}-$(date +%Y%m%d-%H%M).iso"

ISOHDPFX=$(find /usr/lib -name isohdpfx.bin 2>/dev/null | head -1)
EFI_IMG=$(find "$EXTRACT_DIR" -path "*boot/grub/efi.img" -o -path "*EFI/boot/*.img" 2>/dev/null | head -1)

XORRISO_ARGS=(
  -as mkisofs -iso-level 3 -full-iso9660-filenames
  -volid "$ISO_LABEL"
  -eltorito-boot isolinux/isolinux.bin
  -eltorito-catalog isolinux/boot.cat
  -no-emul-boot -boot-load-size 4 -boot-info-table
)
[ -n "$ISOHDPFX" ] && XORRISO_ARGS+=(-isohybrid-mbr "$ISOHDPFX")
if [ -n "$EFI_IMG" ]; then
  XORRISO_ARGS+=(-eltorito-alt-boot -e "${EFI_IMG#$EXTRACT_DIR/}" -no-emul-boot -isohybrid-gpt-basdat)
else
  echo "[WARN] EFI boot image tidak ditemukan -- ISO hasil cuma bisa boot BIOS/Legacy, bukan UEFI"
fi
XORRISO_ARGS+=(-output "$OUT_ISO" "$EXTRACT_DIR")

xorriso "${XORRISO_ARGS[@]}"

echo ""
echo "ISO BUILD SELESAI: $OUT_ISO"
echo "Ukuran: $(du -h "$OUT_ISO" | cut -f1)"
