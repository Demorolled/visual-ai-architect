# 🐧 Ubuntu System Diagnostic Tool — Architecture Plan

> An architecture plan generated using the **Design Manifesto** — every decision follows your stated preferences.

---

## 🎯 Overview

**Name:** `sysdiag` — Ubuntu System Diagnostic Tool
**Target OS:** Linux (Ubuntu 22.04+)
**Language:** Go (primary), SQLite (storage)
**Architecture Style:** Monolithic, layered, single-binary
**Interface:** CLI / Terminal UI (no web interface)

A comprehensive system diagnostic tool that collects hardware/software information, runs health checks, monitors system state, and generates actionable reports. Runs entirely offline with optional alerting via systemd notifications.

---

## 🧩 Node Architecture

```
  ┌─────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
  │  System          │     │  Health Check        │     │  Report Builder   │
  │  Collector       │────▶│  Engine              │────▶│                   │
  │  (input)         │     │  (logic)             │     │  (output)         │
  └─────────────────┘     └──────────┬───────────┘     └────────┬─────────┘
                                     │                          │
  ┌─────────────────┐               │                          │
  │  Journal         │               │                          │
  │  Reader          │───────────────┤                          │
  │  (input)         │               │                          │
  └─────────────────┘               │                          │
                                     │                          │
  ┌─────────────────┐     ┌──────────▼───────────┐     ┌────────▼─────────┐
  │  Service         │     │  Diagnostic          │     │  Alert Engine    │
  │  Checker         │────▶│  Database             │────▶│                   │
  │  (logic)         │     │  (database - SQLite)  │     │  (output)        │
  └─────────────────┘     └──────────────────────┘     └────────┬─────────┘
                                                                 │
  ┌─────────────────┐     ┌──────────────────────┐              │
  │  Config          │     │  Continuous          │              │
  │  Manager         │────▶│  Monitor             │──────────────┘
  │  (logic)         │     │  (logic)             │
  └─────────────────┘     └──────────────────────┘
                                                          
  ┌─────────────────┐     ┌──────────────────────┐
  │  CLI Commander   │     │  Export Handler      │
  │  (ui - TUI)      │────▶│  (output)            │
  └─────────────────┘     └──────────────────────┘
```

---

## 📋 Nodes — Detailed Breakdown

### 1. System Collector `[input · Go]`

**Purpose:** Gather comprehensive system information from the Ubuntu machine.

**Data Collected:**
- **CPU:** Model, cores/threads, architecture, frequency, cache, load averages, usage percentages per core
- **Memory:** Total, used, available, swap usage, buffers/cache breakdown
- **Disk:** Mounted filesystems, total/used/available space, inode usage, I/O stats, disk health (SMART)
- **Network:** Interfaces, IP addresses, link status, speed, RX/TX bytes/packets, routing table
- **Kernel:** Version, uptime, boot parameters, loaded modules, kernel parameters (sysctl)
- **Hardware:** DMI/BIOS info, USB devices, PCI devices, sensors (temperature, fan speeds, voltages)
- **Processes:** Top processes by CPU/memory, process count, zombie processes, running services
- **OS:** Ubuntu version, codename, package count, last update date, available updates

**Implementation:**
- Read `/proc/`, `/sys/`, `/dev/` filesystem entries
- Use `gopsutil` library for cross-platform reliability
- Execute `sensors`, `smartctl`, `lsblk`, `lspci`, `lsusb` for hardware data
- Parse `/etc/os-release` for distribution info
- Cache results with TTL to avoid redundant reads

**Resource Files:**
- `pkg/collector/cpu.go`
- `pkg/collector/memory.go`
- `pkg/collector/disk.go`
- `pkg/collector/network.go`
- `pkg/collector/kernel.go`
- `pkg/collector/hardware.go`
- `pkg/collector/processes.go`
- `pkg/collector/os.go`

---

### 2. Journal Reader `[input · Go]`

**Purpose:** Read and analyze systemd journal logs for error detection, boot performance, and service failure analysis.

**Features:**
- Read recent journal entries (`journalctl` output or direct journald API)
- Filter by priority (error, warning, info)
- Detect boot-time failures and slow services
- Track service restarts and crashes
- Identify recurring error patterns (rate-based analysis)

**Implementation:**
- Use `sd-journal` via CGo or shell out to `journalctl` for portable access
- Parse structured journal fields (MESSAGE, PRIORITY, SYSLOG_IDENTIFIER, _SYSTEMD_UNIT)
- Maintain a rolling buffer of last N entries for quick access
- Implement pattern matcher for known Ubuntu error signatures

**Resource Files:**
- `pkg/journal/reader.go`
- `pkg/journal/parser.go`
- `pkg/journal/patterns.go`

---

### 3. Service Checker `[logic · Go]`

**Purpose:** Verify systemd service health — which services are running, failed, or degraded.

**Features:**
- List all systemd services with status (active, inactive, failed, enabled, disabled)
- Check user services (`systemctl --user`)
- Monitor socket-activated and timer-triggered services
- Detect services in failed state and capture their last log lines
- Report services with high restart counts (flapping detection)
- Check for services that should be enabled but aren't

**Implementation:**
- Parse `systemctl list-units --type=service --all --output=json`
- Parse `systemctl is-failed` for each suspect service
- Maintain a service profile cache with expected states

**Resource Files:**
- `pkg/services/checker.go`
- `pkg/services/status.go`
- `pkg/services/profiles.go`

---

### 4. Health Check Engine `[logic · Go]`

**Purpose:** Run diagnostic checks against collected data and thresholds to determine system health.

**Checks Performed:**
- **CPU health:** High load (>80%), temperature throttling, context switch rate anomalies
- **Memory health:** Low memory (<10% free), swap thrashing, OOM risk
- **Disk health:** Disk space (>90% full), SMART warnings, high I/O wait, inode exhaustion
- **Network health:** Interface down, packet loss, high error rates, DNS resolution
- **Kernel health:** Kernel panics in log, module load failures, OOM killer activity
- **Service health:** Failed services, high restart counts, dependency failures
- **System health:** Time sync status, SELinux/AppArmor issues, filesystem errors, corrupted packages
- **Boot health:** Slow boot time, failed boot targets, systemd generator failures

**Scoring:**
- Each check returns: `pass`, `warn`, `fail`, or `error`
- Overall system score: 0-100 (100 = perfectly healthy)
- Critical failures override to `critical` status
- Score history tracked for trend analysis

**Resource Files:**
- `pkg/checks/engine.go`
- `pkg/checks/cpu.go`
- `pkg/checks/memory.go`
- `pkg/checks/disk.go`
- `pkg/checks/network.go`
- `pkg/checks/kernel.go`
- `pkg/checks/services.go`
- `pkg/checks/system.go`
- `pkg/checks/scoring.go`

---

### 5. Diagnostic Database `[database · Go + SQLite]`

**Purpose:** Store diagnostic snapshots, historical data, baselines, and configuration.

**Schema (key tables):**
- `snapshots` — Full diagnostic snapshots (timestamped, JSON payload)
- `checks_history` — Individual check results over time (for trending)
- `thresholds` — Custom threshold overrides
- `baselines` — Learned baseline values (normal CPU/memory/disk ranges)
- `alerts` — Alert history for notification deduplication
- `config` — Application configuration key-value store

**Implementation:**
- Use `modernc.org/sqlite` (pure Go SQLite, no CGo dependency)
- WAL mode for concurrent reads during monitoring
- Auto-prune snapshots older than 30 days (configurable)
- Rolling window of last 1000 check results per check type

**Resource Files:**
- `pkg/db/schema.go`
- `pkg/db/snapshots.go`
- `pkg/db/history.go`
- `pkg/db/baselines.go`
- `pkg/db/alerts.go`
- `pkg/db/config.go`

---

### 6. Config Manager `[logic · Go]`

**Purpose:** Manage configuration, thresholds, check definitions, and user preferences.

**Config File:** `~/.config/sysdiag/config.yaml`

**Settings:**
- Check thresholds (CPU % warn/fail, disk % warn/fail, memory % warn/fail, etc.)
- Enabled/disabled checks
- Monitoring interval (for daemon mode)
- Alert preferences (notifications, silent mode)
- Export preferences (default format, output directory)
- Database retention policy
- Baseline learning mode (on/off/auto)

**Implementation:**
- YAML-based config file with automatic creation on first run
- Environment variable overrides (`SYSDIAG_*`)
- CLI flag overrides (highest priority)
- Validate config on load with sensible defaults
- Config hot-reload via SIGHUP (or inotify for daemon mode)

**Resource Files:**
- `pkg/config/config.go`
- `pkg/config/defaults.go`
- `pkg/config/validate.go`

---

### 7. Continuous Monitor `[logic · Go]`

**Purpose:** Daemon mode — runs periodic health checks and generates alerts for changes.

**Features:**
- Runs as a systemd user service or foreground daemon
- Periodic collection and check runs (default: every 5 minutes)
- Delta detection — only report changes from last snapshot
- Anomaly detection against learned baselines
- Auto-recovery detection (service came back, disk freed up, etc.)
- Graceful degradation if database is unavailable
- Resource-aware scheduling (skip high-CPU checks if system is busy)

**Implementation:**
- Go goroutine with ticker-based scheduling
- Rate-limit collection to avoid CPU spikes
- Maintain in-memory state for fast delta detection
- Implement exponential backoff for repeated failures

**Resource Files:**
- `pkg/monitor/daemon.go`
- `pkg/monitor/scheduler.go`
- `pkg/monitor/delta.go`
- `pkg/monitor/baselines.go`

---

### 8. Report Builder `[output · Go]`

**Purpose:** Generate human-readable and machine-parseable reports from diagnostic data.

**Output Formats:**
- **Terminal** — Color-coded summary with health score, key findings, and sectioned details
- **JSON** — Machine-parseable full report for integration with other tools
- **HTML** — Single-file HTML report with collapsible sections and charts
- **Markdown** — Clean markdown report for pasting into issues, wikis, or documentation
- **Plaintext** — Minimal output for piping to other commands

**Report Sections:**
- Executive summary (health score, critical issues count, system overview)
- Health check results (per-category pass/warn/fail with details)
- System information (collated from collector)
- Recommendations (actionable steps for issues found)
- Historical trends (if history available)

**Implementation:**
- Template-based rendering (Go `text/template` for text, `html/template` for HTML)
- Colorized terminal output with ANSI escape codes
- JSON marshaling of the full report struct
- Streaming output for large reports (don't buffer entire report in memory)

**Resource Files:**
- `pkg/report/builder.go`
- `pkg/report/terminal.go`
- `pkg/report/json.go`
- `pkg/report/html.go`
- `pkg/report/markdown.go`
- `pkg/report/plaintext.go`
- `pkg/report/templates/` (embedded templates)

---

### 9. Alert Engine `[output · Go]`

**Purpose:** Deliver desktop notifications for critical and warning-level findings.

**Notification Methods:**
- **Desktop notifications** via `libnotify` / D-Bus (`notify-send`)
- **Systemd journal** — log alerts with structured fields for journalctl queries
- **Sound alerts** — optional audible alert via `paplay` or `speaker-test`
- **Silent mode** — suppress notifications during certain hours

**Alert Rules:**
- Critical issues → immediate notification
- Warning → bundle into digest (every 15 min)
- Recovery → notify "resolved" with previous alert reference
- Deduplicate identical alerts within 1-hour window
- Rate-limit to max 10 notifications per hour

**Implementation:**
- D-Bus notification via `github.com/esiqveland/notify` Go library
- Fall back to `notify-send` exec if library unavailable
- Alert deduplication via in-memory LRU cache
- Batched digest for non-critical alerts

**Resource Files:**
- `pkg/alerts/engine.go`
- `pkg/alerts/notify.go`
- `pkg/alerts/dedup.go`
- `pkg/alerts/digest.go`

---

### 10. Export Handler `[output · Go]`

**Purpose:** Write diagnostic results and reports to files for sharing, archiving, or further analysis.

**Export Targets:**
- **File export** — Write to `~/sysdiag/exports/<timestamp>-<format>.ext`
- **Pipe export** — Write to stdout for piping (e.g., `sysdiag report --format json | jq`)
- **Archive** — Export multiple snapshots as a tar.gz bundle

**Implementation:**
- Atomic writes with temp files + rename
- Proper file permissions (600 for config, 644 for exports)
- Directory auto-creation on first export
- CLI `--output` flag for custom paths

**Resource Files:**
- `pkg/export/writer.go`
- `pkg/export/formats.go`
- `pkg/export/archive.go`

---

### 11. CLI Commander `[ui · Go]`

**Purpose:** The main entry point and user interface — provides all command modes.

**Command Modes:**
```
sysdiag                      → Quick summary (default mode)
sysdiag scan                 → Full diagnostic scan
sysdiag monitor              → Daemon mode (continuous monitoring)
sysdiag report               → Generate full report
sysdiag status               → Health status overview
sysdiag history              → Show historical trend data
sysdiag alerts               → Manage alerts and view alert history
sysdiag config               → View/edit configuration
sysdiag config set <key> <value>
sysdiag export               → Export diagnostics to file
sysdiag baselines            → View/reset learned baselines
sysdiag version              → Show version info
sysdiag help                 → Show help
```

**Interactive TUI Mode:**
- Dashboard view: real-time system status with health score
- Tabbed sections: CPU, Memory, Disk, Network, Services, Logs
- Color-coded health indicators (green/yellow/red)
- Keyboard navigable with shortcut hints
- Collapsible details for each section

**Implementation:**
- Use `github.com/charmbracelet/bubbletea` for TUI (lightweight, pure Go)
- Use `github.com/spf13/cobra` for CLI command hierarchy
- Use `github.com/charmbracelet/lipgloss` for terminal styling
- Subcommands with `RunE` error handling pattern
- Pretty-print with colorized output for non-TUI modes

**Resource Files:**
- `cmd/sysdiag/main.go`
- `cmd/sysdiag/scan.go`
- `cmd/sysdiag/monitor.go`
- `cmd/sysdiag/report.go`
- `cmd/sysdiag/status.go`
- `cmd/sysdiag/config.go`
- `cmd/sysdiag/export.go`
- `cmd/sysdiag/root.go`
- `pkg/tui/dashboard.go`
- `pkg/tui/views.go`
- `pkg/tui/styles.go`

---

## 🔀 Data Flow

```
1. User runs: sysdiag scan
2. CLI Commander (cobra) parses command → dispatches to scan mode
3. System Collector gathers all system info (concurrent goroutines per category)
4. Journal Reader fetches recent log entries in parallel
5. Service Checker queries systemd service states
6. Health Check Engine runs all checks against configurable thresholds
7. Results stored in SQLite Diagnostic Database (snapshot + individual check results)
8. Report Builder generates formatted output based on --format flag
9. Alert Engine checks for critical findings and sends notifications if needed
10. Export Handler writes to file if --output specified
11. CLI Commander renders the result to terminal
```

---

## 📂 Project Structure (following manifesto preferences)

```
sysdiag/
├── cmd/
│   └── sysdiag/
│       ├── main.go          # Entry point, cobra command registration
│       ├── root.go           # Root command (quick summary)
│       ├── scan.go           # sysdiag scan
│       ├── monitor.go        # sysdiag monitor (daemon)
│       ├── report.go         # sysdiag report
│       ├── status.go         # sysdiag status
│       ├── config.go         # sysdiag config
│       └── export.go         # sysdiag export
├── pkg/
│   ├── collector/            # System information gathering
│   ├── journal/              # Systemd journal reader
│   ├── services/             # Systemd service checker
│   ├── checks/               # Health check engine
│   ├── db/                   # SQLite database layer
│   ├── config/               # Configuration management
│   ├── monitor/              # Continuous monitoring daemon
│   ├── report/               # Report generation
│   ├── alerts/               # Alert engine / notifications
│   ├── export/               # File export / archival
│   └── tui/                  # Terminal UI components
├── go.mod
├── go.sum
├── Makefile
└── README.md
```

---

## 🛠️ Technology Choices (manifesto-aligned)

| Component         | Choice                          | Why                                     |
|-------------------|---------------------------------|-----------------------------------------|
| Language          | Go                              | Linux-native, single binary, perf       |
| Database          | SQLite (`modernc.org/sqlite`)   | Zero deps, no CGo, perfect for desktop  |
| CLI Framework     | `spf13/cobra`                   | De facto standard, subcommand support   |
| TUI Library       | `charmbracelet/bubbletea`       | Lightweight, pure Go, terminal-native   |
| System Info       | `shirou/gopsutil`               | Cross-platform, /proc/sys abstraction   |
| Config            | YAML (hand-parsed)              | Human-readable, no heavy framework      |
| Build System      | Makefile + Go build             | Simple, fast, no toolchain deps         |

---

## 📊 Manifesto Compliance Checklist

| Manifesto Principle                          | How This Architecture Meets It                           |
|----------------------------------------------|----------------------------------------------------------|
| ✅ Monolithic, single-binary                 | Single Go binary, no microservices                       |
| ✅ Layered architecture                      | Collector → Checks → Database → Report → UI              |
| ✅ Linux-native, systemd integration         | systemd service monitoring, journal reading, D-Bus       |
| ✅ Self-contained, no cloud dependencies     | Everything runs offline, SQLite local storage            |
| ✅ CLI tool, not web UI                      | Terminal-based interface, no web components              |
| ✅ SQLite for storage                        | Pure Go SQLite, zero config                              |
| ✅ Feature-based structure                   | `pkg/collector/`, `pkg/checks/`, `pkg/report/`, etc.    |
| ✅ Go for performance-critical               | System info collection, concurrent goroutines            |
| ✅ Actionable error messages                 | Every check tells you what's wrong AND how to fix it     |
| ✅ Fail fast, validate everything            | Input validation on all commands, early exit on bad args |
| ✅ Proper logging, no console.log            | Structured logging to journal/stdout                     |
| ✅ No containers, no orchestration           | No Docker, no K8s, no container references               |
| ✅ Progressive complexity                    | Simple `sysdiag` command works, advanced flags for power users |
| ✅ Data flow first                           | Architecture designed around collect→check→store→report  |
| ✅ No unnecessary abstractions               | No factory patterns, no DI frameworks, plain Go structs  |

---

## 🔜 Development Roadmap

**Phase 1 — Foundation (MVP)**
- [ ] Project scaffolding with cobra CLI
- [ ] System Collector: CPU, memory, disk, network, kernel, OS info
- [ ] SQLite schema + snapshot storage
- [ ] Basic `sysdiag scan` command with terminal output
- [ ] Makefile with `build`, `install`, `test` targets

**Phase 2 — Health Checks**
- [ ] Health Check Engine with 8 check categories
- [ ] Threshold configuration via YAML
- [ ] `sysdiag status` command with health score
- [ ] Report Builder with terminal + JSON output

**Phase 3 — Monitoring & Alerts**
- [ ] Continuous Monitor daemon mode
- [ ] Alert Engine with desktop notifications
- [ ] Service Checker (systemd integration)
- [ ] Journal Reader and log analysis
- [ ] Baseline learning

**Phase 4 — Polish**
- [ ] Interactive TUI dashboard
- [ ] HTML report generation with inline CSS/JS
- [ ] Export handler with archive support
- [ ] Ubuntu package (`.deb`) build
- [ ] man page and shell completion
