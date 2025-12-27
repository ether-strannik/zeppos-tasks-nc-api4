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

### 6. Icon sizes must match ICON_SIZE_SMALL
Icons must be the correct size for the screen. `ICON_SIZE_SMALL` varies by screen width:
- Screen < 390px: `ICON_SIZE_SMALL = 24` → use `icon_s_24/` icons
- Screen >= 390px: `ICON_SIZE_SMALL = 32` → use `icon_s_32/` icons

If icons are wrong size, UI elements (like priority rings) will appear misaligned.

### 7. Widget property updates - use prop.MORE
When updating widget properties like position, use `prop.MORE` for reliability:
```javascript
// May not work reliably
widget.setProperty(hmUI.prop.X, newX);

// More reliable
widget.setProperty(hmUI.prop.MORE, { x: newX });
```

### 8. Row height calculation
When positioning elements inside a row, use `row.config.height` not `row.viewHeight`:
```javascript
// BAD - viewHeight includes +8 padding for row spacing
const y = (row.viewHeight - iconSize) / 2;

// GOOD - config.height is actual row height
const y = (row.config.height - iconSize) / 2;
```

### 9. Widget position cannot be changed after creation
In API 3.0, repositioning a widget after it's been created using `setProperty(prop.X, ...)` or `setProperty(prop.MORE, {x: ...})` may not work reliably. Instead, pass the position offset during widget creation:
```javascript
// BAD - repositioning after creation doesn't work
const row = this.row({ text: "Subtask" });
row.iconView.setProperty(hmUI.prop.X, newX);  // May not work

// GOOD - pass offset in config during creation
const row = this.row({
  text: "Subtask",
  iconOffset: indent  // Applied during widget creation
});
```

### 10. iCalendar properties with parameters
iCalendar properties like `RELATED-TO`, `DTSTART`, `DUE` may have parameters (e.g., `RELATED-TO;RELTYPE=PARENT`). Use a helper to find properties regardless of parameters:
```javascript
// BAD - won't find "RELATED-TO;RELTYPE=PARENT"
this.parentId = vtodo["RELATED-TO"];

// GOOD - finds property with any parameters
this.parentId = this._getPropertyValue(vtodo, "RELATED-TO");

_getPropertyValue(vtodo, propName) {
  if (vtodo[propName] !== undefined) return vtodo[propName];
  for (const key of Object.keys(vtodo)) {
    if (key.startsWith(propName + ";")) return vtodo[key];
  }
  return null;
}
```

### 11. push() and replace() don't pass params correctly
**CRITICAL**: In API 3.0, both `push()` and `replace()` fail to pass the `param` argument to the target page's `onInit()`. The params arrive as `undefined`.

**Workaround**: Store params in config before navigation, read from config as fallback in target page:
```javascript
// Before navigation (source page)
const paramObj = { list_id: this.listId, task_id: this.taskId };
config.set("_editTaskParams", paramObj);
push({
  url: "page/amazfit/TaskEditScreen",
  param: JSON.stringify(paramObj)  // This won't arrive
});

// In target page constructor (onInit)
try {
  param = param ? JSON.parse(param) : {};
} catch(e) {
  param = {};
}

// Fallback: read from config if push() didn't pass params
if (!param.list_id || !param.task_id) {
  const savedParams = config.get("_editTaskParams");
  if (savedParams) {
    param = savedParams;
    config.set("_editTaskParams", null); // Clear after use
  }
}
```

This affects:
- `push()` - navigating to new pages
- `replace()` - reloading current page with new params

### 12. Fixed overlays require VIEW_CONTAINER
GROUP widgets don't support `z_index` or fixed positioning. To create overlays (keyboards, pickers, dialogs) that stay fixed above scrollable content:

```javascript
// BAD - GROUP scrolls with page content
const overlay = hmUI.createWidget(hmUI.widget.GROUP, {
  x: 0, y: 0, w: width, h: height
});

// GOOD - VIEW_CONTAINER with scroll_enable: false stays fixed
const overlay = hmUI.createWidget(hmUI.widget.VIEW_CONTAINER, {
  x: 0,
  y: 0,
  w: width,
  h: height,
  scroll_enable: false,  // Prevents scrolling
  z_index: 10           // Layers above content (higher = on top)
});

// Create child widgets inside the container
const bg = overlay.createWidget(hmUI.widget.FILL_RECT, { ... });
```

Key properties:
- `scroll_enable: false` - Keeps container fixed, won't scroll with page
- `z_index` - Controls layering (0 = bottom, higher = on top)

**For composite pickers** (like DateTimePicker with CalendarPicker + TimePicker):
```javascript
// Parent creates container
this.container = hmUI.createWidget(hmUI.widget.VIEW_CONTAINER, {
  x: 0, y: 0, w: width, h: height,
  scroll_enable: false,
  z_index: 10
});

// Pass container to child components
this.calendarPicker = new CalendarPicker({
  container: this.container,  // Child creates widgets in parent's container
  ...
});

// Child uses container: (this.container || hmUI).createWidget(...)
const btn = (this.container || hmUI).createWidget(hmUI.widget.BUTTON, { ... });
```

**Gesture handling:** Must call `destroy()` to properly clean up:
```javascript
// BAD - widgets stay visible
if (this.dateTimePicker) {
  this.dateTimePicker = null;  // Container still exists!
}

// GOOD - properly clean up
if (this.dateTimePicker) {
  this.dateTimePicker.destroy();  // Removes container and all widgets
  this.dateTimePicker = null;
}
```

### 13. getLanguage() return type
`getLanguage()` from `@zos/settings` may not return a string. Always check type before calling string methods:

```javascript
import { getLanguage } from "@zos/settings";

// BAD - will crash if not a string
const lang = getLanguage();
const userLang = lang.substring(0, 2);

// GOOD - check type first
let userLang = "en";
try {
  const lang = getLanguage();
  if (typeof lang === 'string') {
    userLang = lang.substring(0, 2);
  }
} catch(e) {
  // Fallback to "en"
}
```

### 14. hmApp.setLayerY() removed
`hmApp.setLayerY()` is not available in API 3.0. Use `scrollTo()` from `@zos/page`:

```javascript
// API 1.0
hmApp.setLayerY(0);  // Scroll to top

// API 3.0
import { scrollTo } from "@zos/page";
scrollTo({ y: 0 });  // Scroll to top
```

However, `scrollTo()` won't prevent widgets from scrolling - for fixed overlays use VIEW_CONTAINER (see pitfall #12).

### 15. back() reconstructs previous page
**CRITICAL**: In API 3.0, `back()` **reconstructs** the previous page instead of just resuming it. This means all instance variables are lost.

**Impact:** When you navigate Screen A → push to Screen B → back to Screen A, Screen A's constructor is called again with params=undefined.

**Workaround:** Before navigating with `push()`, store the current page's params in config so they're available when it gets reconstructed on `back()`:

```javascript
// Screen A - before navigating to picker/child screen
showCategoryPicker() {
  // Store params for the picker screen
  config.set("_categoryPickerParams", { listId, taskId, ... });

  // ALSO store current screen params - we'll be reconstructed on back()
  config.set("_editTaskParams", { list_id: this.listId, task_id: this.taskId });

  push({
    url: "page/amazfit/CategoryPickerScreen",
    param: JSON.stringify(pickerParams)
  });
}
```

This is required for ANY screen that:
1. Uses `push()` to navigate to a child screen
2. Expects to be resumed when the child calls `back()`
3. Relies on instance variables or params to function

In API 1.0, `back()` would resume the previous page. In API 3.0, it **reconstructs** it from scratch.

### 16. Geolocation sensor API changed
**CRITICAL**: In API 3.0, the GPS/geolocation sensor uses a completely different API. The global `hmSensor` doesn't exist.

**API 1.0 (doesn't work in API 3.0):**
```javascript
// Global hmSensor - doesn't exist in API 3.0
if (typeof hmSensor !== 'undefined' && hmSensor.id.GEOLOCATION) {
  const geolocation = hmSensor.createSensor(hmSensor.id.GEOLOCATION);
  geolocation.start();
  // Access via properties
  const lat = geolocation.latitude;
  const lon = geolocation.longitude;
}
```

**API 3.0:**
```javascript
import { Geolocation } from "@zos/sensor";

// Create instance
const geolocation = new Geolocation();

// Start and register callback
geolocation.start();
geolocation.onChange(() => {
  // Check status: 'A' = active/valid, 'V' = invalid
  if (geolocation.getStatus() === 'A') {
    // Get coordinates via methods (not properties)
    const lat = geolocation.getLatitude();
    const lon = geolocation.getLongitude();

    // Use coordinates...
    geolocation.stop();
  }
});
```

**Key differences:**
- Import from `@zos/sensor` instead of global `hmSensor`
- Use `new Geolocation()` constructor
- Check `getStatus()` - only read coordinates when status is `'A'`
- Use methods `getLatitude()` and `getLongitude()` (not properties)
- Requires permission: `"device:os.geolocation"` in app.json

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
| `hmSensor` | `@zos/sensor` (or use JS `Date` for time) |
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
