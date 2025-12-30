# ZeppOS Nextcloud Tasks

> **🔄 Nextcloud-Focused Fork** of [melianmiko/ZeppOS-Tasks](https://github.com/melianmiko/ZeppOS-Tasks)  
> This version focuses exclusively on Nextcloud/CalDAV synchronization.

## ⚠️ Major Changes from Original
- **Nextcloud/CalDAV only** - Google Tasks, Microsoft To Do, and TickTick removed
- **ZeppOS API 4.2** - Complete rewrite from API 1.0
- **Native keyboard** - Uses SYSTEM_KEYBOARD (replaces ScreenBoard)
- **App-based reminders** - Alarms trigger even when app is closed
- **Local lists** - Offline task lists stored on device
- **English only** - All translations removed
- **Renamed to "Tasks NC"**
- ...and more - See [CHANGELOG.md](CHANGELOG.md) for full details

---

## Requirements

- **ZeppOS API Level 4.2+** - Required for native keyboard support (SYSTEM_KEYBOARD)
- Devices must support API 4.2 or higher

## Build Instructions

Required software:
- NodeJS and [ZeppOS CLI Tools](https://docs.zepp.com/docs/guides/tools/cli/)

### Building

Clone this project:
```bash
git clone https://github.com/ether-strannik/ZeppOS-Nextcloud-Tasks.git
cd ZeppOS-Nextcloud-Tasks
```

Deploy to watch:
```bash
zeus login    # First time only - links to your Zepp developer account
zeus preview  # Generates QR code in terminal
```
In Zepp app → [Developer Mode](https://docs.zepp.com/docs/guides/tools/zepp-app/) → Scan → scan the QR code to install.

Alternatively, use Bridge mode for real-time deployment without QR scanning.

Build distributable package:
```bash
zeus build
```
Creates `.zab` file in `dist/` folder.

### Nextcloud Setup

**Prerequisites:**
- Nextcloud server with [Tasks app](https://apps.nextcloud.com/apps/tasks) installed

**Configuration:**
1. Install the app on your Amazfit watch via Zepp app
2. Open app settings in Zepp app (Tasks NC)
3. Enter your settings:
   - **Server URL**: Full CalDAV path, e.g., `https://cloud.example.com/remote.php/dav`
   - **Username**: Your Nextcloud username
   - **Password**: If two-factor authentication is enabled, you must create and use an [app password](https://docs.nextcloud.com/server/latest/user_manual/en/session_management.html#managing-devices)
   - **Proxy URL** (optional): Leave empty to use the default shared proxy, or enter your own proxy URL if self-hosting
4. Tap "Save configuration"

**Why a proxy?**

Zepp OS only supports GET and POST HTTP methods, but CalDAV requires PROPFIND, REPORT, PUT, and DELETE. Direct Nextcloud sync is not possible without the proxy. The proxy translates POST requests with `X-HTTP-Method-Override` headers into proper CalDAV methods.

For self-hosting instructions, see the [CalDAV Proxy](https://github.com/ether-strannik/caldav-proxy) repository.

---

**Original project:** [melianmiko/ZeppOS-Tasks](https://github.com/melianmiko/ZeppOS-Tasks)