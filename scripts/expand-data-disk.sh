#!/usr/bin/env bash
#
# expand-data-disk.sh — grow the LVM-backed /mnt/data volume without a restart.
#
# Layout managed by this script:
#   /dev/nvme*        → PV(s)
#   VG name           → data-vg
#   LV name           → data-lv
#   Filesystem        → ext4, mounted at /mnt/data
#
# Subcommands:
#   status              Show current PV/VG/LV/mount sizes.
#   add <device>        Add a newly-attached empty disk (e.g. /dev/nvme2n1)
#                       to the VG and extend the LV + filesystem online.
#   grow                Rescan existing PVs for underlying size changes
#                       (useful if the cloud provider resized a disk in place)
#                       and extend the LV + filesystem online.
#
# All online operations — no reboot, no service restart needed.

set -euo pipefail

VG_NAME="data-vg"
LV_NAME="data-lv"
LV_PATH="/dev/${VG_NAME}/${LV_NAME}"
MOUNTPOINT="/mnt/data"

die() { echo "error: $*" >&2; exit 1; }
need_root() { [[ $EUID -eq 0 ]] || die "must run as root (try: sudo $0 $*)"; }

cmd_status() {
	echo "=== lsblk ==="
	lsblk
	echo
	echo "=== PVs ==="
	pvs
	echo
	echo "=== VGs ==="
	vgs
	echo
	echo "=== LVs ==="
	lvs
	echo
	echo "=== mount ==="
	df -hT "$MOUNTPOINT" 2>/dev/null || echo "$MOUNTPOINT not mounted"
}

cmd_add() {
	need_root "$@"
	local dev="${1:-}"
	[[ -n "$dev" ]] || die "usage: $0 add <device>  e.g. /dev/nvme2n1"
	[[ -b "$dev" ]] || die "$dev is not a block device"

	# Refuse if device already has a filesystem, partition table, or is mounted.
	if lsblk -no FSTYPE "$dev" | grep -qv '^$'; then
		die "$dev already has a filesystem or partition. Refusing to overwrite.
     Inspect it with: lsblk -f $dev
     If you are SURE it is safe to wipe, run: wipefs -a $dev  (destroys data)"
	fi
	if findmnt -S "$dev" >/dev/null 2>&1; then
		die "$dev is currently mounted. Unmount it first."
	fi

	echo ">>> pvcreate $dev"
	pvcreate "$dev"

	echo ">>> vgextend $VG_NAME $dev"
	vgextend "$VG_NAME" "$dev"

	echo ">>> lvextend -r -l +100%FREE $LV_PATH  (online ext4 resize)"
	lvextend -r -l +100%FREE "$LV_PATH"

	echo
	cmd_status
}

cmd_grow() {
	need_root "$@"

	echo ">>> pvresize (rescan underlying device sizes)"
	# Resize every PV in our VG so LVM picks up any underlying growth.
	for pv in $(pvs --noheadings -o pv_name -S vg_name="$VG_NAME" | tr -d ' '); do
		echo "    pvresize $pv"
		pvresize "$pv"
	done

	local free_extents
	free_extents=$(vgs --noheadings -o vg_free_count "$VG_NAME" | tr -d ' ')
	if [[ "$free_extents" == "0" ]]; then
		echo "No free extents in $VG_NAME — nothing to extend."
		echo "Did you actually resize the underlying disk? Attach a new one and use \`add\` instead."
		cmd_status
		return 0
	fi

	echo ">>> lvextend -r -l +100%FREE $LV_PATH  (online ext4 resize)"
	lvextend -r -l +100%FREE "$LV_PATH"

	echo
	cmd_status
}

main() {
	local sub="${1:-}"
	shift || true
	case "$sub" in
		status) cmd_status "$@" ;;
		add)    cmd_add "$@" ;;
		grow)   cmd_grow "$@" ;;
		-h|--help|help|"")
			sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
			;;
		*) die "unknown subcommand: $sub  (try: $0 --help)" ;;
	esac
}

main "$@"
