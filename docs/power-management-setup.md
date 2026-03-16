# Power Management Setup

macOS defaults (sleep, disk sleep, Power Nap) are unsuitable for always-on agent
operation. They cause network drops, missed cron jobs, and agent unreachability.

This guide configures power settings for a MiniClaw host that must stay awake 24/7.

> **Upstream issue:** [#69](https://github.com/augmentedmike/miniclaw-os/issues/69)

---

## Quick Setup (one command)

```bash
sudo ./scripts/configure-power.sh
```

This sets all required `pmset` values in one step. See below for what it does.

---

## Required `pmset` Settings

| Setting | Value | Purpose |
|---------|-------|---------|
| `sleep` | `0` | Prevent system sleep |
| `disksleep` | `0` | Prevent disk spindown (keeps SQLite DBs responsive) |
| `displaysleep` | `0` | Prevent display sleep (avoids GPU power-state issues) |
| `autorestart` | `1` | Auto-restart after power failure |
| `powernap` | `0` | Disable Power Nap (causes intermittent wake/sleep cycles) |
| `hibernatemode` | `0` | Disable hibernation (RAM stays powered) |
| `networkoversleep` | `1` | Keep network interfaces active during sleep transitions |

### Apply manually

```bash
sudo pmset -a sleep 0
sudo pmset -a disksleep 0
sudo pmset -a displaysleep 0
sudo pmset -a autorestart 1
sudo pmset -a powernap 0
sudo pmset -a hibernatemode 0
sudo pmset -a networkoversleep 1
```

The `-a` flag applies to all power sources (AC + battery). On a Mac Mini this is
equivalent to `-c` (charger only) since there is no battery. On laptops, consider
using `-c` for charger-only settings and keeping battery defaults with `-b`.

### Verify

```bash
pmset -g
```

Expected output should show all values matching the table above.

---

## System Settings UI Paths

If you prefer the GUI, these are the equivalent settings in System Settings:

| Setting | Path |
|---------|------|
| Prevent sleep | **System Settings → Energy Saver** → "Prevent your Mac from automatically sleeping when the display is off" (enable) |
| Wake for network | **System Settings → Energy Saver** → "Wake for network access" (enable) |
| Start up after power failure | **System Settings → Energy Saver** → "Start up automatically after a power failure" (enable) |
| Display sleep | **System Settings → Displays → Advanced…** → set display sleep timer to "Never" |

> **Note:** Not all `pmset` settings have GUI equivalents. The `configure-power.sh`
> script or manual `pmset` commands are the authoritative method.

> **Note:** On laptops the pane is called **Battery** instead of **Energy Saver**,
> with separate tabs for "Battery" and "Power Adapter".

---

## Healthcheck

A cron healthcheck detects drift from the expected settings:

```bash
./cron/scripts/check-power-settings.sh
```

This script exits `0` if all settings match, or exits `1` and prints the
mismatched settings. It complements the existing `mc-smoke` checks for
`disksleep` and `autorestart`.

Install it as a daily cron job:

```bash
# Add to crontab (runs daily at 06:00)
(crontab -l 2>/dev/null; echo "0 6 * * * $(pwd)/cron/scripts/check-power-settings.sh >> /tmp/power-healthcheck.log 2>&1") | crontab -
```

---

## Troubleshooting

### Settings reset after reboot

macOS can reset `pmset` values after OS updates or SMC resets. Run the
healthcheck script or `configure-power.sh` again after major updates.

### `pmset` returns "Operation not permitted"

You need `sudo`. The configure script handles this automatically.

### Laptop vs desktop

Mac Mini is always on AC power, so `-a` is fine. On a MacBook, you may want
different settings for battery (`-b`) vs charger (`-c`). The configure script
uses `-a` by default — edit it if you need split behavior.
