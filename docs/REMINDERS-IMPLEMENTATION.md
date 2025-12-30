# App-Based Reminders Implementation Plan

## Overview

This document describes the implementation of an app-based reminder system for ZeppOS Tasks NC. The system enhances existing CalDAV VALARM reminders with persistent, interactive alerts featuring vibration, sound, and snooze functionality.

### Goals

1. **Persistent alerts** - Full-screen popup that stays active until user dismisses
2. **Rich feedback** - Continuous vibration and looping alarm sound
3. **Interactive actions** - Complete task, snooze, or dismiss from popup
4. **Flexible snooze** - User-selectable snooze duration via time picker
5. **CalDAV integration** - Works with existing VALARM trigger system
6. **Reliable delivery** - OS-managed alarms survive app restarts

### Non-Goals (Initial Release)

- Local task support (CalDAV only first)
- Recurring task alarms (RRULE support)
- Quick snooze presets (single TimePicker only)
- Visual notification counter on HomeScreen

---

## Mental Model

### Core Concept

**App-based reminders = Enhanced alert delivery for existing VALARM triggers**

Users continue to set reminder times via the existing "Set reminder" flow (ReminderPickerScreen). App-based reminders provide an optional enhancement layer that:
- Uses ZeppOS alarm API for OS-level scheduling
- Launches full-screen popup instead of passive notifications
- Allows task completion directly from alert
- Supports indefinite snoozing

### Relationship to Existing Systems

```
┌─────────────────────────────────────────────────────────┐
│ Existing CalDAV Reminder System (VALARM)               │
│                                                         │
│ User sets reminder via ReminderPickerScreen             │
│   → Creates VALARM:TRIGGER:-PT1H (1 hour before)       │
│   → Phone receives notification at trigger time        │
│   → Watch shows passive notification (short vibration) │
└─────────────────────────────────────────────────────────┘

                            ↓ Enhanced by

┌─────────────────────────────────────────────────────────┐
│ New App-Based Reminder System                          │
│                                                         │
│ User enables app-based alerts for task                 │
│   → Parses existing VALARM triggers                    │
│   → Creates OS alarms at trigger times                 │
│   → Launches full-screen popup when triggered          │
│   → Continuous vibration + looping sound               │
│   → Interactive: Complete, Snooze, Dismiss             │
└─────────────────────────────────────────────────────────┘
```

**Key insight**: App-based reminders don't replace VALARM, they enhance it. The VALARM system defines WHEN alarms trigger, app-based reminders define HOW they're presented.

---

## What We're Taking from Smart Timers

### Source Project

**Location**: `C:\Users\strannik\Documents\Sync\Documents\00-Projects\github\00-coding\projects\ZeppOS-Smart-Timers`

**Relevant commit**: API 4.2 compatible, tested alarm system

### Components to Reuse

#### 1. Alarm Scheduling Pattern

**From**: `components/time/selectTime.js` - `setupAlarm()` function

**Key code pattern**:
```javascript
import * as alarmMgr from "@zos/alarm";

const alarmObj = {
    url: 'app-service/index',
    time: Math.floor(triggerTime.getTime() / 1000),  // Unix timestamp
    repeat_type: alarmMgr.REPEAT_ONCE,
    param: 'task_[uid]_[timestamp]_[title]|V1|C|S1'  // Custom param string
};

const alarmId = alarmMgr.set(alarmObj);
```

**Adaptation for Tasks**:
- Change `url` to point to our app-service
- Use task-specific param format
- Store alarm IDs for lifecycle management

#### 2. App-Service Trigger Handler

**From**: `app-service/index.js`

**Key code pattern**:
```javascript
AppService({
    onInit(params) {
        console.log('AppService onInit, params:', params);

        // Store params for popup
        globalData.localStorage.setItem('pending_alarm', params);

        // Launch popup page
        launchApp({
            appId: 1056908,  // Smart Timers app ID
            url: 'pages/alarm-popup',
            params: params
        });
    }
});
```

**Adaptation for Tasks**:
- Change app ID to Tasks NC (1023438)
- Add task-specific param detection (`params.startsWith('task_')`)
- Launch `page/amazfit/TaskReminderPopup` instead

#### 3. Full-Screen Alert Popup

**From**: `pages/alarm-popup.js`

**Key patterns to reuse**:

a) **Screen persistence**:
```javascript
onInit(params) {
    hmApp.setScreenKeep(true);
    setWakeUpRelaunch({ relaunch: true });
}

onDestroy() {
    hmApp.setScreenKeep(false);
}
```

b) **Vibration control**:
```javascript
import { Vibrator, VIBRATOR_SCENE_TIMER, VIBRATOR_SCENE_NOTIFICATION } from "@zos/sensor";

startAlarmVibration() {
    const vibrationMode = vibrationType === 'C' ?
        VIBRATOR_SCENE_TIMER :      // Continuous (500ms long)
        VIBRATOR_SCENE_NOTIFICATION; // Non-continuous (two short)

    vibrator = new Vibrator();
    vibrator.start();
    vibrator.setMode(vibrationMode);
    vibrator.start();
}

// In button click handler:
vibrator.stop();
```

c) **Sound playback with looping**:
```javascript
import { create, id } from "@zos/media";

startAlarmSound() {
    alarmPlayer = create(id.PLAYER);

    alarmPlayer.addEventListener(alarmPlayer.event.PREPARE, (result) => {
        if (result) alarmPlayer.start();
    });

    // Loop audio when complete
    alarmPlayer.addEventListener(alarmPlayer.event.COMPLETE, () => {
        alarmPlayer.prepare();  // Re-prepare triggers PREPARE event → start()
    });

    alarmPlayer.setSource(alarmPlayer.source.FILE, { file: 'task-alarm.mp3' });
    alarmPlayer.prepare();
}

// In button click handler:
alarmPlayer.stop();
```

d) **Snooze alarm creation**:
```javascript
// In Snooze button handler:
click_func: () => {
    const snoozeDuration = 15;  // Minutes (from user picker)
    const snoozeTime = Math.floor(Date.now() / 1000) + (snoozeDuration * 60);

    // Preserve original settings
    const settingsStr = buildAlarmSettingsString({
        vibrationEnabled: originalSettings.vibrationEnabled,
        vibrationType: originalSettings.vibrationType,
        soundEnabled: originalSettings.soundEnabled
    });

    const option = {
        url: 'app-service/index',
        time: snoozeTime,
        repeat_type: alarmMgr.REPEAT_ONCE,
        param: `task_${taskUID}_${snoozeTime}_${taskTitle}|${settingsStr}`
    };

    const alarmId = alarmMgr.set(option);

    // Stop vibration/sound
    vibrator.stop();
    alarmPlayer.stop();

    // Return to main screen
    replace({ url: 'page/amazfit/HomeScreen' });
}
```

**Adaptation for Tasks**:
- Parse task UID from params to load full task data
- Display task title + notes (description) + due date
- Replace "STOP" button with "Complete Task" (marks COMPLETED in CalDAV)
- Replace "SNOOZE" with time picker flow
- Add "Dismiss" button (just stops alerts)

#### 4. Settings String Pattern

**From**: `utils/utils.js`

**Key functions**:
```javascript
// Parse settings from param string
export function parseAlarmSettings(paramString) {
    // Format: "...|V1|C|S1|..."
    const match = paramString.match(/[atc]_\d+_(.*?)(?:_=|$)/);
    const parts = match[1].split('|');

    return {
        vibrationEnabled: parts[3] !== 'V0',  // V1 = enabled, V0 = disabled
        vibrationType: parts[4] || 'C',       // C = continuous, N = non-continuous
        soundEnabled: parts[5] !== 'S0'       // S1 = enabled, S0 = disabled
    };
}

// Build settings string
export function buildAlarmSettingsString(config) {
    const vibration = config.vibrationEnabled !== false ? 'V1' : 'V0';
    const vibrationType = config.vibrationType || 'C';
    const sound = config.soundEnabled !== false ? 'S1' : 'S0';

    return `${vibration}|${vibrationType}|${sound}`;
}
```

**Adaptation for Tasks**:
- Simplify param format: `task_[uid]_[timestamp]_[title]|V1|C|S1`
- Remove unused fields (alarm presets, repeat markers)
- Keep vibration and sound toggles

#### 5. Assets

**From**: `assets/common.r/test-alarm.mp3`

**Action**: Copy to Tasks NC as `assets/common.r/task-alarm.mp3`

---

## Data Model

### Local Config Storage Structure

```javascript
config.set("appReminders", {
    // Key: CalDAV task UID
    "caldav-uuid-123": {
        enabled: true,
        vibrationEnabled: true,
        vibrationType: 'C',        // 'C' = Continuous, 'N' = Non-continuous
        soundEnabled: true,
        alarmIds: [456, 457, 458]  // All OS alarm IDs (VALARM + snoozed)
    },

    "caldav-uuid-456": {
        enabled: true,
        vibrationEnabled: false,   // User disabled vibration
        vibrationType: 'N',
        soundEnabled: true,
        alarmIds: [460]
    }
});
```

**Key points**:
- Stored in local config (watch-specific, not synced to CalDAV)
- One entry per task (identified by CalDAV UID)
- `alarmIds` tracks all OS alarms for cleanup (initial VALARM alarms + snoozed alarms)
- Settings apply to all VALARM triggers within the task

### OS Alarm Param Format

```
task_[taskUID]_[timestamp]_[taskTitle]|V[0/1]|[C/N]|S[0/1]

Components:
- Prefix: "task_" - Identifies task alarms (vs other alarm types)
- Task UID: CalDAV UID - For loading full task data
- Timestamp: Unix timestamp - When alarm fires (for logging)
- Task Title: Task summary - For popup display
- Settings: V1|C|S1 - Vibration, type, sound flags

Example:
task_caldav-uuid-123_1736949600_Submit project report|V1|C|S1

Parsed as:
- taskUID: "caldav-uuid-123"
- timestamp: 1736949600 (2025-01-15 13:00:00 UTC)
- title: "Submit project report"
- vibrationEnabled: true (V1)
- vibrationType: 'C' (Continuous)
- soundEnabled: true (S1)
```

### Task Object Extensions

No modifications to CalDAV task structure. All app-reminder data lives in local config.

**Rationale**: App-based reminders are watch-specific preferences, not task metadata. Different users may want different alert settings for the same task.

---

## User Workflows

### Workflow 1: Enable App-Based Reminders

```
┌─────────────────────────────────────────────────────────┐
│ 1. User has task with existing VALARM                  │
├─────────────────────────────────────────────────────────┤
│ Task: "Submit project report"                          │
│ DUE: 2025-01-15T14:00:00Z                              │
│ VALARM: TRIGGER:-PT1H (1 hour before → 13:00)          │
│ VALARM: TRIGGER:-PT15M (15 min before → 13:45)         │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ 2. User opens TaskEditScreen                           │
├─────────────────────────────────────────────────────────┤
│ Clicks "App-based reminders" button                    │
│ (Shows status: "App-based reminders" if disabled)      │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ 3. AppBasedReminderSettings screen opens               │
├─────────────────────────────────────────────────────────┤
│ ☐ Enable for this task                                 │
│                                                         │
│ Vibration                                               │
│ ☑ ON          Type: [Continuous]                       │
│                                                         │
│ Sound                                                   │
│ ☑ ON                                                    │
│                                                         │
│ [SAVE]                                                  │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ 4. User checks "Enable for this task" and clicks SAVE  │
├─────────────────────────────────────────────────────────┤
│ System actions:                                         │
│ 1. Parse VALARM triggers: [-PT1H, -PT15M]              │
│ 2. Calculate absolute times:                           │
│    - DUE: 2025-01-15 14:00                             │
│    - Trigger 1: 14:00 - 1h = 13:00                     │
│    - Trigger 2: 14:00 - 15m = 13:45                    │
│ 3. Create 2 OS alarms:                                 │
│    - Alarm 456 at 13:00 with param:                    │
│      "task_caldav-uuid-123_1736949600_Submit...│V1|C|S1"│
│    - Alarm 457 at 13:45 with param:                    │
│      "task_caldav-uuid-123_1736952300_Submit...│V1|C|S1"│
│ 4. Save to config:                                      │
│    appReminders["caldav-uuid-123"] = {                  │
│        enabled: true,                                   │
│        vibrationEnabled: true,                          │
│        vibrationType: 'C',                              │
│        soundEnabled: true,                              │
│        alarmIds: [456, 457]                             │
│    }                                                    │
│ 5. Navigate back to TaskEditScreen                     │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ 5. TaskEditScreen now shows updated status             │
├─────────────────────────────────────────────────────────┤
│ "App-based reminders: Enabled"                         │
└─────────────────────────────────────────────────────────┘
```

### Workflow 2: Alarm Triggers and Snooze

```
┌─────────────────────────────────────────────────────────┐
│ 1. First alarm triggers at 13:00                       │
├─────────────────────────────────────────────────────────┤
│ ZeppOS alarm manager triggers alarm ID 456              │
│ → Calls app-service/index.js with param:               │
│   "task_caldav-uuid-123_1736949600_Submit...│V1|C|S1"   │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ 2. App-service launches TaskReminderPopup              │
├─────────────────────────────────────────────────────────┤
│ launchApp({                                             │
│     url: 'page/amazfit/TaskReminderPopup',              │
│     params: "task_caldav-uuid-123_..."                  │
│ })                                                      │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Popup displays (full-screen, black background)      │
├─────────────────────────────────────────────────────────┤
│   Submit project report                                 │
│                                                         │
│   Remember to include appendix                         │
│                                                         │
│   Due: Today at 14:00                                   │
│                                                         │
│ ┌────────────────────────────────┐                      │
│ │      Complete Task             │                      │
│ └────────────────────────────────┘                      │
│ ┌────────────────────────────────┐                      │
│ │         Snooze                 │                      │
│ └────────────────────────────────┘                      │
│ ┌────────────────────────────────┐                      │
│ │        Dismiss                 │                      │
│ └────────────────────────────────┘                      │
│                                                         │
│ (Continuous vibration + looping sound active)          │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ 4. User clicks "Snooze"                                 │
├─────────────────────────────────────────────────────────┤
│ 1. Stop vibration/sound                                 │
│ 2. Open DurationPickerScreen (time picker)             │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ 5. DurationPickerScreen displays                       │
├─────────────────────────────────────────────────────────┤
│   Select snooze duration                                │
│                                                         │
│   [ 0  ] Hours                                          │
│   [ 15 ] Minutes  ← User selects                        │
│                                                         │
│   [DONE]                                                │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ 6. User clicks DONE                                     │
├─────────────────────────────────────────────────────────┤
│ System actions:                                         │
│ 1. Calculate snooze time: NOW + 15 min = 13:15         │
│ 2. Create new alarm:                                    │
│    param: "task_caldav-uuid-123_1736949900_Submit...│V1|C|S1" │
│    time: 1736949900 (13:15)                             │
│    → Returns alarm ID 458                               │
│ 3. Update config:                                       │
│    appReminders["caldav-uuid-123"].alarmIds.push(458)   │
│ 4. Navigate to HomeScreen                               │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ 7. At 13:15, snoozed alarm triggers                    │
├─────────────────────────────────────────────────────────┤
│ Popup shows SAME task info again:                       │
│ - Same title: "Submit project report"                  │
│ - Same notes: "Remember to include appendix"           │
│ - Same buttons (user can snooze again)                 │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ 8. At 13:45, second VALARM alarm triggers              │
├─────────────────────────────────────────────────────────┤
│ Alarm ID 457 (independent of snooze)                    │
│ Popup shows same task (separate alarm trigger)         │
└─────────────────────────────────────────────────────────┘
```

### Workflow 3: Complete Task from Popup

```
┌─────────────────────────────────────────────────────────┐
│ 1. User clicks "Complete Task" in popup                │
├─────────────────────────────────────────────────────────┤
│ System actions:                                         │
│ 1. Stop vibration and sound                             │
│ 2. Load task by UID: "caldav-uuid-123"                 │
│ 3. Mark task:                                           │
│    - task.status = "COMPLETED"                          │
│    - task.completed = true                              │
│ 4. Get all alarm IDs from config:                       │
│    appReminders["caldav-uuid-123"].alarmIds             │
│    → [456, 457, 458] (original + snoozed)              │
│ 5. Cancel all OS alarms:                                │
│    alarmMgr.cancel(456)                                 │
│    alarmMgr.cancel(457)                                 │
│    alarmMgr.cancel(458)                                 │
│ 6. Sync task to CalDAV server                           │
│    tasksProvider.updateTask(task)                       │
│ 7. Remove from config:                                  │
│    delete appReminders["caldav-uuid-123"]               │
│ 8. Navigate to HomeScreen                               │
└─────────────────────────────────────────────────────────┘
```

### Workflow 4: Disable App-Based Reminders

```
┌─────────────────────────────────────────────────────────┐
│ 1. User opens TaskEditScreen                           │
├─────────────────────────────────────────────────────────┤
│ Clicks "App-based reminders: Enabled"                  │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ 2. AppBasedReminderSettings screen opens               │
├─────────────────────────────────────────────────────────┤
│ ☑ Enable for this task  ← Currently checked            │
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ 3. User unchecks "Enable for this task"                │
├─────────────────────────────────────────────────────────┤
│ Clicks SAVE                                             │
│                                                         │
│ System actions:                                         │
│ 1. Get alarm IDs: [456, 457, 458]                      │
│ 2. Cancel all OS alarms                                 │
│ 3. Update config:                                       │
│    appReminders["caldav-uuid-123"].enabled = false      │
│    appReminders["caldav-uuid-123"].alarmIds = []        │
│ 4. Navigate back                                        │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ 4. TaskEditScreen shows updated status                 │
├─────────────────────────────────────────────────────────┤
│ "App-based reminders"  ← No longer shows "Enabled"     │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Foundation (VALARM Parser + Alarm Manager)

**Objective**: Create core utilities for parsing VALARM and managing OS alarms

**Files to create**:

#### `utils/valarm-parser.js`

```javascript
/**
 * Parse VALARM TRIGGER values from CalDAV task
 *
 * TRIGGER formats (RFC 5545):
 * - Duration before/after: -PT15M (15 min before), -PT1H (1 hour before)
 * - Absolute datetime: 20250115T130000Z
 * - Relative to: TRIGGER;RELATED=START:-PT15M (before start)
 *                TRIGGER;RELATED=END:-PT15M (before due/end)
 *
 * @param {Object} task - CalDAV task object with valarm property
 * @returns {Array} Array of trigger offset objects
 *
 * Example:
 * parseVALARM(task) → [
 *   { offset: -60, unit: 'minutes' },   // -PT1H
 *   { offset: -15, unit: 'minutes' }    // -PT15M
 * ]
 */
export function parseVALARM(task) {
    if (!task.valarm || task.valarm.length === 0) {
        return [];
    }

    const triggers = [];

    for (const alarm of task.valarm) {
        if (!alarm.trigger) continue;

        // Parse ISO 8601 duration format: -PT1H15M
        // P = Period, T = Time separator
        // H = Hours, M = Minutes, S = Seconds
        const match = alarm.trigger.match(/^(-)?P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

        if (match) {
            const negative = match[1] === '-';
            const days = parseInt(match[2] || 0);
            const hours = parseInt(match[3] || 0);
            const minutes = parseInt(match[4] || 0);
            const seconds = parseInt(match[5] || 0);

            // Convert to total minutes
            let totalMinutes = (days * 24 * 60) + (hours * 60) + minutes + (seconds / 60);
            if (negative) totalMinutes = -totalMinutes;

            triggers.push({ offset: totalMinutes, unit: 'minutes' });
        }
    }

    return triggers;
}

/**
 * Calculate absolute trigger times from VALARM offsets
 *
 * @param {Object} task - CalDAV task with due date and valarm
 * @returns {Array} Array of Date objects representing trigger times
 *
 * Example:
 * Task: DUE: 2025-01-15T14:00:00Z, VALARM: -PT1H
 * calculateTriggerTimes(task) → [Date('2025-01-15T13:00:00Z')]
 */
export function calculateTriggerTimes(task) {
    if (!task.due) {
        console.log('Task has no due date, cannot calculate trigger times');
        return [];
    }

    const dueDate = new Date(task.due);
    const triggers = parseVALARM(task);

    return triggers.map(trigger => {
        const offsetMs = trigger.offset * 60 * 1000; // Convert minutes to milliseconds
        return new Date(dueDate.getTime() + offsetMs);
    });
}
```

#### `utils/app-reminder-manager.js`

```javascript
import * as alarmMgr from "@zos/alarm";
import { calculateTriggerTimes } from "./valarm-parser";

const { config } = getApp()._options.globalData;

/**
 * Build OS alarm param string for task reminder
 *
 * Format: task_[uid]_[timestamp]_[title]|V[0/1]|[C/N]|S[0/1]
 */
function buildTaskAlarmParam(taskUID, taskTitle, timestamp, settings) {
    const vibration = settings.vibrationEnabled ? 'V1' : 'V0';
    const vibrationType = settings.vibrationType || 'C';
    const sound = settings.soundEnabled ? 'S1' : 'S0';

    const settingsStr = `${vibration}|${vibrationType}|${sound}`;

    return `task_${taskUID}_${timestamp}_${taskTitle}|${settingsStr}`;
}

/**
 * Parse OS alarm param string
 *
 * @param {string} param - Alarm param from OS
 * @returns {Object} Parsed components
 */
export function parseTaskAlarmParam(param) {
    const match = param.match(/task_(.+?)_(\d+)_(.+?)\|(.+)/);

    if (!match) {
        return null;
    }

    const [, taskUID, timestamp, taskTitle, settingsStr] = match;
    const [vibration, vibrationType, sound] = settingsStr.split('|');

    return {
        taskUID,
        timestamp: parseInt(timestamp),
        taskTitle,
        vibrationEnabled: vibration === 'V1',
        vibrationType,
        soundEnabled: sound === 'S1'
    };
}

/**
 * Create OS alarms for task based on VALARM triggers
 *
 * @param {Object} task - CalDAV task with VALARM
 * @param {Object} settings - App reminder settings
 * @returns {Array} Array of created alarm IDs
 */
export function createTaskAlarms(task, settings) {
    const triggerTimes = calculateTriggerTimes(task);

    if (triggerTimes.length === 0) {
        console.log('No VALARM triggers found, cannot create alarms');
        return [];
    }

    const alarmIds = [];

    triggerTimes.forEach(triggerTime => {
        const timestamp = Math.floor(triggerTime.getTime() / 1000);
        const param = buildTaskAlarmParam(task.uid, task.title, timestamp, settings);

        const alarmId = alarmMgr.set({
            url: 'app-service/index',
            time: timestamp,
            repeat_type: alarmMgr.REPEAT_ONCE,
            param: param
        });

        console.log(`Created alarm ${alarmId} for task ${task.uid} at ${triggerTime.toISOString()}`);
        alarmIds.push(alarmId);
    });

    // Save alarm IDs to config
    const appReminders = config.get("appReminders", {});
    if (!appReminders[task.uid]) {
        appReminders[task.uid] = {};
    }
    appReminders[task.uid].alarmIds = alarmIds;
    config.set("appReminders", appReminders);

    return alarmIds;
}

/**
 * Cancel all OS alarms for a task
 *
 * @param {string} taskUID - Task UID
 */
export function cancelTaskAlarms(taskUID) {
    const appReminders = config.get("appReminders", {});
    const taskReminder = appReminders[taskUID];

    if (!taskReminder || !taskReminder.alarmIds) {
        console.log(`No alarms found for task ${taskUID}`);
        return;
    }

    taskReminder.alarmIds.forEach(alarmId => {
        try {
            alarmMgr.cancel(alarmId);
            console.log(`Cancelled alarm ${alarmId} for task ${taskUID}`);
        } catch (e) {
            console.log(`Error cancelling alarm ${alarmId}:`, e);
        }
    });

    // Clear alarm IDs
    taskReminder.alarmIds = [];
    appReminders[taskUID] = taskReminder;
    config.set("appReminders", appReminders);
}

/**
 * Create snooze alarm for a task
 *
 * @param {string} taskUID - Task UID
 * @param {string} taskTitle - Task title
 * @param {number} durationMinutes - Snooze duration in minutes
 * @param {Object} settings - Alarm settings (vibration, sound)
 * @returns {number} Created alarm ID
 */
export function createSnoozeAlarm(taskUID, taskTitle, durationMinutes, settings) {
    const snoozeTime = Math.floor(Date.now() / 1000) + (durationMinutes * 60);
    const param = buildTaskAlarmParam(taskUID, taskTitle, snoozeTime, settings);

    const alarmId = alarmMgr.set({
        url: 'app-service/index',
        time: snoozeTime,
        repeat_type: alarmMgr.REPEAT_ONCE,
        param: param
    });

    console.log(`Created snooze alarm ${alarmId} for ${durationMinutes} minutes`);

    // Track snoozed alarm
    const appReminders = config.get("appReminders", {});
    if (appReminders[taskUID] && appReminders[taskUID].alarmIds) {
        appReminders[taskUID].alarmIds.push(alarmId);
        config.set("appReminders", appReminders);
    }

    return alarmId;
}

/**
 * Get app reminder settings for a task
 *
 * @param {string} taskUID - Task UID
 * @returns {Object|null} Settings object or null
 */
export function getAppReminderSettings(taskUID) {
    const appReminders = config.get("appReminders", {});
    return appReminders[taskUID] || null;
}

/**
 * Set app reminder settings for a task
 *
 * @param {string} taskUID - Task UID
 * @param {Object} settings - Settings to save
 */
export function setAppReminderSettings(taskUID, settings) {
    const appReminders = config.get("appReminders", {});
    appReminders[taskUID] = settings;
    config.set("appReminders", appReminders);
}

/**
 * Remove app reminder settings for a task
 *
 * @param {string} taskUID - Task UID
 */
export function removeAppReminderSettings(taskUID) {
    const appReminders = config.get("appReminders", {});
    delete appReminders[taskUID];
    config.set("appReminders", appReminders);
}
```

**Testing checklist**:
- [ ] Parse single VALARM trigger (-PT15M)
- [ ] Parse multiple VALARM triggers (-PT1H, -PT15M)
- [ ] Calculate absolute times correctly
- [ ] Create OS alarms successfully
- [ ] Store alarm IDs in config
- [ ] Cancel alarms successfully
- [ ] Create snooze alarms

---

### Phase 2: Settings UI

**Objective**: Create settings screen for configuring app-based reminders per task

**Files to create**:

#### `page/amazfit/AppBasedReminderSettings.js`

```javascript
import hmUI, { setStatusBarVisible, updateStatusBarTitle } from "@zos/ui";
import { push, back } from "@zos/router";
import { ConfiguredListScreen } from "../ConfiguredListScreen";
import { createTaskAlarms, cancelTaskAlarms, getAppReminderSettings, setAppReminderSettings } from "../../utils/app-reminder-manager";

const { config, t, tasksProvider } = getApp()._options.globalData;

class AppBasedReminderSettings extends ConfiguredListScreen {
    constructor(params) {
        super();

        const parsed = JSON.parse(params);
        this.taskId = parsed.taskId;

        // Load task (CalDAV or local)
        this.task = this.getTask(this.taskId);

        // Load existing settings or defaults
        const existing = getAppReminderSettings(this.task.uid);
        this.settings = existing || {
            enabled: false,
            vibrationEnabled: true,
            vibrationType: 'C',
            soundEnabled: true,
            alarmIds: []
        };

        this.rows = {};
    }

    getTask(taskId) {
        // Search in current task list
        const list = tasksProvider.getTaskList(config.get("cur_list_id"));
        if (list) {
            return list.getTask(taskId);
        }
        return null;
    }

    build() {
        this.headline(t("App-Based Reminders"));

        // Enable toggle
        this.rows.enable = this.row({
            text: t("Enable for this task"),
            icon: `icon_s/cb_${this.settings.enabled}.png`,
            callback: () => this.toggleEnable()
        });

        this.offset(16);
        this.headline(t("Vibration"));

        // Vibration toggle
        this.rows.vibration = this.row({
            text: this.settings.vibrationEnabled ? t("ON") : t("OFF"),
            icon: `icon_s/cb_${this.settings.vibrationEnabled}.png`,
            callback: () => this.toggleVibration()
        });

        // Vibration type
        this.rows.vibrationType = this.row({
            text: t("Type: ") + (this.settings.vibrationType === 'C' ? t("Continuous") : t("Non-continuous")),
            icon: "icon_s/vibration.png",
            callback: () => this.toggleVibrationType()
        });

        this.offset(16);
        this.headline(t("Sound"));

        // Sound toggle
        this.rows.sound = this.row({
            text: this.settings.soundEnabled ? t("ON") : t("OFF"),
            icon: `icon_s/cb_${this.settings.soundEnabled}.png`,
            callback: () => this.toggleSound()
        });

        // Save button
        this.offset(32);
        this.row({
            text: t("Save"),
            icon: "icon_s/save.png",
            callback: () => this.save()
        });

        this.offset();
    }

    toggleEnable() {
        this.settings.enabled = !this.settings.enabled;
        this.rows.enable.iconView.setProperty(hmUI.prop.SRC, `icon_s/cb_${this.settings.enabled}.png`);
    }

    toggleVibration() {
        this.settings.vibrationEnabled = !this.settings.vibrationEnabled;
        this.rows.vibration.textView.setProperty(hmUI.prop.TEXT, this.settings.vibrationEnabled ? t("ON") : t("OFF"));
        this.rows.vibration.iconView.setProperty(hmUI.prop.SRC, `icon_s/cb_${this.settings.vibrationEnabled}.png`);
    }

    toggleVibrationType() {
        this.settings.vibrationType = this.settings.vibrationType === 'C' ? 'N' : 'C';
        const typeText = this.settings.vibrationType === 'C' ? t("Continuous") : t("Non-continuous");
        this.rows.vibrationType.textView.setProperty(hmUI.prop.TEXT, t("Type: ") + typeText);
    }

    toggleSound() {
        this.settings.soundEnabled = !this.settings.soundEnabled;
        this.rows.sound.textView.setProperty(hmUI.prop.TEXT, this.settings.soundEnabled ? t("ON") : t("OFF"));
        this.rows.sound.iconView.setProperty(hmUI.prop.SRC, `icon_s/cb_${this.settings.soundEnabled}.png`);
    }

    save() {
        if (this.settings.enabled) {
            // Cancel existing alarms first
            cancelTaskAlarms(this.task.uid);

            // Create new alarms with current settings
            const alarmIds = createTaskAlarms(this.task, this.settings);

            if (alarmIds.length === 0) {
                hmUI.showToast({ text: t("No VALARM triggers found") });
                return;
            }

            this.settings.alarmIds = alarmIds;
            hmUI.showToast({ text: t(`Created ${alarmIds.length} alarm(s)`) });
        } else {
            // Disable: cancel all alarms
            cancelTaskAlarms(this.task.uid);
            this.settings.alarmIds = [];
        }

        // Save settings to config
        setAppReminderSettings(this.task.uid, this.settings);

        back();
    }
}

Page({
    onInit(params) {
        setStatusBarVisible(true);
        updateStatusBarTitle("");
        new AppBasedReminderSettings(params).build();
    }
});
```

**Files to modify**:

#### `page/amazfit/TaskEditScreen.js`

Add button after "Set reminder":

```javascript
// In build() method, after reminder section:

// App-based reminders
const appReminders = config.get("appReminders", {});
const appReminderSettings = appReminders[this.task.uid];
const appReminderEnabled = appReminderSettings?.enabled || false;
const appReminderText = appReminderEnabled
    ? t("App-based reminders: Enabled")
    : t("App-based reminders");

this.row({
    text: appReminderText,
    icon: "icon_s/alarm.png",
    callback: () => push({
        url: "page/amazfit/AppBasedReminderSettings",
        param: JSON.stringify({ taskId: this.task.id })
    })
});
```

**Testing checklist**:
- [ ] Open settings for task with VALARM
- [ ] Toggle enable/disable
- [ ] Toggle vibration settings
- [ ] Toggle sound
- [ ] Save creates alarms
- [ ] Disable cancels alarms
- [ ] Status shows in TaskEditScreen

---

### Phase 3: Popup Alert System

**Objective**: Create full-screen popup with vibration/sound and snooze

**Files to create**:

#### `page/amazfit/TaskReminderPopup.js`

```javascript
import hmUI, { setStatusBarVisible } from "@zos/ui";
import { replace, push } from "@zos/router";
import { Vibrator, VIBRATOR_SCENE_TIMER, VIBRATOR_SCENE_NOTIFICATION } from "@zos/sensor";
import { create, id } from "@zos/media";
import { setWakeUpRelaunch } from '@zos/display';
import { getDeviceInfo } from "@zos/device";
import { parseTaskAlarmParam } from "../../utils/app-reminder-manager";
import { cancelTaskAlarms } from "../../utils/app-reminder-manager";

const { width: DEVICE_WIDTH, height: DEVICE_HEIGHT } = getDeviceInfo();
const { config, t, tasksProvider } = getApp()._options.globalData;

let alarmPlayer = null;
let vibrator = null;

Page({
    onInit(params) {
        console.log('TaskReminderPopup onInit, params:', params);

        // Parse alarm params
        const parsed = parseTaskAlarmParam(params);
        if (!parsed) {
            console.log('ERROR: Failed to parse alarm params');
            return;
        }

        this.taskUID = parsed.taskUID;
        this.taskTitle = parsed.taskTitle;
        this.vibrationEnabled = parsed.vibrationEnabled;
        this.vibrationType = parsed.vibrationType;
        this.soundEnabled = parsed.soundEnabled;

        // Load full task
        this.task = this.getTask(this.taskUID);

        // Keep screen on
        try {
            hmApp.setScreenKeep(true);
            setWakeUpRelaunch({ relaunch: true });
        } catch (e) {
            console.log('Error setting screen keep:', e);
        }

        // Start alerts
        if (this.vibrationEnabled) this.startVibration();
        if (this.soundEnabled) this.startSound();
    },

    getTask(taskUID) {
        // Search all lists for task with this UID
        const listId = config.get("cur_list_id");
        const list = tasksProvider.getTaskList(listId);
        if (list) {
            // Search tasks recursively (includes subtasks)
            return list.getTask(taskUID);
        }
        return null;
    },

    startVibration() {
        try {
            const vibrationMode = this.vibrationType === 'N' ?
                VIBRATOR_SCENE_NOTIFICATION :
                VIBRATOR_SCENE_TIMER;

            vibrator = new Vibrator();
            vibrator.start();
            vibrator.setMode(vibrationMode);
            vibrator.start();

            console.log(`Vibration started (${this.vibrationType})`);
        } catch (e) {
            console.log('Vibration error:', e);
        }
    },

    startSound() {
        try {
            alarmPlayer = create(id.PLAYER);

            alarmPlayer.addEventListener(alarmPlayer.event.PREPARE, (result) => {
                if (result) {
                    alarmPlayer.start();
                    console.log('Sound started');
                }
            });

            // Loop audio
            alarmPlayer.addEventListener(alarmPlayer.event.COMPLETE, () => {
                alarmPlayer.prepare();
            });

            alarmPlayer.setSource(alarmPlayer.source.FILE, { file: 'task-alarm.mp3' });
            alarmPlayer.prepare();
        } catch (e) {
            console.log('Sound error:', e);
        }
    },

    build() {
        setStatusBarVisible(false);

        // Black background
        hmUI.createWidget(hmUI.widget.FILL_RECT, {
            x: 0,
            y: 0,
            w: DEVICE_WIDTH,
            h: DEVICE_HEIGHT,
            color: 0x000000
        });

        let yPos = DEVICE_HEIGHT / 6;

        // Task title
        hmUI.createWidget(hmUI.widget.TEXT, {
            x: 20,
            y: yPos,
            w: DEVICE_WIDTH - 40,
            h: 100,
            text: this.taskTitle,
            text_size: 36,
            align_h: hmUI.align.CENTER_H,
            color: 0xFFFFFF,
            text_style: hmUI.text_style.WRAP
        });
        yPos += 110;

        // Task notes/description
        if (this.task && this.task.description) {
            hmUI.createWidget(hmUI.widget.TEXT, {
                x: 20,
                y: yPos,
                w: DEVICE_WIDTH - 40,
                h: 120,
                text: this.task.description,
                text_size: 24,
                align_h: hmUI.align.CENTER_H,
                color: 0xAAAAAA,
                text_style: hmUI.text_style.WRAP
            });
            yPos += 130;
        }

        // Due date
        if (this.task && this.task.due) {
            const dueDate = new Date(this.task.due);
            const dueText = `Due: ${this.formatDueDate(dueDate)}`;

            hmUI.createWidget(hmUI.widget.TEXT, {
                x: 20,
                y: yPos,
                w: DEVICE_WIDTH - 40,
                h: 40,
                text: dueText,
                text_size: 20,
                align_h: hmUI.align.CENTER_H,
                color: 0x999999
            });
            yPos += 50;
        }

        // Buttons
        const buttonY = DEVICE_HEIGHT - 280;
        const buttonW = DEVICE_WIDTH - 80;
        const buttonH = 60;
        const gap = 10;

        // Complete Task button
        hmUI.createWidget(hmUI.widget.BUTTON, {
            x: 40,
            y: buttonY,
            w: buttonW,
            h: buttonH,
            radius: 30,
            normal_color: 0x00AA00,
            press_color: 0x008800,
            text: t('Complete Task'),
            text_size: 24,
            click_func: () => this.completeTask()
        });

        // Snooze button
        hmUI.createWidget(hmUI.widget.BUTTON, {
            x: 40,
            y: buttonY + buttonH + gap,
            w: buttonW,
            h: buttonH,
            radius: 30,
            normal_color: 0xFFAA00,
            press_color: 0xDD8800,
            text: t('Snooze'),
            text_size: 24,
            click_func: () => this.openSnoozePicker()
        });

        // Dismiss button
        hmUI.createWidget(hmUI.widget.BUTTON, {
            x: 40,
            y: buttonY + (buttonH + gap) * 2,
            w: buttonW,
            h: buttonH,
            radius: 30,
            normal_color: 0xFF0000,
            press_color: 0xCC0000,
            text: t('Dismiss'),
            text_size: 24,
            click_func: () => this.dismiss()
        });
    },

    formatDueDate(date) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const timeStr = `${hours}:${minutes}`;

        if (dueDay.getTime() === today.getTime()) {
            return `Today at ${timeStr}`;
        } else if (dueDay.getTime() === today.getTime() + 86400000) {
            return `Tomorrow at ${timeStr}`;
        } else {
            const month = date.getMonth() + 1;
            const day = date.getDate();
            return `${month}/${day} at ${timeStr}`;
        }
    },

    completeTask() {
        this.stopAlerts();

        if (!this.task) {
            console.log('ERROR: Task not found');
            replace({ url: 'page/amazfit/HomeScreen' });
            return;
        }

        // Mark completed
        this.task.setCompleted(true);

        // Cancel all alarms
        cancelTaskAlarms(this.taskUID);

        replace({ url: 'page/amazfit/HomeScreen' });
    },

    openSnoozePicker() {
        this.stopAlerts();

        // Pass settings for snooze alarm creation
        const settings = {
            vibrationEnabled: this.vibrationEnabled,
            vibrationType: this.vibrationType,
            soundEnabled: this.soundEnabled
        };

        push({
            url: 'page/amazfit/DurationPickerScreen',
            param: JSON.stringify({
                mode: 'snooze',
                taskUID: this.taskUID,
                taskTitle: this.taskTitle,
                settings: settings
            })
        });
    },

    dismiss() {
        this.stopAlerts();
        replace({ url: 'page/amazfit/HomeScreen' });
    },

    stopAlerts() {
        if (vibrator) {
            try {
                vibrator.stop();
            } catch (e) {
                console.log('Error stopping vibrator:', e);
            }
        }

        if (alarmPlayer) {
            try {
                alarmPlayer.stop();
            } catch (e) {
                console.log('Error stopping sound:', e);
            }
        }
    },

    onDestroy() {
        try {
            hmApp.setScreenKeep(false);
        } catch (e) {
            console.log('Error disabling screen keep:', e);
        }

        this.stopAlerts();
    }
});
```

#### `page/amazfit/DurationPickerScreen.js`

```javascript
// Duration picker for snooze
// Uses existing TimePicker pattern or creates simple hour/minute spinners
// On DONE: Creates snooze alarm and returns to HomeScreen
```

**Files to modify**:

#### `app-service/index.js`

```javascript
import { launchApp } from "@zos/router";

const globalData = getApp()._options.globalData;

AppService({
    onInit(params) {
        console.log('AppService onInit, params:', params);

        // Detect task alarms
        if (params && params.startsWith('task_')) {
            // Store for popup
            globalData.localStorage.setItem('pending_task_alarm', params);

            // Launch task reminder popup
            launchApp({
                appId: 1023438,  // Tasks NC app ID
                url: 'page/amazfit/TaskReminderPopup',
                params: params
            });
        }
    }
});
```

**Assets**:
- Copy `C:\Users\strannik\Documents\Sync\Documents\00-Projects\github\00-coding\projects\ZeppOS-Smart-Timers\assets\common.r\test-alarm.mp3` → `assets/common.r/task-alarm.mp3`

**Testing checklist**:
- [ ] Alarm triggers and launches popup
- [ ] Vibration starts (continuous/non-continuous)
- [ ] Sound plays and loops
- [ ] Task title/notes/due date display
- [ ] Complete Task marks COMPLETED
- [ ] Snooze opens time picker
- [ ] Dismiss closes popup
- [ ] Screen stays on during alert

---

### Phase 4: Lifecycle Management

**Objective**: Handle alarm cleanup when tasks are modified or deleted

**Files to modify**:

#### `page/amazfit/TaskEditScreen.js`

```javascript
// In delete task handler:
deleteTask() {
    // Cancel app-based alarms
    if (this.task.uid) {
        cancelTaskAlarms(this.task.uid);
    }

    // Existing delete logic...
    this.task.delete();
    back();
}
```

#### `page/amazfit/HomeScreen.js`

```javascript
// When task completed:
onTaskComplete(task) {
    task.setCompleted(true);

    // Cancel app-based alarms
    if (task.uid) {
        cancelTaskAlarms(task.uid);
    }

    // Refresh UI...
}
```

#### `page/amazfit/ReminderPickerScreen.js` (or wherever VALARM is cleared)

```javascript
// When user clears reminder:
clearReminder() {
    this.task.clearValarm();

    // Disable app-based reminders (no triggers left)
    const settings = getAppReminderSettings(this.task.uid);
    if (settings && settings.enabled) {
        cancelTaskAlarms(this.task.uid);
        settings.enabled = false;
        settings.alarmIds = [];
        setAppReminderSettings(this.task.uid, settings);
    }

    back();
}
```

**Testing checklist**:
- [ ] Delete task cancels alarms
- [ ] Complete task cancels alarms
- [ ] Clear VALARM disables app reminders
- [ ] No orphaned OS alarms

---

### Phase 5: Testing & Polish

**Objective**: End-to-end testing and refinement

**Test scenarios**:

1. **Single VALARM trigger**
   - Create task with 1 VALARM
   - Enable app reminders
   - Wait for alarm
   - Test snooze
   - Test complete

2. **Multiple VALARM triggers**
   - Create task with 2+ VALARMs
   - Enable app reminders
   - Verify all alarms created
   - Test each trigger independently

3. **Snooze chain**
   - Trigger alarm
   - Snooze 5 min
   - Wait for snooze
   - Snooze again
   - Repeat 3+ times

4. **Task modifications**
   - Enable app reminders
   - Edit VALARM (change time)
   - Verify alarms recreated
   - Delete task
   - Verify alarms cancelled

5. **Settings changes**
   - Enable with vibration ON
   - Disable app reminders
   - Re-enable with vibration OFF
   - Verify settings applied

**Polish tasks**:
- [ ] Add loading spinner when creating alarms
- [ ] Show alarm count in settings ("3 alarms active")
- [ ] Handle edge cases (task deleted while popup open)
- [ ] Optimize battery usage
- [ ] Add error handling for alarm creation failures

---

## Key Technical Details

### ZeppOS Alarm API

```javascript
import * as alarmMgr from "@zos/alarm";

// Create alarm
const id = alarmMgr.set({
    url: 'app-service/index',      // Handler to call
    time: 1736949600,               // Unix timestamp (seconds)
    repeat_type: alarmMgr.REPEAT_ONCE,
    param: 'custom_string_data'     // Passed to handler
});

// Cancel alarm
alarmMgr.cancel(id);

// Get all active alarms
const activeAlarms = alarmMgr.getAllAlarms();  // Returns [id1, id2, ...]
```

**Repeat types**:
- `REPEAT_ONCE` - One-time alarm (used for all task reminders)
- `REPEAT_DAY` - Daily repeat (not used)
- `REPEAT_WEEK` - Weekly on specific days (not used)

### Vibrator API

```javascript
import { Vibrator, VIBRATOR_SCENE_TIMER, VIBRATOR_SCENE_NOTIFICATION } from "@zos/sensor";

const vibrator = new Vibrator();
vibrator.setMode(VIBRATOR_SCENE_TIMER);  // Continuous, high intensity, 500ms long
vibrator.start();
// ... later ...
vibrator.stop();
```

**Scenes used**:
- `VIBRATOR_SCENE_TIMER` (5) - Continuous, high intensity, 500ms single long vibration
- `VIBRATOR_SCENE_NOTIFICATION` (0) - Non-continuous, two short pulses

### Audio Player API

```javascript
import { create, id } from "@zos/media";

const player = create(id.PLAYER);

player.addEventListener(player.event.PREPARE, (result) => {
    if (result) player.start();
});

player.addEventListener(player.event.COMPLETE, () => {
    player.prepare();  // Loop: re-prepare triggers PREPARE event
});

player.setSource(player.source.FILE, { file: 'task-alarm.mp3' });
player.prepare();

// Stop
player.stop();
```

### Screen Persistence

```javascript
import { setWakeUpRelaunch } from '@zos/display';

// Keep screen on
hmApp.setScreenKeep(true);

// Relaunch app if screen wakes from sleep
setWakeUpRelaunch({ relaunch: true });

// Allow screen to sleep again
hmApp.setScreenKeep(false);
```

---

## File Structure Reference

```
ZeppOS-Tasks-NC-API4/
├── app-service/
│   └── index.js                         # MODIFY: Detect task_ alarms
│
├── page/amazfit/
│   ├── TaskEditScreen.js                # MODIFY: Add button, cleanup on delete
│   ├── AppBasedReminderSettings.js      # NEW: Settings screen
│   ├── TaskReminderPopup.js             # NEW: Alert popup
│   ├── DurationPickerScreen.js          # NEW: Snooze time picker
│   ├── HomeScreen.js                    # MODIFY: Cancel alarms on complete
│   └── ReminderPickerScreen.js          # MODIFY: Cleanup on clear VALARM
│
├── utils/
│   ├── valarm-parser.js                 # NEW: Parse VALARM triggers
│   └── app-reminder-manager.js          # NEW: Alarm lifecycle
│
├── assets/common.r/
│   └── task-alarm.mp3                   # NEW: Copy from Smart Timers
│
└── app.json                             # MODIFY: Register new pages
```

---

## Future Enhancements (Post-Initial Release)

1. **Local task support** - Extend to local tasks (offline mode)
2. **Quick snooze presets** - [5 min] [15 min] [30 min] buttons in popup
3. **Custom alarm sounds** - User-selectable audio files
4. **Alarm history** - Log of triggered/snoozed/completed alarms
5. **RRULE support** - Recurring task alarms
6. **Notification counter** - Show 🔔×2 for tasks with multiple alarms
7. **Smart snooze** - Suggest next snooze based on due time
8. **Alarm preview** - Test vibration/sound in settings

---

## Glossary

- **VALARM** - CalDAV property defining when reminders trigger
- **TRIGGER** - VALARM sub-property with time offset (e.g., -PT15M = 15 min before)
- **OS alarm** - ZeppOS system-managed alarm via `@zos/alarm` API
- **App-based reminder** - Enhanced alert delivery using OS alarms
- **Snooze** - Postpone alarm by creating new OS alarm X minutes later
- **Popup** - Full-screen alert page (TaskReminderPopup.js)
- **Settings** - Per-task configuration (vibration, sound)
- **Alarm ID** - Unique identifier for OS alarm (used for cancellation)

---

## References

- **Smart Timers repo**: `C:\Users\strannik\Documents\Sync\Documents\00-Projects\github\00-coding\projects\ZeppOS-Smart-Timers`
- **Tasks NC repo**: `C:\Users\strannik\Documents\Sync\Documents\00-Projects\github\00-coding\projects\ZeppOS-Tasks-NC\ZeppOS-Tasks-NC-API4`
- **ZeppOS API docs**: https://docs.zepp.com/
- **RFC 5545 (iCalendar)**: VALARM specification
