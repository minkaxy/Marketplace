# Self-hosted deployment

## Supported target

Official Node.js 24 or newer; Windows x64, Linux x64, or Linux ARM64. Use a 64-bit OS and ARM64 Node on Raspberry Pi. The packaged runtime has no external service dependencies. This release targets a machine or Docker host with a persistent disk; do not place the live database on ephemeral storage.

## Configuration

Copy `config.example.env` to `.env` (the launch scripts do this once). The Node entry point reads `.env` without overwriting environment variables already set by the OS.

| Variable | Default | Meaning |
| --- | --- | --- |
| PORT | 3000 | Listening port |
| HOST | 127.0.0.1 | Use 0.0.0.0 for LAN access or inside Docker |
| DATA_DIR | ./data | Persistent database and initial setup code directory |
| PUBLIC_ORIGIN | unset | Exact public HTTPS origin when behind a reverse proxy |
| SETUP_TOKEN | generated | Optional one-time administrator setup code, minimum 32 characters |

Never expose `.env`, the data directory or backups through a static web server. The application serves only its embedded public assets and permission-checked media. It ignores all visitor-supplied identity headers. Public access should terminate TLS at a reverse proxy with PUBLIC_ORIGIN configured so cookies are Secure and CSRF origin checks work correctly. Plain HTTP is intended for local/LAN setup only.

Liveness: `GET /healthz`. The application opens its database at startup; database-open errors fail startup rather than substituting a demo. A `server.lock` file prevents starting a second packaged server against the same data directory. Shut down with Ctrl+C or SIGTERM. If a process was killed, the next startup recognizes a dead PID and replaces the stale lock.

## Windows

Run `start-windows.cmd` from the extracted release. Keep its terminal running. For a service, use an OS service manager configured with working directory set to the application folder, executable `node.exe`, arguments `scripts/start.mjs`, and a dedicated Windows account with write access only to the data directory. The package does not silently install a background service or change firewall settings.

## Linux / Raspberry Pi systemd

For an optional service, the supplied unit assumes Node at `/usr/bin/node`, code at `/opt/baan-marketplace`, user/group `baan`, and data at `/var/lib/baan-marketplace`. Adjust the unit to match the actual Node path before installing.

```sh
sudo useradd --system --home /opt/baan-marketplace --shell /usr/sbin/nologin baan
sudo mkdir -p /opt/baan-marketplace /var/lib/baan-marketplace
# Extract the release into /opt/baan-marketplace.
sudo chown -R baan:baan /var/lib/baan-marketplace
sudo cp /opt/baan-marketplace/deploy/baan-marketplace.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now baan-marketplace
sudo journalctl -u baan-marketplace -f
```

The first-time code is `/var/lib/baan-marketplace/setup-token.txt` for this service. Read it locally as the service account or root, and create your own administrator through the web UI. Set PUBLIC_ORIGIN in the application `.env` when adding a public domain. The unit allows writes only to the data directory; run backups separately with the appropriate DATA_DIR and a writable destination directory.

## Docker / Compose

```sh
docker compose up --build -d
docker compose logs -f marketplace
docker compose exec marketplace cat /app/data/setup-token.txt
```

The named `baan-data` volume stores the SQLite database and uploaded media. The compose port is bound to host loopback by default. For LAN use change the port binding deliberately; for public use configure a TLS proxy and PUBLIC_ORIGIN. Standard Node images support Linux ARM64 as well as x64; build on the target architecture. Never remove the volume when upgrading.

## Backups, recovery and upgrades

Run `node scripts/backup.mjs` from the app directory; it uses SQLite's backup API and can run alongside the server. Store the resulting backup off-device. Restore only after stopping the server with `node scripts/restore.mjs /absolute/path/backup.sqlite`; the tool checks integrity and retains the old database and WAL files. Keep sufficient free disk space for both copies. Backup files contain accounts, sessions, addresses, orders and media.

Before upgrading: back up, stop the server, replace application files while retaining `.env` and the data directory, run `node scripts/build.mjs`, restart. Avoid extracting a release over an existing data directory from another installation. The package excludes all runtime data, secrets, test outputs and development identities.

The object table is created only at startup. Subsequent schema migrations must preserve stored data. This version does not import earlier `.local-data` sample JSON files or a Sites/R2 bucket automatically.
