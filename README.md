# ZeppOS Nextcloud Tasks

> **🔄 Nextcloud-Focused Fork** of [melianmiko/ZeppOS-Tasks](https://github.com/melianmiko/ZeppOS-Tasks)  
> This version focuses exclusively on Nextcloud/CalDAV synchronization.

## ⚠️ Major Changes from Original
- Focus: Nextcloud/CalDAV only
- Other sync providers (Google, Microsoft) will be removed/deprecated
- Enhanced Nextcloud-specific features
- Simplified configuration

---

## Build Instructions

Required software:
- Python 3.10+
- NodeJS and [ZeppOS CLI Tools](https://docs.zepp.com/docs/guides/tools/cli/)

### Building

Clone this project **recursively**:
```bash
git clone --recursive https://github.com/ether-strannik/ZeppOS-Nextcloud-Tasks.git
```

Build assets for all devices:
```bash
python3 prepare_all.py
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

For architecture details or self-hosting instructions, see [doc/proxy.md](doc/proxy.md)

---

**Original project:** [melianmiko/ZeppOS-Tasks](https://github.com/melianmiko/ZeppOS-Tasks)