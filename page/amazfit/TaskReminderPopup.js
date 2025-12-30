import hmUI, { setStatusBarVisible } from "@zos/ui";
import { replace, push } from "@zos/router";
import { Vibrator, VIBRATOR_SCENE_TIMER, VIBRATOR_SCENE_NOTIFICATION } from "@zos/sensor";
import { create, id } from "@zos/media";
import { setWakeUpRelaunch, setPageBrightTime } from '@zos/display';
import { getDeviceInfo } from "@zos/device";
import { parseTaskAlarmParam, cancelTaskAlarms } from "../../utils/app-reminder-manager";

const { width: DEVICE_WIDTH, height: DEVICE_HEIGHT } = getDeviceInfo();
const { config, t, tasksProvider } = getApp()._options.globalData;

let alarmPlayer = null;
let vibrator = null;

Page({
    onInit(params) {
        console.log('=== TASK REMINDER POPUP INIT ===');
        console.log('Params:', params);

        // Parse alarm params
        const parsed = parseTaskAlarmParam(params);
        if (!parsed) {
            console.log('ERROR: Failed to parse task alarm params');
            this.error = true;
            return;
        }

        this.taskUID = parsed.taskUID;
        this.taskTitle = parsed.taskTitle;
        this.vibrationEnabled = parsed.vibrationEnabled;
        this.vibrationType = parsed.vibrationType;
        this.soundEnabled = parsed.soundEnabled;

        console.log('Task UID:', this.taskUID);
        console.log('Task Title:', this.taskTitle);
        console.log('Vibration:', this.vibrationEnabled, this.vibrationType);
        console.log('Sound:', this.soundEnabled);

        // Load full task by UID
        this.task = this.findTaskByUID(this.taskUID);

        if (!this.task) {
            console.log('WARNING: Task not found by UID');
            // Continue anyway - we have at least the title from params
        }

        // Keep screen on during alarm (use long bright time for API 4.2)
        try {
            setPageBrightTime({ brightTime: 600000 }); // 10 minutes
            setWakeUpRelaunch({ relaunch: true });
            console.log('Screen keep enabled');
        } catch (e) {
            console.log('Error setting screen keep:', e);
        }

        // Start alerts
        if (this.vibrationEnabled) {
            this.startVibration();
        }
        if (this.soundEnabled) {
            this.startSound();
        }

        console.log('=== TASK REMINDER POPUP INIT COMPLETE ===');
    },

    /**
     * Find task by UID across all lists
     */
    findTaskByUID(uid) {
        console.log('Searching for task with UID:', uid);

        try {
            // Get all task lists
            const lists = tasksProvider.getTaskLists();

            // Handle case where getTaskLists returns non-iterable value
            if (!lists || !Array.isArray(lists) || lists.length === 0) {
                console.log('No task lists available or not an array');
                return null;
            }

            // Search each list
            for (let i = 0; i < lists.length; i++) {
                const list = lists[i];
                if (list && typeof list.getTask === 'function') {
                    const task = list.getTask(uid);
                    if (task) {
                        console.log('Found task in list:', list.id);
                        return task;
                    }
                }
            }

            console.log('Task not found in any list');
            return null;
        } catch (e) {
            console.log('Error in findTaskByUID:', e);
            return null;
        }
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
                } else {
                    console.log('Sound prepare failed');
                }
            });

            alarmPlayer.addEventListener(alarmPlayer.event.START, () => {
                console.log('Sound playback started');
            });

            alarmPlayer.addEventListener(alarmPlayer.event.COMPLETE, () => {
                console.log('Sound complete - looping');
                // Loop audio by re-preparing
                alarmPlayer.prepare();
            });

            alarmPlayer.addEventListener(alarmPlayer.event.ERROR, (error) => {
                console.log('Sound error:', error);
            });

            alarmPlayer.setSource(alarmPlayer.source.FILE, { file: 'task-alarm.mp3' });
            alarmPlayer.prepare();
            console.log('Sound preparation started');
        } catch (e) {
            console.log('Sound error:', e);
        }
    },

    build() {
        setStatusBarVisible(false);

        if (this.error) {
            this.showError();
            return;
        }

        // Black background
        hmUI.createWidget(hmUI.widget.FILL_RECT, {
            x: 0,
            y: 0,
            w: DEVICE_WIDTH,
            h: DEVICE_HEIGHT,
            color: 0x000000
        });

        let yPos = DEVICE_HEIGHT / 6;

        // Task title (large, prominent)
        hmUI.createWidget(hmUI.widget.TEXT, {
            x: 20,
            y: yPos,
            w: DEVICE_WIDTH - 40,
            h: 120,
            text: this.taskTitle,
            text_size: 36,
            align_h: hmUI.align.CENTER_H,
            align_v: hmUI.align.CENTER_V,
            color: 0xFFFFFF,
            text_style: hmUI.text_style.WRAP
        });
        yPos += 130;

        // Task notes/description (if available)
        if (this.task && this.task.description && this.task.description.trim()) {
            const description = this.task.description.trim();
            const maxLength = 150;
            const displayText = description.length > maxLength
                ? description.substring(0, maxLength) + "..."
                : description;

            hmUI.createWidget(hmUI.widget.TEXT, {
                x: 20,
                y: yPos,
                w: DEVICE_WIDTH - 40,
                h: 100,
                text: displayText,
                text_size: 24,
                align_h: hmUI.align.CENTER_H,
                color: 0xAAAAAA,
                text_style: hmUI.text_style.WRAP
            });
            yPos += 110;
        }

        // Due date (if available)
        if (this.task && this.task.due) {
            const dueText = this.formatDueDate(this.task.due);

            hmUI.createWidget(hmUI.widget.TEXT, {
                x: 20,
                y: yPos,
                w: DEVICE_WIDTH - 40,
                h: 40,
                text: `Due: ${dueText}`,
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

        // Complete Task button (green)
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

        // Snooze button (orange)
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

        // Dismiss button (red)
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

    showError() {
        hmUI.createWidget(hmUI.widget.FILL_RECT, {
            x: 0,
            y: 0,
            w: DEVICE_WIDTH,
            h: DEVICE_HEIGHT,
            color: 0x000000
        });

        hmUI.createWidget(hmUI.widget.TEXT, {
            x: 20,
            y: DEVICE_HEIGHT / 2 - 40,
            w: DEVICE_WIDTH - 40,
            h: 80,
            text: 'Error loading task reminder',
            text_size: 28,
            align_h: hmUI.align.CENTER_H,
            align_v: hmUI.align.CENTER_V,
            color: 0xFF0000
        });

        hmUI.createWidget(hmUI.widget.BUTTON, {
            x: 40,
            y: DEVICE_HEIGHT / 2 + 60,
            w: DEVICE_WIDTH - 80,
            h: 60,
            radius: 30,
            normal_color: 0xFF0000,
            press_color: 0xCC0000,
            text: t('Close'),
            text_size: 24,
            click_func: () => replace({ url: 'page/amazfit/HomeScreen' })
        });
    },

    formatDueDate(dueDate) {
        const date = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
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
        } else if (dueDay.getTime() === today.getTime() - 86400000) {
            return `Yesterday at ${timeStr}`;
        } else {
            const month = date.getMonth() + 1;
            const day = date.getDate();
            return `${month}/${day} at ${timeStr}`;
        }
    },

    completeTask() {
        console.log('=== COMPLETE TASK ===');
        this.stopAlerts();

        if (!this.task) {
            console.log('ERROR: Cannot complete - task not found');
            hmUI.showToast({ text: t('Error: Task not found') });
            replace({ url: 'page/amazfit/HomeScreen' });
            return;
        }

        try {
            // Mark task completed
            console.log('Marking task completed');
            this.task.setCompleted(true);

            // Cancel all alarms for this task
            console.log('Cancelling alarms for task:', this.taskUID);
            cancelTaskAlarms(this.taskUID);

            console.log('Task completed successfully');
            hmUI.showToast({ text: t('Task completed') });
        } catch (e) {
            console.log('Error completing task:', e);
            hmUI.showToast({ text: t('Error completing task') });
        }

        replace({ url: 'page/amazfit/HomeScreen' });
    },

    openSnoozePicker() {
        console.log('=== OPEN SNOOZE PICKER ===');
        this.stopAlerts();

        // Pass settings for snooze alarm creation
        const settings = {
            vibrationEnabled: this.vibrationEnabled,
            vibrationType: this.vibrationType,
            soundEnabled: this.soundEnabled
        };

        const paramObj = {
            mode: 'snooze',
            taskUID: this.taskUID,
            taskTitle: this.taskTitle,
            settings: settings
        };

        console.log('Opening DurationPickerScreen with params:', JSON.stringify(paramObj));

        push({
            url: 'page/amazfit/DurationPickerScreen',
            param: JSON.stringify(paramObj)
        });
    },

    dismiss() {
        console.log('=== DISMISS ===');
        this.stopAlerts();
        replace({ url: 'page/amazfit/HomeScreen' });
    },

    stopAlerts() {
        if (vibrator) {
            try {
                vibrator.stop();
                console.log('Vibration stopped');
            } catch (e) {
                console.log('Error stopping vibrator:', e);
            }
        }

        if (alarmPlayer) {
            try {
                alarmPlayer.stop();
                console.log('Sound stopped');
            } catch (e) {
                console.log('Error stopping sound:', e);
            }
        }
    },

    onDestroy() {
        console.log('=== TASK REMINDER POPUP DESTROY ===');

        // Reset screen brightness to default (API 4.2)
        try {
            setPageBrightTime({ brightTime: 15000 }); // Reset to 15 seconds
            console.log('Screen bright time reset');
        } catch (e) {
            console.log('Error resetting screen bright time:', e);
        }

        this.stopAlerts();
    }
});
