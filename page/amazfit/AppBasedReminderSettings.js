import hmUI, { setStatusBarVisible, updateStatusBarTitle } from "@zos/ui";
import { push, back } from "@zos/router";
import { ListScreen } from "../../lib/mmk/ListScreen";
import { createTaskAlarms, cancelTaskAlarms, getAppReminderSettings, setAppReminderSettings } from "../../utils/app-reminder-manager";
import { hasValidVALARM } from "../../utils/valarm-parser";

const { config, t, tasksProvider } = getApp()._options.globalData;

class AppBasedReminderSettings extends ListScreen {
    constructor(params) {
        super();

        console.log("AppBasedReminderSettings: Raw params:", params);

        // Handle undefined params gracefully
        if (params === undefined || params === "undefined" || !params) {
            console.log("Params undefined, checking config fallback");
            const savedParams = config.get("_appReminderSettingsParams");
            if (savedParams) {
                console.log("Found saved params in config");
                params = savedParams;
                config.set("_appReminderSettingsParams", null); // Clear after use
            } else {
                console.log("No saved params, using empty object");
                params = {};
            }
        } else {
            try {
                params = JSON.parse(params);
                console.log("Parsed params successfully");
            } catch(e) {
                console.log("AppBasedReminderSettings param parse error:", e);
                params = {};
            }
        }

        this.listId = params.list_id;
        this.taskId = params.task_id;

        // Use task_data passed from TaskEditScreen (getTask() doesn't fetch from server)
        if (params.task_data) {
            console.log("Using passed task_data");
            const td = params.task_data;
            this.task = {
                uid: td.uid,
                title: td.title,
                dueDate: td.dueDate ? new Date(td.dueDate) : null,
                alarm: td.alarm,
                valarm: td.valarm
            };
            console.log("Task data: uid=", this.task.uid, "dueDate=", this.task.dueDate, "alarm=", JSON.stringify(this.task.alarm));
        } else {
            console.log("No task_data in params");
            this.task = null;
        }

        if (!this.task || !this.task.uid) {
            console.log("AppBasedReminderSettings: Task data not available");
            this.task = null;
            return;
        }

        // Load existing settings or defaults
        const existing = getAppReminderSettings(this.task.uid);
        this.settings = existing || {
            enabled: false,
            vibrationEnabled: true,
            vibrationType: 'C',  // Continuous
            soundEnabled: true,
            alarmIds: []
        };

        console.log("AppBasedReminderSettings: Settings loaded");

        this.rows = {};
    }

    build() {
        if (!this.task) {
            this.headline(t("Error"));
            this.text({
                text: t("Task not found"),
                color: 0xFF0000
            });
            return;
        }

        this.headline(t("App-Based Reminders"));

        // Check if task has VALARM
        if (!hasValidVALARM(this.task)) {
            this.offset(16);

            // Determine what's missing
            const dueDate = this.task.dueDate || this.task.due;
            let errorMsg;

            if (!dueDate) {
                errorMsg = t("App-based reminders require a due date. Please set a due date first, then configure your reminder relative to that due date (e.g., 'At due time', '15 minutes before', etc.).");
            } else if ((!this.task.valarm || this.task.valarm.length === 0) && (this.task.alarm === null || this.task.alarm === undefined)) {
                errorMsg = t("This task has no reminder set. Please set a reminder first using 'Set reminder' in the task editor.");
            } else {
                errorMsg = t("Unable to configure app-based reminders for this task.");
            }

            this.text({
                text: errorMsg,
                color: 0xFFAA00,
                align_h: hmUI.align.LEFT
            });
            this.offset(16);
            this.row({
                text: t("Back"),
                icon: "icon_s/back.png",
                callback: () => back()
            });
            return;
        }

        // Enable toggle
        this.rows.enable = this.row({
            text: t("Enable for this task"),
            icon: `icon_s/cb_${this.settings.enabled}.png`,
            callback: () => this.toggleEnable()
        });

        // Vibration section
        this.offset(16);
        this.headline(t("Vibration"));

        // Vibration toggle
        this.rows.vibration = this.row({
            text: this.settings.vibrationEnabled ? t("ON") : t("OFF"),
            icon: `icon_s/cb_${this.settings.vibrationEnabled}.png`,
            callback: () => this.toggleVibration()
        });

        // Vibration type
        const vibrationType = this.settings.vibrationType === 'C' ? t("Continuous") : t("Non-continuous");
        this.rows.vibrationType = this.row({
            text: t("Type: ") + vibrationType,
            icon: "icon_s/vibration.png",
            callback: () => this.toggleVibrationType()
        });

        // Sound section
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
        console.log("Toggled enable:", this.settings.enabled);
    }

    toggleVibration() {
        this.settings.vibrationEnabled = !this.settings.vibrationEnabled;
        const text = this.settings.vibrationEnabled ? t("ON") : t("OFF");
        this.rows.vibration.textView.setProperty(hmUI.prop.TEXT, text);
        this.rows.vibration.iconView.setProperty(hmUI.prop.SRC, `icon_s/cb_${this.settings.vibrationEnabled}.png`);
        console.log("Toggled vibration:", this.settings.vibrationEnabled);
    }

    toggleVibrationType() {
        this.settings.vibrationType = this.settings.vibrationType === 'C' ? 'N' : 'C';
        const typeText = this.settings.vibrationType === 'C' ? t("Continuous") : t("Non-continuous");
        this.rows.vibrationType.textView.setProperty(hmUI.prop.TEXT, t("Type: ") + typeText);
        console.log("Changed vibration type:", this.settings.vibrationType);
    }

    toggleSound() {
        this.settings.soundEnabled = !this.settings.soundEnabled;
        const text = this.settings.soundEnabled ? t("ON") : t("OFF");
        this.rows.sound.textView.setProperty(hmUI.prop.TEXT, text);
        this.rows.sound.iconView.setProperty(hmUI.prop.SRC, `icon_s/cb_${this.settings.soundEnabled}.png`);
        console.log("Toggled sound:", this.settings.soundEnabled);
    }

    save() {
        console.log("=== SAVE APP-BASED REMINDER SETTINGS ===");
        console.log("Settings:", JSON.stringify(this.settings));

        if (this.settings.enabled) {
            console.log("App-based reminders enabled - creating alarms");

            // Cancel existing alarms first
            cancelTaskAlarms(this.task.uid);

            // Create new alarms with current settings
            const alarmIds = createTaskAlarms(this.task, this.settings);

            if (alarmIds.length === 0) {
                console.log("Failed to create alarms");
                hmUI.showToast({ text: t("Failed to create alarms") });
                return;
            }

            this.settings.alarmIds = alarmIds;
            console.log(`Created ${alarmIds.length} alarm(s):`, alarmIds);
            hmUI.showToast({ text: t(`Created ${alarmIds.length} alarm(s)`) });
        } else {
            console.log("App-based reminders disabled - cancelling alarms");
            // Disable: cancel all alarms
            cancelTaskAlarms(this.task.uid);
            this.settings.alarmIds = [];
            hmUI.showToast({ text: t("App-based reminders disabled") });
        }

        // Save settings to config
        setAppReminderSettings(this.task.uid, this.settings);
        console.log("Settings saved to config");

        // Navigate back
        back();
    }
}

Page({
    onInit(params) {
        console.log("AppBasedReminderSettings onInit, params:", params);
        setStatusBarVisible(true);
        updateStatusBarTitle("");
        new AppBasedReminderSettings(params).build();
    }
});
