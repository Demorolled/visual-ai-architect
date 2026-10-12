#!/usr/bin/env bash
# fix-wifi-power-save.sh — kill Wi-Fi power save (Realtek BT/Wi-Fi combo chip
# stutter fix). Wi-Fi power save makes the radio sleep mid-BT-stream, which
# Realtek controllers manifest as BT audio clipping/stuttering.
#
# Run as root once (it also installs a boot-persistent systemd unit):
#   sudo bash tools/audio/fix-wifi-power-save.sh
set -euo pipefail

IFACE="wlp7s0"

echo "=== Current state ==="
iw dev "$IFACE" get power_save 2>/dev/null || true

echo "=== Disabling power save now ==="
iw dev "$IFACE" set power_save off || { echo "❌ failed (need root?)"; exit 1; }
echo "   ✓ now: $(iw dev "$IFACE" get power_save 2>/dev/null)"

echo "=== Installing boot-persistent unit ==="
UNIT="/etc/systemd/system/wifi-power-save-off.service"
cat > "$UNIT" <<EOF
[Unit]
Description=Disable Wi-Fi power save (BT stutter fix)
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/sbin/iw dev $IFACE set power_save off
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable wifi-power-save-off.service
systemctl start wifi-power-save-off.service
echo "   ✓ enabled + started wifi-power-save-off.service"

echo ""
echo "✅ Wi-Fi power save OFF (now + on every boot)."
