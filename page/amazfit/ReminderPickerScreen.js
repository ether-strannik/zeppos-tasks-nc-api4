import hmUI, { setStatusBarVisible, updateStatusBarTitle } from "@zos/ui";
import { back } from "@zos/router";
import { setScrollMode } from "@zos/page";
import { ConfiguredListScreen } from "../ConfiguredListScreen";
import { TimePicker } from "../../lib/mmk/TimePicker";

const { config, t } = getApp()._options.globalData

// Relative reminder presets (minutes before DUE)
const RELATIVE_PRESETS = [
  { minutes: 0, label: "When due" },
  { minutes: 5, label: "5 min before" },
  { minutes: 10, label: "10 min before" },
  { minutes: 15, label: "15 min before" },
  { minutes: 30, label: "30 min before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 120, label: "2 hours before" },
  { minutes: 1440, label: "1 day before" },
];

class ReminderPickerScreen extends ConfiguredListScreen {
  constructor(params) {
    super();

    try {
      params = params ? JSON.parse(params) : {};
    } catch(e) {
      params = {};
    }
    this.listId = params.listId;
    this.taskId = params.taskId;
    this.currentAlarm = params.currentAlarm;
    this.startDate = params.startDate ? new Date(params.startDate) : null;
    this.dueDate = params.dueDate ? new Date(params.dueDate) : null;

    this.timePicker = null;
  }

  build() {
    // Section 1: Quick options based on task dates
    if (this.startDate || this.dueDate) {
      this.headline(t("Quick options"));

      if (this.startDate) {
        this.row({
          text: t("When started") + " (" + this.formatDate(this.startDate) + ")",
          icon: "icon_s/list.png",
          callback: () => this.selectRelative(0) // At start time = 0 min before
        });
      }

      if (this.dueDate) {
        const isSelected = this.isRelativeSelected(0);
        this.row({
          text: t("When due") + " (" + this.formatDate(this.dueDate) + ")",
          icon: isSelected ? "icon_s/cb_true.png" : "icon_s/list.png",
          color: isSelected ? 0x44FF44 : 0xFFFFFF,
          callback: () => this.selectRelative(0)
        });
      }

      this.offset(16);
    }

    // Section 2: Remind me in (sets DUE + VALARM)
    this.headline(t("Remind me in..."));
    this.row({
      text: t("Pick duration"),
      icon: "icon_s/new.png",
      callback: () => this.showDurationPicker()
    });

    // Section 3: Before due (relative presets)
    this.offset(16);
    this.headline(t("Before due"));

    RELATIVE_PRESETS.forEach(({ minutes, label }) => {
      const isSelected = this.isRelativeSelected(minutes);
      this.row({
        text: t(label),
        icon: isSelected ? "icon_s/cb_true.png" : "icon_s/cb_false.png",
        color: isSelected ? 0x44FF44 : 0xFFFFFF,
        callback: () => this.selectRelative(minutes)
      });
    });

    this.offset();
  }

  /**
   * Format date for display (MM/DD HH:MM)
   */
  formatDate(date) {
    const pad = (n) => n.toString().padStart(2, '0');
    return pad(date.getMonth() + 1) + "/" + pad(date.getDate()) + " " +
           pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  /**
   * Check if current alarm matches a relative preset
   */
  isRelativeSelected(minutes) {
    if (!this.currentAlarm) return false;
    if (typeof this.currentAlarm === 'object' && this.currentAlarm.type === 'relative') {
      return this.currentAlarm.minutes === minutes;
    }
    // Legacy number format
    if (typeof this.currentAlarm === 'number') {
      return this.currentAlarm === minutes;
    }
    return false;
  }

  /**
   * Select relative reminder (minutes before DUE)
   */
  selectRelative(minutes) {
    config.set("_selectedReminder", {
      listId: this.listId,
      taskId: this.taskId,
      type: 'relative',
      minutes: minutes
    });
    back();
  }

  /**
   * Show duration picker for "remind me in X hours/minutes"
   * This will set DUE = NOW + duration, then VALARM = 0 (at due)
   */
  showDurationPicker() {
    setScrollMode({ mode: 0 });
    // hmApp.setLayerY(0);

    this.timePicker = new TimePicker({
      initialHour: 0,
      initialMinute: 30,
      onSelect: () => {},
      onConfirm: (hours, minutes) => {
        this.hideDurationPicker();
        // Calculate: NOW + duration = new DUE date
        const totalMs = (hours * 60 + minutes) * 60 * 1000;
        const newDueDate = new Date(Date.now() + totalMs);

        // Set DUE date and VALARM at due time (0 min before)
        config.set("_selectedReminder", {
          listId: this.listId,
          taskId: this.taskId,
          type: 'remind_in',
          dueDate: newDueDate.getTime(),
          minutes: 0  // VALARM at due time
        });
        back();
      }
    });
    this.timePicker.render();
  }

  hideDurationPicker() {
    if (this.timePicker) {
      this.timePicker.destroy();
      this.timePicker = null;
    }
    setScrollMode({ mode: 1 });
  }

  /**
   * Hide any visible picker
   */
  hidePickerIfVisible() {
    if (this.timePicker) {
      this.hideDurationPicker();
      return true;
    }
    return false;
  }
}

Page({
  onInit(params) {
    setStatusBarVisible(true);
    updateStatusBarTitle("");

    this.screen = new ReminderPickerScreen(params);
    this.screen.build();
  }
})
