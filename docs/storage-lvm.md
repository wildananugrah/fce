# Data disk on LVM

PostgreSQL and MinIO data live on a dedicated disk managed by LVM (Logical
Volume Manager). LVM lets us **grow the storage online** — no reboot, no
container restart — by attaching another disk and pointing the volume group
at it.

## Layout

```
/dev/nvme1n1   (Lightsail block storage)
    └── PV                                    (physical volume)
            └── VG: data-vg                   (volume group — pool of space)
                    └── LV: data-lv           (logical volume — ext4)
                            mounted at /mnt/data
                                ├── postgres/   → bind-mounted into postgres container
                                └── minio/      → bind-mounted into minio container
```

The mount is persisted in `/etc/fstab` by **UUID** (not device name), with
`nofail` so the system still boots if the disk is missing.

`docker-compose.yml` binds those host paths into the containers:

```yaml
postgres:
  volumes:
    - /mnt/data/postgres:/var/lib/postgresql/data
minio:
  volumes:
    - /mnt/data/minio:/data
```

## Day-to-day commands

```bash
scripts/expand-data-disk.sh status       # show current disk / PV / VG / LV / mount
df -hT /mnt/data                         # quick free space check
lsblk                                    # see every block device
```

## Expanding storage

Lightsail block disks can't be resized in place — to grow, you **attach an
additional disk** from the Lightsail console and then add it to the volume
group. The existing data is untouched.

### 1. Attach a new disk in Lightsail

Lightsail console → Storage → *Create disk* → attach to this instance.
It will appear as the next unused `/dev/nvme*n1` (usually `/dev/nvme2n1`
if this is your second extra disk). Confirm with:

```bash
lsblk
```

Look for a device at the bottom with no `MOUNTPOINTS` and no child
partitions — that's the new one.

### 2. Add it to the pool

```bash
sudo scripts/expand-data-disk.sh add /dev/nvme2n1
```

The script:
1. Refuses to touch the disk if it already has a filesystem or is mounted
   (safety check — you can force-wipe with `wipefs -a` if you're sure).
2. `pvcreate` — marks the disk as an LVM physical volume.
3. `vgextend data-vg` — adds it to the volume group, enlarging the pool.
4. `lvextend -r -l +100%FREE` — grows the logical volume into all the new
   space **and** runs `resize2fs` online so ext4 picks up the new size.

PostgreSQL and MinIO see the extra space immediately. **No restart.**

### 3. Verify

```bash
scripts/expand-data-disk.sh status
df -hT /mnt/data
```

### Edge case: in-place resize

Some providers (not Lightsail) let you resize a disk in place. If the
underlying block device reports a new size but the PV doesn't, run:

```bash
sudo scripts/expand-data-disk.sh grow
```

This calls `pvresize` on every PV in `data-vg`, then extends the LV + fs.
On Lightsail this is a no-op — prefer `add`.

## Shrinking storage

Not supported by this script. ext4 shrink is offline and lossy; if you
really need it, unmount, `resize2fs` to a smaller size, `lvreduce`, and
pray. Don't do this on a live system.

## Recovery notes

* **fstab broke the boot** — entry uses `nofail`, so a missing disk just
  leaves `/mnt/data` unmounted. A backup is saved as
  `/etc/fstab.bak.<timestamp>` every time this was changed manually.
* **Disk died** — you lose everything on it. This setup has **no
  redundancy** (single PV, no RAID). For durability, rely on backups
  (`pg_dump`, MinIO replication, or Lightsail disk snapshots).
* **Started the stack before mounting** — Docker will happily create
  `/mnt/data/postgres` on the *root* filesystem if the mount isn't active,
  and the new data won't be on the LVM disk. Always check
  `df -hT /mnt/data` before `docker compose up`.

## First-time setup (for reference)

One-time steps that created this setup (already done on this host):

```bash
pvcreate /dev/nvme1n1
vgcreate data-vg /dev/nvme1n1
lvcreate -l 100%FREE -n data-lv data-vg
mkfs.ext4 /dev/data-vg/data-lv

UUID=$(blkid -s UUID -o value /dev/data-vg/data-lv)
echo "UUID=$UUID /mnt/data ext4 defaults,nofail 0 2" >> /etc/fstab
mount -a

mkdir -p /mnt/data/postgres /mnt/data/minio
```
