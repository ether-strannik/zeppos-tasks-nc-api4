# ZeppOS API 1.0 to API 3.0 Transition Guide

This document tracks all the differences discovered during the migration from ZeppOS API 1.0 to API 3.0.

## Table of Contents
- [Imports](#imports)
- [Router / Navigation](#router--navigation)
- [UI Events](#ui-events)
- [Assets / Icons](#assets--icons)
- [BLE / Messaging](#ble--messaging)
- [Timer](#timer)
- [Page Lifecycle](#page-lifecycle)
- [Common Pitfalls](#common-pitfalls)

---

## Imports

### API 1.0 (Globals)
In API 1.0, most APIs were available as globals:
```javascript
// No imports needed - these were global
hmUI.createWidget(...)
hmApp.gotoPage(...)
hmFS.open(...)
hmSetting.getDeviceInfo()
```

### API 3.0 (ESM Imports)
In API 3.0, everything must be imported:
```javascript
import hmUI from "@zos/ui";
import { push, replace, back } from "@zos/router";
import { openSync, readSync } from "@zos/fs";
import { getDeviceInfo } from "@zos/device";
```

---

## Router / Navigation

| API 1.0 | API 3.0 | Module |
|---------|---------|--------|
| `hmApp.gotoPage()` | `push()` | `@zos/router` |
| `hmApp.reloadPage()` | `replace()` | `@zos/router` |
| `hmApp.goBack()` | `back()` | `@zos/router` |
| `hmApp.gotoHome()` | `home()` | `@zos/router` |
| `hmApp.exit()` | `exit()` | `@zos/router` |
| `hmApp.startApp()` | `launchApp()` | `@zos/router` |

### Example
```javascript
// API 1.0
hmApp.reloadPage({
  url: "page/index",
  param: JSON.stringify({ id: 123 })
});

// API 3.0
import { replace } from "@zos/router";
replace({
  url: "page/index",
  param: JSON.stringify({ id: 123 })
});
```

---

## UI Events

### API 1.0
Events were accessed via `hmUI.event`:
```javascript
widget.addEventListener(hmUI.event.CLICK_UP, callback);
```

### API 3.0
Events must be imported separately:
```javascript
import { event } from "@zos/ui";
widget.addEventListener(event.CLICK_UP, callback);
```

### Available Events
- `event.CLICK_UP` - Touch release
- `event.CLICK_DOWN` - Touch press
- `event.MOVE` - Touch move
- `event.MOVE_IN` - Move into widget
- `event.MOVE_OUT` - Move out of widget

---

## Assets / Icons

### Folder Structure
API 3.0 uses a different asset folder structure based on screen shape:

| Screen Type | Folder | app.json setting |
|-------------|--------|------------------|
| Round screens | `assets/common.r/` | `"st": "r"` |
| Square screens | `assets/common.s/` | `"st": "s"` |

### Icon Placement
Icons referenced in code like `icon_s/about.png` must be placed in the correct platform folder:
```
assets/
  common.r/           <- For round screen devices
    icon_s/
      about.png
      cb_true.png
      cb_false.png
    icon_m/
      more.png
    spinner/
      img_0.png
      ...
  common.s/           <- For square screen devices
    icon_s/
    icon_m/
```

### app.json Platform Configuration
```json
{
  "targets": {
    "common": {
      "platforms": [
        {
          "st": "r"   // "r" = round, "s" = square
        }
      ]
    }
  }
}
```

---

## BLE / Messaging

### API 1.0
BLE was accessed via global `hmBle`:
```javascript
hmBle.mst.on('message', callback);
```

### API 3.0
BLE must be imported, but only on the device side (not side-app):
```javascript
// Device side only
import * as ble from "@zos/ble";

// Or use require for conditional loading
let hmBle = null;
if (typeof messaging === 'undefined') {
  // We're on device, not side-app
  hmBle = require('@zos/ble');
}
```

### Detection Pattern
To detect if running on device vs side-app:
```javascript
function isOnDevice() {
  // Side-app has 'messaging' global, device doesn't
  return typeof messaging === 'undefined';
}
```

---

## Timer

### API 1.0
```javascript
timer.createTimer(delay, period, callback);
timer.stopTimer(timerId);
```

### API 3.0
```javascript
import { createTimer, stopTimer } from "@zos/timer";
// Or
import * as timer from "@zos/timer";
```

---

## Page Lifecycle

### Status Bar
```javascript
// API 3.0
import { setStatusBarVisible, updateStatusBarTitle } from "@zos/ui";

setStatusBarVisible(true);
updateStatusBarTitle("Page Title");
```

### Display Settings
```javascript
// API 3.0
import { setWakeUpRelaunch, setPageBrightTime } from "@zos/display";

setWakeUpRelaunch({ relaunch: true });
setPageBrightTime({ brightTime: 15000 });
```

### Scroll Mode
```javascript
// API 3.0
import { setScrollMode } from "@zos/page";
```

### Gestures
```javascript
// API 3.0
import { onGesture, GESTURE_UP, GESTURE_DOWN, GESTURE_LEFT, GESTURE_RIGHT } from "@zos/interaction";

onGesture({
  callback: (event) => {
    if (event === GESTURE_DOWN) {
      // Handle swipe down
      return true; // Consume event
    }
    return false;
  }
});
```

---

## Common Pitfalls

### 1. JSON.parse on undefined params
Page params may be undefined. Always wrap in try-catch:
```javascript
// BAD
const params = JSON.parse(params);

// GOOD
try {
  params = params ? JSON.parse(params) : {};
} catch(e) {
  params = {};
}
```

### 2. Using reloadPage instead of replace
`reloadPage` doesn't exist in API 3.0 - use `replace`:
```javascript
// BAD - will throw "not a function"
import { reloadPage } from "@zos/router";

// GOOD
import { replace } from "@zos/router";
```

### 3. Using hmUI.event instead of importing event
```javascript
// BAD - hmUI.event is undefined
widget.addEventListener(hmUI.event.CLICK_UP, cb);

// GOOD
import { event } from "@zos/ui";
widget.addEventListener(event.CLICK_UP, cb);
```

### 4. Assets in wrong folder
Icons won't display if placed in `assets/` root instead of `assets/common.r/` or `assets/common.s/`.

### 5. BLE import on side-app
Importing `@zos/ble` on the side-app will fail. Use conditional loading:
```javascript
let hmBle = null;
if (typeof messaging === 'undefined') {
  hmBle = require('@zos/ble');
}
```

---

## Module Reference

| API 1.0 Global | API 3.0 Module |
|----------------|----------------|
| `hmUI` | `@zos/ui` |
| `hmApp` | `@zos/router` |
| `hmFS` | `@zos/fs` |
| `hmSetting` | `@zos/settings` |
| `hmBle` | `@zos/ble` |
| `timer` | `@zos/timer` |
| `hmSensor` | `@zos/sensor` |
| - | `@zos/device` |
| - | `@zos/display` |
| - | `@zos/page` |
| - | `@zos/interaction` |
| - | `@zos/alarm` |

---

## Resources

- [ZeppOS Migration Guide](https://docs.zepp.com/docs/guides/version-info/migration-guide/)
- [ZeppOS 3.0 New Features](https://docs.zepp.com/docs/guides/version-info/new-features-30/)
- [ZeppOS API Reference](https://docs.zepp.com/docs/reference/device-app-api/newAPI/)
