/**
 * App-Based Reminder Manager
 *
 * Manages OS alarms for task reminders using ZeppOS alarm API.
 * Handles alarm creation, cancellation, snooze, and config storage.
 */

import * as alarmMgr from "@zos/alarm";
import { calculateTriggerTimes } from "./valarm-parser";

const { config } = getApp()._options.globalData;

/**
 * Build OS alarm param string for task reminder
 *
 * Format: task_[uid]_[timestamp]_[title]|V[0/1]|[C/N]|S[0/1]
 *
 * Example: task_caldav-uuid-123_1736949600_Submit project report|V1|C|S1
 *
 * @param {string} taskUID - Task UID
 * @param {string} taskTitle - Task title (summary)
 * @param {number} timestamp - Unix timestamp when alarm fires
 * @param {Object} settings - Alarm settings
 * @returns {string} Formatted param string
 */
function buildTaskAlarmParam(taskUID, taskTitle, timestamp, settings) {
    const vibration = settings.vibrationEnabled ? 'V1' : 'V0';
    const vibrationType = settings.vibrationType || 'C';
    const sound = settings.soundEnabled ? 'S1' : 'S0';

    const settingsStr = `${vibration}|${vibrationType}|${sound}`;

    // Sanitize title (remove | and newlines)
    const cleanTitle = taskTitle.replace(/[\|\n\r]/g, ' ').trim();

    return `task_${taskUID}_${timestamp}_${cleanTitle}|${settingsStr}`;
}

/**
 * Parse OS alarm param string
 *
 * @param {string} param - Alarm param from OS
 * @returns {Object|null} Parsed components or null if invalid
 *
 * Example input:
 * "task_caldav-uuid-123_1736949600_Submit project report|V1|C|S1"
 *
 * Example output:
 * {
 *   taskUID: "caldav-uuid-123",
 *   timestamp: 1736949600,
 *   taskTitle: "Submit project report",
 *   vibrationEnabled: true,
 *   vibrationType: "C",
 *   soundEnabled: true
 * }
 */
export function parseTaskAlarmParam(param) {
    if (!param || !param.startsWith('task_')) {
        return null;
    }

    const match = param.match(/task_(.+?)_(\d+)_(.+?)\|(.+)/);

    if (!match) {
        console.log('Failed to parse task alarm param:', param);
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
 *
 * Example:
 * createTaskAlarms(task, {
 *   enabled: true,
 *   vibrationEnabled: true,
 *   vibrationType: 'C',
 *   soundEnabled: true
 * })
 * → [456, 457]  // Two OS alarm IDs
 */
export function createTaskAlarms(task, settings) {
    console.log('=== CREATE TASK ALARMS START ===');
    console.log('Task UID:', task.uid);
    console.log('Task title:', task.title);

    const triggerTimes = calculateTriggerTimes(task);

    if (triggerTimes.length === 0) {
        console.log('No VALARM triggers found, cannot create alarms');
        return [];
    }

    console.log(`Creating ${triggerTimes.length} alarm(s)`);

    const alarmIds = [];
    const now = new Date();

    triggerTimes.forEach((triggerTime, index) => {
        const timestamp = Math.floor(triggerTime.getTime() / 1000);

        // Skip alarms in the past
        if (triggerTime < now) {
            console.log(`Skipping past trigger time: ${triggerTime.toISOString()}`);
            return;
        }

        const param = buildTaskAlarmParam(task.uid, task.title, timestamp, settings);

        console.log(`Creating alarm ${index + 1}:`, {
            time: triggerTime.toISOString(),
            timestamp,
            param
        });

        try {
            const alarmId = alarmMgr.set({
                url: 'app-service/index',
                time: timestamp,
                repeat_type: alarmMgr.REPEAT_ONCE,
                param: param
            });

            console.log(`✓ Created alarm ID ${alarmId} for ${triggerTime.toISOString()}`);
            alarmIds.push(alarmId);
        } catch (e) {
            console.log(`✗ Error creating alarm:`, e);
        }
    });

    // Save alarm IDs to config
    const appReminders = config.get("appReminders", {});
    if (!appReminders[task.uid]) {
        appReminders[task.uid] = {};
    }

    // Preserve existing settings, update alarmIds
    appReminders[task.uid] = {
        ...appReminders[task.uid],
        alarmIds: alarmIds
    };

    config.set("appReminders", appReminders);
    console.log(`Saved ${alarmIds.length} alarm IDs to config`);
    console.log('=== CREATE TASK ALARMS END ===');

    return alarmIds;
}

/**
 * Cancel all OS alarms for a task
 *
 * @param {string} taskUID - Task UID
 */
export function cancelTaskAlarms(taskUID) {
    console.log('=== CANCEL TASK ALARMS START ===');
    console.log('Task UID:', taskUID);

    const appReminders = config.get("appReminders", {});
    const taskReminder = appReminders[taskUID];

    if (!taskReminder || !taskReminder.alarmIds || taskReminder.alarmIds.length === 0) {
        console.log('No alarms found for task');
        console.log('=== CANCEL TASK ALARMS END ===');
        return;
    }

    console.log(`Cancelling ${taskReminder.alarmIds.length} alarm(s)`);

    let cancelledCount = 0;
    taskReminder.alarmIds.forEach(alarmId => {
        try {
            alarmMgr.cancel(alarmId);
            console.log(`✓ Cancelled alarm ID ${alarmId}`);
            cancelledCount++;
        } catch (e) {
            console.log(`✗ Error cancelling alarm ${alarmId}:`, e);
        }
    });

    // Clear alarm IDs but keep settings
    taskReminder.alarmIds = [];
    appReminders[taskUID] = taskReminder;
    config.set("appReminders", appReminders);

    console.log(`Cancelled ${cancelledCount} alarm(s)`);
    console.log('=== CANCEL TASK ALARMS END ===');
}

/**
 * Create snooze alarm for a task
 *
 * @param {string} taskUID - Task UID
 * @param {string} taskTitle - Task title
 * @param {number} durationMinutes - Snooze duration in minutes
 * @param {Object} settings - Alarm settings (vibration, sound)
 * @returns {number|null} Created alarm ID or null on error
 */
export function createSnoozeAlarm(taskUID, taskTitle, durationMinutes, settings) {
    console.log('=== CREATE SNOOZE ALARM START ===');
    console.log('Task UID:', taskUID);
    console.log('Snooze duration:', durationMinutes, 'minutes');

    const snoozeTime = Math.floor(Date.now() / 1000) + (durationMinutes * 60);
    const param = buildTaskAlarmParam(taskUID, taskTitle, snoozeTime, settings);

    console.log('Snooze time:', new Date(snoozeTime * 1000).toISOString());
    console.log('Param:', param);

    try {
        const alarmId = alarmMgr.set({
            url: 'app-service/index',
            time: snoozeTime,
            repeat_type: alarmMgr.REPEAT_ONCE,
            param: param
        });

        console.log(`✓ Created snooze alarm ID ${alarmId}`);

        // Track snoozed alarm
        const appReminders = config.get("appReminders", {});
        if (appReminders[taskUID] && appReminders[taskUID].alarmIds) {
            appReminders[taskUID].alarmIds.push(alarmId);
            config.set("appReminders", appReminders);
            console.log('Added snooze alarm to config');
        } else {
            console.log('WARNING: Task reminder config not found, snooze alarm not tracked');
        }

        console.log('=== CREATE SNOOZE ALARM END ===');
        return alarmId;
    } catch (e) {
        console.log('✗ Error creating snooze alarm:', e);
        console.log('=== CREATE SNOOZE ALARM END ===');
        return null;
    }
}

/**
 * Get app reminder settings for a task
 *
 * @param {string} taskUID - Task UID
 * @returns {Object|null} Settings object or null if not found
 *
 * Example output:
 * {
 *   enabled: true,
 *   vibrationEnabled: true,
 *   vibrationType: 'C',
 *   soundEnabled: true,
 *   alarmIds: [456, 457]
 * }
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
    console.log('Saved app reminder settings for task:', taskUID);
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
    console.log('Removed app reminder settings for task:', taskUID);
}

/**
 * Check if task has app-based reminders enabled
 *
 * @param {string} taskUID - Task UID
 * @returns {boolean} True if enabled
 */
export function isAppReminderEnabled(taskUID) {
    const settings = getAppReminderSettings(taskUID);
    return !!(settings && settings.enabled);
}

/**
 * Get count of active alarms for a task
 *
 * @param {string} taskUID - Task UID
 * @returns {number} Number of active alarms
 */
export function getActiveAlarmCount(taskUID) {
    const settings = getAppReminderSettings(taskUID);
    return settings?.alarmIds?.length || 0;
}

/**
 * Reconcile app reminder alarms with OS alarm list
 * (Clean up stale alarms that no longer exist in OS)
 *
 * @returns {number} Number of cleaned up alarms
 */
export function reconcileAppReminders() {
    console.log('=== RECONCILE APP REMINDERS START ===');

    try {
        const activeOSAlarms = alarmMgr.getAllAlarms();
        console.log('Active OS alarms:', activeOSAlarms);

        const appReminders = config.get("appReminders", {});
        let cleanedCount = 0;

        for (const taskUID in appReminders) {
            const reminder = appReminders[taskUID];
            if (!reminder.alarmIds || reminder.alarmIds.length === 0) continue;

            // Filter out alarms that no longer exist in OS
            const validAlarms = reminder.alarmIds.filter(id => activeOSAlarms.includes(id));

            if (validAlarms.length !== reminder.alarmIds.length) {
                const removedCount = reminder.alarmIds.length - validAlarms.length;
                console.log(`Task ${taskUID}: Removed ${removedCount} stale alarm(s)`);
                reminder.alarmIds = validAlarms;
                cleanedCount += removedCount;
            }
        }

        if (cleanedCount > 0) {
            config.set("appReminders", appReminders);
            console.log(`Cleaned up ${cleanedCount} stale alarm(s)`);
        } else {
            console.log('No stale alarms found');
        }

        console.log('=== RECONCILE APP REMINDERS END ===');
        return cleanedCount;
    } catch (e) {
        console.log('Error reconciling app reminders:', e);
        console.log('=== RECONCILE APP REMINDERS END ===');
        return 0;
    }
}
