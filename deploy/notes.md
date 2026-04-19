lsb_release -a          # cleanest — prints Distributor ID, Description, Release, Codename
cat /etc/os-release     # works on any Linux even if lsb_release isn't installed
hostnamectl             # also shows kernel + architecture