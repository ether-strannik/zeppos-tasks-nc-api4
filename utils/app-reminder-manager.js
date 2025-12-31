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
 * Format: task_[uid]_[timestamp]_[title]~[description]|V[0/1]|[C/N]|S[0/1]
 *
 * @param {string} taskUID - Task UID
 * @param {string} taskTitle - Task title (summary)
 * @param {string} taskDescription - Task description/notes (optional)
 * @param {number} timestamp - Unix timestamp when alarm fires
 * @param {Object} settings - Alarm settings
 * @returns {string} Formatted param string
 */
function buildTaskAlarmParam(taskUID, taskTitle, taskDescription, timestamp, settings) {
    const vibration = settings.vibrationEnabled ? 'V1' : 'V0';
    const vibrationType = settings.vibrationType || 'C';
    const sound = settings.soundEnabled ? 'S1' : 'S0';
    const settingsStr = `${vibration}|${vibrationType}|${sound}`;

    // Sanitize title (remove | ~ and newlines)
    const cleanTitle = taskTitle.replace(/[\|~\n\r]/g, ' ').trim();

    // Sanitize and truncate description (max 100 chars to avoid param length issues)
    let cleanDesc = '';
    if (taskDescription && taskDescription.trim()) {
        cleanDesc = taskDescription.replace(/[\|~\n\r]/g, ' ').trim();
        if (cleanDesc.length > 100) {
            cleanDesc = cleanDesc.substring(0, 97) + '...';
        }
    }

    return `task_${taskUID}_${timestamp}_${cleanTitle}~${cleanDesc}|${settingsStr}`;
}

/**
 * Parse OS alarm param string
 *
 * @param {string} param - Alarm param from OS
 * @returns {Object|null} Parsed components or null if invalid
 */
export function parseTaskAlarmParam(param) {
    if (!param || !param.startsWith('task_')) {
        return null;
    }

    // Match: task_[uid]_[timestamp]_[title~description]|[settings]
    const match = param.match(/task_(.+?)_(\d+)_(.+?)\|(.+)/);

    if (!match) {
        return null;
    }

    const [, taskUID, timestamp, titleAndDesc, settingsStr] = match;
    const [vibration, vibrationType, sound] = settingsStr.split('|');

    // Split title and description by ~
    const tildeIndex = titleAndDesc.indexOf('~');
    let taskTitle, taskDescription;
    if (tildeIndex !== -1) {
        taskTitle = titleAndDesc.substring(0, tildeIndex);
        taskDescription = titleAndDesc.substring(tildeIndex + 1);
    } else {
        // Backwards compatibility: no ~ means old format without description
        taskTitle = titleAndDesc;
        taskDescription = '';
    }

    return {
        taskUID,
        timestamp: parseInt(timestamp),
        taskTitle,
        taskDescription,
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
        return [];
    }

    const alarmIds = [];
    const now = new Date();

    for (let i = 0; i < triggerTimes.length; i++) {
        const triggerTime = triggerTimes[i];
        const timestamp = Math.floor(triggerTime.getTime() / 1000);

        // Skip alarms in the past
        if (triggerTime < now) {
            continue;
        }

        const param = buildTaskAlarmParam(task.uid, task.title, task.description || '', timestamp, settings);

        try {
            const alarmId = alarmMgr.set({
                url: 'app-service/index',
                time: timestamp,
                repeat_type: alarmMgr.REPEAT_ONCE,
                param: param
            });
            alarmIds.push(alarmId);
        } catch (e) {
            // Alarm creation failed
        }
    }

    // Save alarm IDs and next trigger time to config
    const appReminders = config.get("appReminders", {});
    const existing = appReminders[task.uid] || {};

    // Find the earliest future trigger time
    let nextTriggerTime = null;
    for (let i = 0; i < triggerTimes.length; i++) {
        if (triggerTimes[i] > now) {
            nextTriggerTime = triggerTimes[i].getTime();
            break;
        }
    }

    appReminders[task.uid] = {
        enabled: existing.enabled,
        vibrationEnabled: existing.vibrationEnabled,
        vibrationType: existing.vibrationType,
        soundEnabled: existing.soundEnabled,
        alarmIds: alarmIds,
        nextTriggerTime: nextTriggerTime
    };

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

    if (!taskReminder || !taskReminder.alarmIds || taskReminder.alarmIds.length === 0) {
        return;
    }

    for (let i = 0; i < taskReminder.alarmIds.length; i++) {
        try {
            alarmMgr.cancel(taskReminder.alarmIds[i]);
        } catch (e) {
            // Ignore errors - alarm may already be gone
        }
    }

    // Clear alarm IDs and nextTriggerTime but keep other settings
    taskReminder.alarmIds = [];
    taskReminder.nextTriggerTime = null;
    appReminders[taskUID] = taskReminder;
    config.set("appReminders", appReminders);
}

/**
 * Create snooze alarm for a task
 *
 * @param {string} taskUID - Task UID
 * @param {string} taskTitle - Task title
 * @param {string} taskDescription - Task description
 * @param {number} durationMinutes - Snooze duration in minutes
 * @param {Object} settings - Alarm settings (vibration, sound)
 * @returns {number|null} Created alarm ID or null on error
 */
export function createSnoozeAlarm(taskUID, taskTitle, taskDescription, durationMinutes, settings) {
    const snoozeTime = Math.floor(Date.now() / 1000) + (durationMinutes * 60);
    const param = buildTaskAlarmParam(taskUID, taskTitle, taskDescription || '', snoozeTime, settings);

    try {
        const alarmId = alarmMgr.set({
            url: 'app-service/index',
            time: snoozeTime,
            repeat_type: alarmMgr.REPEAT_ONCE,
            param: param
        });

        // Track snoozed alarm
        const appReminders = config.get("appReminders", {});
        if (appReminders[taskUID] && appReminders[taskUID].alarmIds) {
            appReminders[taskUID].alarmIds.push(alarmId);
            config.set("appReminders", appReminders);
        }

        return alarmId;
    } catch (e) {
        return null;
    }
}

/**
 * Get app reminder settings for a task
 *
 * @param {string} taskUID - Task UID
 * @returns {Object|null} Settings object or null if not found
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
 * Get next scheduled alarm time for a task
 *
 * @param {string} taskUID - Task UID
 * @returns {Date|null} Next alarm time or null if no alarms scheduled
 */
export function getNextScheduledAlarmTime(taskUID) {
    const settings = getAppReminderSettings(taskUID);
    if (!settings || !settings.nextTriggerTime) {
        return null;
    }
    // Check if alarm is still in the future
    const now = Date.now();
    if (settings.nextTriggerTime <= now) {
        return null; // Alarm has passed
    }
    return new Date(settings.nextTriggerTime);
}

/**
 * Check if task has active scheduled alarms
 *
 * @param {string} taskUID - Task UID
 * @returns {boolean} True if has active alarms
 */
export function hasScheduledAlarms(taskUID) {
    const settings = getAppReminderSettings(taskUID);
    return !!(settings && settings.alarmIds && settings.alarmIds.length > 0 && settings.nextTriggerTime && settings.nextTriggerTime > Date.now());
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
    try {
        const activeOSAlarms = alarmMgr.getAllAlarms();
        const appReminders = config.get("appReminders", {});
        let cleanedCount = 0;

        for (const taskUID in appReminders) {
            const reminder = appReminders[taskUID];
            if (!reminder.alarmIds || reminder.alarmIds.length === 0) continue;

            // Filter out alarms that no longer exist in OS
            const validAlarms = reminder.alarmIds.filter(id => activeOSAlarms.includes(id));

            if (validAlarms.length !== reminder.alarmIds.length) {
                cleanedCount += reminder.alarmIds.length - validAlarms.length;
                reminder.alarmIds = validAlarms;
            }
        }

        if (cleanedCount > 0) {
            config.set("appReminders", appReminders);
        }

        return cleanedCount;
    } catch (e) {
        return 0;
    }
}
