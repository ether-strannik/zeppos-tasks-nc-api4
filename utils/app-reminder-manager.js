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
 * Example: task_caldav-uuid-123_1736949600_Submit report~Remember to include charts|V1|C|S1
 *
 * @param {string} taskUID - Task UID
 * @param {string} taskTitle - Task title (summary)
 * @param {string} taskDescription - Task description/notes (optional)
 * @param {number} timestamp - Unix timestamp when alarm fires
 * @param {Object} settings - Alarm settings
 * @returns {string} Formatted param string
 */
function buildTaskAlarmParam(taskUID, taskTitle, taskDescription, timestamp, settings) {
    console.log("=== DEBUG CHAIN POINT 5: buildTaskAlarmParam ===");
    console.log("taskUID:", taskUID);
    console.log("taskTitle:", taskTitle);
    console.log("taskDescription:", taskDescription);
    console.log("taskDescription type:", typeof taskDescription);
    console.log("taskDescription length:", taskDescription?.length);
    console.log("timestamp:", timestamp);

    const vibration = settings.vibrationEnabled ? 'V1' : 'V0';
    const vibrationType = settings.vibrationType || 'C';
    const sound = settings.soundEnabled ? 'S1' : 'S0';

    const settingsStr = `${vibration}|${vibrationType}|${sound}`;

    // Sanitize title (remove | ~ and newlines)
    const cleanTitle = taskTitle.replace(/[\|~\n\r]/g, ' ').trim();

    // Sanitize and truncate description (max 100 chars to avoid param length issues)
    let cleanDesc = '';
    console.log("Before description processing:");
    console.log("  taskDescription truthy:", !!taskDescription);
    console.log("  taskDescription?.trim() truthy:", !!(taskDescription && taskDescription.trim()));

    if (taskDescription && taskDescription.trim()) {
        cleanDesc = taskDescription.replace(/[\|~\n\r]/g, ' ').trim();
        if (cleanDesc.length > 100) {
            cleanDesc = cleanDesc.substring(0, 97) + '...';
        }
        console.log("  cleanDesc after processing:", cleanDesc);
    } else {
        console.log("  Description was empty/falsy, cleanDesc stays empty");
    }

    const result = `task_${taskUID}_${timestamp}_${cleanTitle}~${cleanDesc}|${settingsStr}`;
    console.log("Final param string:", result);
    console.log("=== END DEBUG CHAIN POINT 5 ===");

    return result;
}

/**
 * Parse OS alarm param string
 *
 * @param {string} param - Alarm param from OS
 * @returns {Object|null} Parsed components or null if invalid
 *
 * Example input:
 * "task_caldav-uuid-123_1736949600_Submit report~Remember to include charts|V1|C|S1"
 *
 * Example output:
 * {
 *   taskUID: "caldav-uuid-123",
 *   timestamp: 1736949600,
 *   taskTitle: "Submit report",
 *   taskDescription: "Remember to include charts",
 *   vibrationEnabled: true,
 *   vibrationType: "C",
 *   soundEnabled: true
 * }
 */
export function parseTaskAlarmParam(param) {
    if (!param || !param.startsWith('task_')) {
        return null;
    }

    // Match: task_[uid]_[timestamp]_[title~description]|[settings]
    const match = param.match(/task_(.+?)_(\d+)_(.+?)\|(.+)/);

    if (!match) {
        console.log('Failed to parse task alarm param:', param);
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
    console.log('=== DEBUG CHAIN POINT 4: createTaskAlarms ===');
    console.log('Task UID:', task.uid);
    console.log('Task title:', task.title);
    console.log('Task description:', task.description);
    console.log('Task description type:', typeof task.description);
    console.log('Task description length:', task.description?.length);
    console.log('Full task object keys:', Object.keys(task || {}));
    console.log('Full task JSON:', JSON.stringify(task));
    console.log('=== END DEBUG CHAIN POINT 4 ===');

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

        const param = buildTaskAlarmParam(task.uid, task.title, task.description || '', timestamp, settings);

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

    // Save alarm IDs and next trigger time to config
    const appReminders = config.get("appReminders", {});
    if (!appReminders[task.uid]) {
        appReminders[task.uid] = {};
    }

    // Find the earliest trigger time (next alarm)
    let nextTriggerTime = null;
    if (triggerTimes.length > 0) {
        const futureTriggers = triggerTimes.filter(t => t > now);
        if (futureTriggers.length > 0) {
            nextTriggerTime = Math.min(...futureTriggers.map(t => t.getTime()));
        }
    }

    // Preserve existing settings, update alarmIds and nextTriggerTime
    appReminders[task.uid] = {
        ...appReminders[task.uid],
        alarmIds: alarmIds,
        nextTriggerTime: nextTriggerTime
    };

    config.set("appReminders", appReminders);
    console.log(`Saved ${alarmIds.length} alarm IDs to config, nextTriggerTime:`, nextTriggerTime ? new Date(nextTriggerTime).toISOString() : 'none');
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

    // Clear alarm IDs and nextTriggerTime but keep other settings
    taskReminder.alarmIds = [];
    taskReminder.nextTriggerTime = null;
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
 * @param {string} taskDescription - Task description
 * @param {number} durationMinutes - Snooze duration in minutes
 * @param {Object} settings - Alarm settings (vibration, sound)
 * @returns {number|null} Created alarm ID or null on error
 */
export function createSnoozeAlarm(taskUID, taskTitle, taskDescription, durationMinutes, settings) {
    console.log('=== CREATE SNOOZE ALARM START ===');
    console.log('Task UID:', taskUID);
    console.log('Snooze duration:', durationMinutes, 'minutes');

    const snoozeTime = Math.floor(Date.now() / 1000) + (durationMinutes * 60);
    const param = buildTaskAlarmParam(taskUID, taskTitle, taskDescription || '', snoozeTime, settings);

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
