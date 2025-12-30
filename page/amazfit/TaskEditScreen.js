import hmUI, { setStatusBarVisible, updateStatusBarTitle, createKeyboard, deleteKeyboard, inputType } from "@zos/ui";
import { replace, push, back } from "@zos/router";
import { setWakeUpRelaunch, setPageBrightTime } from "@zos/display";
import { setScrollMode } from "@zos/page";
import { Geolocation } from "@zos/sensor";
import {ListScreen} from "../../lib/mmk/ListScreen";
import {DateTimePicker} from "../../lib/mmk/DateTimePicker";
import {TimePicker} from "../../lib/mmk/TimePicker";
import {PriorityPicker} from "../../lib/mmk/PriorityPicker";
import {AppGesture} from "../../lib/mmk/AppGesture";
import {createSpinner, log, flushLog, request} from "../Utils";
import {getAppReminderSettings, isAppReminderEnabled, cancelTaskAlarms} from "../../utils/app-reminder-manager";

const { t, config, tasksProvider } = getApp()._options.globalData

class TaskEditScreen extends ListScreen {
  constructor(param) {
    super();
    this.isSaving = false;
    this.deleteConfirm = 1; // Requires 2 taps to delete

    try {
      // Handle undefined, null, empty string, or literal "undefined" string
      param = (param && param !== "undefined") ? JSON.parse(param) : {};
    } catch(e) {
      console.log("TaskEditScreen param parse error:", e);
      param = {};
    }

    // Fallback: read from config if push() didn't pass params (API 3.0 issue)
    if (!param.list_id || !param.task_id) {
      const savedParams = config.get("_editTaskParams");
      if (savedParams) {
        console.log("TaskEditScreen: Using params from config:", JSON.stringify(savedParams));
        param = savedParams;
        config.set("_editTaskParams", null); // Clear after use
      }
    }

    this.listId = param.list_id;
    this.taskId = param.task_id;
    console.log("TaskEditScreen: listId=", this.listId, "taskId=", this.taskId);

    if (!this.listId || !this.taskId) {
      console.log("TaskEditScreen: Missing listId or taskId");
      this.task = null;
    } else {
      this.task = tasksProvider.getTaskList(this.listId).getTask(this.taskId);
    }
  }

  init() {
    if (!this.task) {
      hmUI.showToast({ text: "Error: Task not found" });
      return;
    }

    const hideSpinner = createSpinner();
    this.task.sync().then(() => {
      hideSpinner();
      try {
        this.build();
      } catch(e) {
        console.log("TaskEditScreen build error:", e);
        hmUI.showToast({ text: "Build error: " + (e.message || e) });
      }
    }).catch((e) => {
      console.log("Sync error:", e);
      hideSpinner();
      try {
        this.build();
      } catch(e2) {
        console.log("TaskEditScreen build error:", e2);
        hmUI.showToast({ text: "Build error: " + (e2.message || e2) });
      }
    });
  }

  /**
   * Reload the edit screen to show updated data
   */
  reloadEditScreen() {
    const paramObj = { list_id: this.listId, task_id: this.taskId };
    // Store params in config as workaround for API 3.0 replace() not passing params
    config.set("_editTaskParams", paramObj);
    replace({
      url: "page/amazfit/TaskEditScreen",
      param: JSON.stringify(paramObj)
    });
  }

  build() {
    // Title section
    this.headline(t("Title"));
    this.row({
      text: this.task.title || t("(no title)"),
      icon: "icon_s/edit.png",
      callback: () => this.showTitleEditor()
    });

    // Notes/Description section
    this.offset(16);
    this.headline(t("Notes"));
    const hasNotes = this.task.description && this.task.description.trim().length > 0;
    if (hasNotes) {
      // Show notes content (truncated if long)
      const notesPreview = this.task.description.length > 100
        ? this.task.description.substring(0, 100) + "..."
        : this.task.description;
      this.text({
        text: notesPreview,
        fontSize: this.fontSize - 2,
        color: 0xAAAAAA
      });
    }
    this.row({
      text: hasNotes ? t("Edit notes") : t("Add notes"),
      icon: "icon_s/edit.png",
      callback: () => this.showNotesEditor()
    });

    // Priority section (CalDAV only - tasks with setPriority)
    if (typeof this.task.setPriority === 'function') {
      this.offset(16);
      this.headline(t("Priority"));
      const priorityLabel = this.getPriorityLabel(this.task.priority);
      this.row({
        text: `${priorityLabel} (${this.task.priority})`,
        icon: "icon_s/priority.png",
        callback: () => this.showPriorityEditor()
      });
    }

    // Categories section (CalDAV only - tasks with setCategories)
    if (typeof this.task.setCategories === 'function') {
      this.offset(16);
      this.headline(t("Categories"));
      const hasCategories = this.task.categories && this.task.categories.length > 0;
      if (hasCategories) {
        this.text({
          text: this.task.categories.join(", "),
          fontSize: this.fontSize - 2,
          color: 0xAAAAAA
        });
      }
      this.row({
        text: hasCategories ? t("Edit categories") : t("Add categories"),
        icon: "icon_s/edit.png",
        callback: () => this.showCategoryPicker()
      });
    }

    // Start Date section (CalDAV only - tasks with setStartDate)
    if (typeof this.task.setStartDate === 'function') {
      this.offset(16);
      this.headline(t("Start Date"));
      const startDateText = this.task.startDate
        ? this.formatDateTime(this.task.startDate)
        : t("Not set");
      this.startDateRow = this.row({
        text: startDateText,
        icon: "icon_s/calendar.png",
        callback: () => this.showStartDatePicker()
      });
      if (this.task.startDate) {
        this.row({
          text: t("Clear start date"),
          icon: "icon_s/delete.png",
          callback: () => this.clearStartDate()
        });
      }
    }

    // Due Date section (CalDAV only - tasks with setDueDate)
    if (typeof this.task.setDueDate === 'function') {
      this.offset(16);
      this.headline(t("Due Date"));
      const dueDateText = this.task.dueDate
        ? this.formatDateTime(this.task.dueDate)
        : t("Not set");
      this.dueDateRow = this.row({
        text: dueDateText,
        icon: "icon_s/calendar.png",
        callback: () => this.showDueDatePicker()
      });
      if (this.task.dueDate) {
        this.row({
          text: t("Clear due date"),
          icon: "icon_s/delete.png",
          callback: () => this.clearDueDate()
        });
      }
    }

    // Reminder section (CalDAV only - tasks with setAlarm)
    if (typeof this.task.setAlarm === 'function') {
      // Check if returning from reminder picker with a selection
      this.checkReminderSelection();

      this.offset(16);
      this.headline(t("Reminder"));

      // Show current alarm status
      const alarmText = this.task.alarm !== null
        ? (this.task.formatAlarm ? this.task.formatAlarm() : t("Set"))
        : t("Not set");

      this.row({
        text: alarmText,
        icon: "icon_s/alarm.png",
        callback: () => this.showReminderPicker()
      });

      // Clear option if alarm is set
      if (this.task.alarm !== null) {
        this.row({
          text: t("Clear reminder"),
          icon: "icon_s/delete.png",
          callback: () => this.clearAlarm()
        });

        // App-based reminders (only show if alarm is set)
        const appReminderEnabled = isAppReminderEnabled(this.task.uid);
        const appReminderText = appReminderEnabled
          ? t("App-based reminders: Enabled")
          : t("App-based reminders");

        this.row({
          text: appReminderText,
          icon: "icon_s/alarm.png",
          callback: () => this.showAppBasedReminderSettings()
        });
      }
    }

    // Location section (CalDAV only - tasks with setLocation)
    if (typeof this.task.setLocation === 'function') {
      this.offset(16);
      this.headline(t("Location"));
      if (this.task.geo) {
        this.text({
          text: `${this.task.geo.lat.toFixed(6)}, ${this.task.geo.lon.toFixed(6)}`,
          fontSize: this.fontSize - 2,
          color: 0xAAAAAA
        });
        if (this.task.location) {
          this.text({
            text: this.task.location,
            fontSize: this.fontSize - 2,
            color: 0xAAAAAA
          });
        }
      }
      this.locationRow = this.row({
        text: this.task.geo ? t("Update location") : t("Add current location"),
        icon: "icon_s/location.png",
        callback: () => this.captureGPSLocation()
      });
      if (this.task.geo) {
        this.row({
          text: t("Clear location"),
          icon: "icon_s/delete.png",
          callback: () => this.clearLocation()
        });
      }
    }

    // Add subtask button (CalDAV only - tasks with uid)
    if (this.task.uid) {
      this.offset(16);
      this.headline(t("Subtasks"));
      this.row({
        text: t("Add subtask"),
        icon: "icon_s/new.png",
        callback: () => this.showSubtaskEditor()
      });
    }

    // Add to Calendar (CalDAV only)
    if (this.task.uid) {
      this.offset(16);
      this.headline(t("Calendar"));
      this.row({
        text: t("Add to calendar"),
        icon: "icon_s/calendar.png",
        callback: () => this.showCalendarPicker()
      });
    }

    // Delete action
    this.offset(16);
    this.deleteRow = this.row({
      text: t("Delete"),
      icon: "icon_s/delete.png",
      callback: () => this.doDelete()
    });
    this.offset();

    // Keyboards will be created on demand
    this.currentKeyboard = null;

    // Priority picker will be created on demand
    this.priorityPicker = null;
  }

  /**
   * Get human-readable priority label
   */
  getPriorityLabel(priority) {
    if (priority >= 1 && priority <= 4) return t("High");
    if (priority === 5) return t("Medium");
    if (priority >= 6 && priority <= 9) return t("Low");
    return t("None");
  }

  /**
   * Format date/time for display
   */
  formatDateTime(date) {
    if (!date) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${d} ${hh}:${mm}`;
  }

  showStartDatePicker() {
    // Hide main list
    setScrollMode({ mode: 0 });
    // hmApp.setLayerY(0) - not needed in API 3.0;

    this.dateTimePicker = new DateTimePicker({
      initialDate: this.task.startDate || new Date(),
      showTime: true,
      onConfirm: (date) => {
        this.dateTimePicker = null;
        setScrollMode({ mode: 1 });
        this.saveStartDate(date);
      },
      onCancel: () => {
        this.dateTimePicker = null;
        setScrollMode({ mode: 1 });
      }
    });
    this.dateTimePicker.start();
  }

  showDueDatePicker() {
    // Hide main list
    setScrollMode({ mode: 0 });
    // hmApp.setLayerY(0) - not needed in API 3.0;

    this.dateTimePicker = new DateTimePicker({
      initialDate: this.task.dueDate || new Date(),
      showTime: true,
      onConfirm: (date) => {
        this.dateTimePicker = null;
        setScrollMode({ mode: 1 });
        this.saveDueDate(date);
      },
      onCancel: () => {
        this.dateTimePicker = null;
        setScrollMode({ mode: 1 });
      }
    });
    this.dateTimePicker.start();
  }

  saveStartDate(date) {
    if (this.isSaving) return;

    // Validate: start date must be before due date
    if (this.task.dueDate && date > this.task.dueDate) {
      hmUI.showToast({ text: t("Start must be before due date") });
      return;
    }

    this.isSaving = true;
    this.startDateRow.setText(t("Saving…"));
    createSpinner();

    this.task.setStartDate(date).then((resp) => {
      if (resp && resp.error) {
        this.isSaving = false;
        this.startDateRow.setText(this.formatDateTime(date));
        hmUI.showToast({ text: resp.error });
        return;
      }
      this.reloadEditScreen();
    }).catch((e) => {
      this.isSaving = false;
      this.startDateRow.setText(this.task.startDate ? this.formatDateTime(this.task.startDate) : t("Not set"));
      hmUI.showToast({ text: e.message || t("Failed to save") });
    });
  }

  clearStartDate() {
    if (this.isSaving) return;

    this.isSaving = true;
    createSpinner();

    this.task.setStartDate(null).then((resp) => {
      if (resp && resp.error) {
        this.isSaving = false;
        hmUI.showToast({ text: resp.error });
        return;
      }
      this.reloadEditScreen();
    }).catch((e) => {
      this.isSaving = false;
      hmUI.showToast({ text: e.message || t("Failed to clear") });
    });
  }

  saveDueDate(date) {
    if (this.isSaving) return;

    // Validate: due date must be after start date
    if (this.task.startDate && date < this.task.startDate) {
      hmUI.showToast({ text: t("Due must be after start date") });
      return;
    }

    this.isSaving = true;
    this.dueDateRow.setText(t("Saving…"));
    createSpinner();

    this.task.setDueDate(date).then((resp) => {
      if (resp && resp.error) {
        this.isSaving = false;
        this.dueDateRow.setText(this.formatDateTime(date));
        hmUI.showToast({ text: resp.error });
        return;
      }
      this.reloadEditScreen();
    }).catch((e) => {
      this.isSaving = false;
      this.dueDateRow.setText(this.task.dueDate ? this.formatDateTime(this.task.dueDate) : t("Not set"));
      hmUI.showToast({ text: e.message || t("Failed to save") });
    });
  }

  clearDueDate() {
    if (this.isSaving) return;

    this.isSaving = true;
    createSpinner();

    this.task.setDueDate(null).then((resp) => {
      if (resp && resp.error) {
        this.isSaving = false;
        hmUI.showToast({ text: resp.error });
        return;
      }
      this.reloadEditScreen();
    }).catch((e) => {
      this.isSaving = false;
      hmUI.showToast({ text: e.message || t("Failed to clear") });
    });
  }

  /**
   * Open reminder picker screen with all options
   */
  showReminderPicker() {
    const paramObj = {
      listId: this.listId,
      taskId: this.taskId,
      currentAlarm: this.task.alarm,
      startDate: this.task.startDate ? this.task.startDate.getTime() : null,
      dueDate: this.task.dueDate ? this.task.dueDate.getTime() : null
    };
    // Store params in config as workaround for API 3.0 push() not passing params
    config.set("_reminderPickerParams", paramObj);

    // ALSO store TaskEditScreen params - it will be reconstructed when we back()
    config.set("_editTaskParams", { list_id: this.listId, task_id: this.taskId });

    push({
      url: "page/amazfit/ReminderPickerScreen",
      param: JSON.stringify(paramObj)
    });
  }

  /**
   * Open app-based reminder settings screen
   */
  showAppBasedReminderSettings() {
    // Pass essential task data directly - getTask() creates empty shell without fetching
    const paramObj = {
      list_id: this.listId,
      task_id: this.taskId,
      // Include task data needed for app-based reminders
      task_data: {
        uid: this.task.uid,
        title: this.task.title,
        dueDate: this.task.dueDate ? this.task.dueDate.toISOString() : null,
        alarm: this.task.alarm,
        valarm: this.task.valarm
      }
    };

    // Save params for AppBasedReminderSettings
    config.set("_appReminderSettingsParams", paramObj);
    console.log("showAppBasedReminderSettings: Saved params with task_data");

    // Also restore TaskEditScreen params to config so they're available when back() returns here
    config.set("_editTaskParams", { list_id: this.listId, task_id: this.taskId });

    push({
      url: "page/amazfit/AppBasedReminderSettings",
      param: JSON.stringify(paramObj)
    });
  }

  /**
   * Open time picker (remind me in X hours/minutes from now)
   */
  showDurationPicker() {
    this.durationPicker = new TimePicker({
      initialHour: 0,
      initialMinute: 30,
      onSelect: () => {},
      onConfirm: (hours, minutes) => {
        this.hideDurationPicker();
        // Calculate absolute time: NOW + duration
        const totalMinutes = hours * 60 + minutes;
        const reminderDate = new Date(Date.now() + totalMinutes * 60 * 1000);
        this.saveAbsoluteAlarm(reminderDate);
      }
    });
    this.durationPicker.render();
    // hmApp.setLayerY(0) - not needed in API 3.0;
    setScrollMode({ mode: 0 });
  }

  hideDurationPicker() {
    if (this.durationPicker) {
      this.durationPicker.destroy();
      this.durationPicker = null;
      setScrollMode({ mode: 1 });
    }
  }

  /**
   * Open date/time picker for absolute reminder time
   */
  showAbsoluteReminderPicker() {
    // Default to tomorrow same time
    const defaultDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

    this.reminderDateTimePicker = new DateTimePicker({
      initialDate: defaultDate,
      onSelect: () => {},
      onConfirm: (date) => {
        this.hideReminderDateTimePicker();
        this.saveAbsoluteAlarm(date);
      },
      onCancel: () => this.hideReminderDateTimePicker()
    });
    this.reminderDateTimePicker.start();
    setScrollMode({ mode: 0 });
  }

  hideReminderDateTimePicker() {
    if (this.reminderDateTimePicker) {
      this.reminderDateTimePicker.destroy();
      this.reminderDateTimePicker = null;
      setScrollMode({ mode: 1 });
    }
  }

  /**
   * Save absolute alarm time
   */
  saveAbsoluteAlarm(date) {
    if (this.isSaving) return;

    this.isSaving = true;
    createSpinner();

    this.task.setAlarmAbsolute(date).then((resp) => {
      if (resp && resp.error) {
        this.isSaving = false;
        hmUI.showToast({ text: resp.error });
        return;
      }
      this.reloadEditScreen();
    }).catch((e) => {
      this.isSaving = false;
      hmUI.showToast({ text: e.message || t("Failed to save") });
    });
  }

  /**
   * Check if a reminder was selected and save it
   */
  checkReminderSelection() {
    const selection = config.get("_selectedReminder");
    if (!selection || selection.taskId !== this.taskId) return;

    // Clear the selection
    config.set("_selectedReminder", null);

    // Save the alarm based on type
    this.isSaving = true;
    if (this.alarmRow) this.alarmRow.setText(t("Saving…"));
    createSpinner();

    let savePromise;
    if (selection.type === 'remind_in') {
      // Remind me in: Set DUE date AND VALARM in one request
      const newDueDate = new Date(selection.dueDate);
      if (typeof this.task.setDueDateWithAlarm === 'function') {
        savePromise = this.task.setDueDateWithAlarm(newDueDate, selection.minutes);
      } else {
        // Fallback for non-CalDAV tasks: just set due date
        savePromise = this.task.setDueDate ? this.task.setDueDate(newDueDate) : Promise.resolve();
      }
    } else {
      // Relative: minutes before due (default)
      savePromise = this.task.setAlarm(selection.minutes);
    }

    savePromise.then((resp) => {
      if (resp && resp.error) {
        this.isSaving = false;
        if (this.alarmRow) {
          this.alarmRow.setText(this.task.formatAlarm ? this.task.formatAlarm() : t("Not set"));
        }
        hmUI.showToast({ text: resp.error });
        return;
      }
      this.reloadEditScreen();
    }).catch((e) => {
      this.isSaving = false;
      if (this.alarmRow) {
        this.alarmRow.setText(this.task.formatAlarm ? this.task.formatAlarm() : t("Not set"));
      }
      hmUI.showToast({ text: e.message || t("Failed to save") });
    });
  }

  clearAlarm() {
    if (this.isSaving) return;

    this.isSaving = true;
    createSpinner();

    // Cancel app-based reminder alarms when VALARM is cleared
    if (this.task.uid) {
      console.log("Cancelling app-based reminder alarms for task (VALARM cleared):", this.task.uid);
      cancelTaskAlarms(this.task.uid);
    }

    this.task.setAlarm(null).then((resp) => {
      if (resp && resp.error) {
        this.isSaving = false;
        hmUI.showToast({ text: resp.error });
        return;
      }
      this.reloadEditScreen();
    }).catch((e) => {
      this.isSaving = false;
      hmUI.showToast({ text: e.message || t("Failed to clear") });
    });
  }

  showTitleEditor() {
    this.currentKeyboard = createKeyboard({
      inputType: inputType.CHAR,
      text: this.task.title || "",
      onComplete: (keyboardWidget, result) => {
        try {
          deleteKeyboard();
        } catch (e) {
          console.log("Error deleting keyboard:", e);
        }
        this.currentKeyboard = null;
        this.doOverrideTitle(result.data);
      },
      onCancel: () => {
        try {
          deleteKeyboard();
        } catch (e) {
          console.log("Error deleting keyboard on cancel:", e);
        }
        this.currentKeyboard = null;
      }
    });
  }

  showNotesEditor() {
    this.currentKeyboard = createKeyboard({
      inputType: inputType.CHAR,
      text: this.task.description || "",
      onComplete: (keyboardWidget, result) => {
        try {
          deleteKeyboard();
        } catch (e) {
          console.log("Error deleting keyboard:", e);
        }
        this.currentKeyboard = null;
        this.doOverrideNotes(result.data);
      },
      onCancel: () => {
        try {
          deleteKeyboard();
        } catch (e) {
          console.log("Error deleting keyboard on cancel:", e);
        }
        this.currentKeyboard = null;
      }
    });
  }

  showSubtaskEditor() {
    this.currentKeyboard = createKeyboard({
      inputType: inputType.CHAR,
      text: "",
      onComplete: (keyboardWidget, result) => {
        try {
          deleteKeyboard();
        } catch (e) {
          console.log("Error deleting keyboard:", e);
        }
        this.currentKeyboard = null;
        this.doCreateSubtask(result.data);
      },
      onCancel: () => {
        try {
          deleteKeyboard();
        } catch (e) {
          console.log("Error deleting keyboard on cancel:", e);
        }
        this.currentKeyboard = null;
      }
    });
  }

  showPriorityEditor() {
    this.priorityPicker = new PriorityPicker({
      initialPriority: this.task.priority,
      onConfirm: (priority) => this.doOverridePriority(priority),
      onCancel: () => this.hidePriorityPicker()
    });
    this.priorityPicker.render();
    // hmApp.setLayerY(0) - not needed in API 3.0;
    setScrollMode({ mode: 0 });
  }

  hidePriorityPicker() {
    if (this.priorityPicker) {
      this.priorityPicker.destroy();
      this.priorityPicker = null;
      setScrollMode({ mode: 1 });
    }
  }

  /**
   * Hide any visible keyboard/picker, discard changes, and return true if one was hidden
   */
  hideKeyboardIfVisible() {
    if (this.titleBoard && this.titleBoard.visible) {
      this.titleBoard.visible = false;
      this.titleBoard.value = this.task.title; // Discard changes
      setScrollMode({ mode: 1 });
      return true;
    }
    if (this.notesBoard && this.notesBoard.visible) {
      this.notesBoard.visible = false;
      this.notesBoard.value = this.task.description || ""; // Discard changes
      setScrollMode({ mode: 1 });
      return true;
    }
    if (this.subtaskBoard && this.subtaskBoard.visible) {
      this.subtaskBoard.visible = false;
      this.subtaskBoard.value = ""; // Clear for next time
      setScrollMode({ mode: 1 });
      return true;
    }
    if (this.priorityPicker) {
      this.hidePriorityPicker();
      return true;
    }
    if (this.durationPicker) {
      this.hideDurationPicker();
      return true;
    }
    if (this.reminderDateTimePicker) {
      this.hideReminderDateTimePicker();
      return true;
    }
    if (this.dateTimePicker) {
      this.dateTimePicker.destroy();
      this.dateTimePicker = null;
      setScrollMode({ mode: 1 });
      return true;
    }
    return false;
  }

  showCategoryPicker() {
    const paramObj = {
      listId: this.listId,
      taskId: this.taskId,
      currentCategories: this.task.categories || []
    };
    // Store params in config as workaround for API 3.0 push() not passing params
    config.set("_categoryPickerParams", paramObj);

    // ALSO store TaskEditScreen params - it will be reconstructed when we back()
    config.set("_editTaskParams", { list_id: this.listId, task_id: this.taskId });

    push({
      url: "page/amazfit/CategoryPickerScreen",
      param: JSON.stringify(paramObj)
    });
  }

  doDelete() {
    if(this.isSaving) return;

    // Require double-tap to confirm
    if(this.deleteConfirm > 0) {
      this.deleteConfirm--;
      this.deleteRow.setText(t("Tap again to delete"));
      hmUI.showToast({ text: t("Tap again to confirm") });
      return;
    }

    this.isSaving = true;
    this.deleteRow.setText(t("Deleting…"));

    // Cancel app-based reminder alarms before deleting task
    if (this.task.uid) {
      console.log("Cancelling app-based reminder alarms for task:", this.task.uid);
      cancelTaskAlarms(this.task.uid);
    }

    createSpinner();
    this.task.delete().then((resp) => {
      if (resp && resp.error) {
        this.isSaving = false;
        this.deleteRow.setText(t("Delete"));
        hmUI.showToast({ text: resp.error });
        return;
      }
      back();
    }).catch((e) => {
      this.isSaving = false;
      this.deleteRow.setText(t("Delete"));
      hmUI.showToast({ text: e.message || t("Failed to delete") });
    });
  }

  doOverrideTitle(value) {
    if(this.isSaving) return;

    this.isSaving = true;
    createSpinner();
    this.task.setTitle(value).then((resp) => {
      this.isSaving = false;
      if (resp && resp.error) {
        hmUI.showToast({ text: resp.error });
        return;
      }
      this.reloadEditScreen();
    }).catch((e) => {
      this.isSaving = false;
      hmUI.showToast({ text: e.message || t("Failed to save") });
    });
  }

  doOverrideNotes(value) {
    if(this.isSaving) return;

    // Check if task supports notes
    if (typeof this.task.setDescription !== 'function') {
      hmUI.showToast({ text: t("Notes not supported") });
      return;
    }

    this.isSaving = true;
    createSpinner();
    this.task.setDescription(value).then((resp) => {
      this.isSaving = false;
      if (resp && resp.error) {
        hmUI.showToast({ text: resp.error });
        return;
      }
      this.reloadEditScreen();
    }).catch((e) => {
      this.isSaving = false;
      hmUI.showToast({ text: e.message || t("Failed to save") });
    });
  }

  doCreateSubtask(title) {
    if(this.isSaving) return;
    if(!title || !title.trim()) {
      hmUI.showToast({ text: t("Title required") });
      return;
    }

    this.isSaving = true;
    createSpinner();

    // Insert subtask with parent UID
    this.task.list.insertSubtask(title.trim(), this.task.uid).then((resp) => {
      this.isSaving = false;
      if (resp && resp.error) {
        hmUI.showToast({ text: resp.error });
        return;
      }
      this.reloadEditScreen();
    }).catch((e) => {
      this.isSaving = false;
      hmUI.showToast({ text: e.message || t("Failed to create") });
    });
  }

  doOverridePriority(priority) {
    if(this.isSaving) return;

    // Hide picker and show spinner
    this.hidePriorityPicker();
    this.isSaving = true;
    createSpinner();

    this.task.setPriority(priority).then((resp) => {
      if (resp && resp.error) {
        this.isSaving = false;
        hmUI.showToast({ text: resp.error });
        return;
      }
      this.reloadEditScreen();
    }).catch((e) => {
      this.isSaving = false;
      hmUI.showToast({ text: e.message || t("Failed to save") });
    });
  }

  captureGPSLocation() {
    if(this.isSaving) return;

    this.isSaving = true;
    this.locationRow.setText(t("Getting GPS…"));

    // API 3.0: Use Geolocation from @zos/sensor
    let geolocation = null;

    log("=== GPS Capture Start (API 3.0) ===");

    try {
      geolocation = new Geolocation();
      log("Geolocation instance created");
    } catch(e) {
      log("Geolocation creation error:", e.message || e);
      flushLog();
      this.isSaving = false;
      this.locationRow.setText(this.task.geo ? t("Update location") : t("Add current location"));
      hmUI.showToast({ text: t("GPS not available") });
      return;
    }

    let timeoutId = null;
    let acquired = false;

    const onGPSData = () => {
      if (acquired) return;

      try {
        // API 3.0: Check status - 'A' means positioning in progress, 'V' means invalid
        const status = geolocation.getStatus();
        log("GPS status:", status);

        if (status === 'A') {
          // API 3.0: Get coordinates using methods
          const lat = geolocation.getLatitude();
          const lon = geolocation.getLongitude();

          log("GPS data: lat=" + lat + " lon=" + lon + " (type: " + typeof lat + ", " + typeof lon + ")");
          flushLog();

          // Check if we have valid numeric coordinates
          if (lat !== undefined && lat !== null && lon !== undefined && lon !== null &&
              typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon) &&
              (lat !== 0 || lon !== 0)) {
            acquired = true;
            if (timeoutId) clearTimeout(timeoutId);

            try {
              geolocation.stop();
              log("GPS stopped successfully");
            } catch(e) {
              log("Error stopping GPS:", e.message || e);
            }

            console.log("GPS acquired:", lat, lon);
            this.saveLocation(lat, lon);
          } else {
            log("Invalid GPS data - waiting for valid coordinates");
          }
        } else {
          log("GPS not ready yet - status:", status);
        }
      } catch(e) {
        log("Error reading GPS data:", e.message || e);
      }
      flushLog();
    };

    try {
      // API 3.0: Start GPS and register callback
      geolocation.start();
      geolocation.onChange(onGPSData);
      log("GPS started, waiting for data...");
      flushLog();

      // Check immediately in case data is already available
      setTimeout(() => onGPSData(), 500);

      // Timeout after 30 seconds
      timeoutId = setTimeout(() => {
        if (!acquired) {
          try {
            geolocation.stop();
            log("GPS timeout - stopped");
          } catch(e) {
            log("Error stopping GPS on timeout:", e.message || e);
          }
          flushLog();
          this.isSaving = false;
          this.locationRow.setText(this.task.geo ? t("Update location") : t("Add current location"));
          hmUI.showToast({ text: t("GPS timeout") });
        }
      }, 30000);

    } catch(e) {
      log("GPS start error:", e.message || e);
      flushLog();
      this.isSaving = false;
      this.locationRow.setText(this.task.geo ? t("Update location") : t("Add current location"));
      hmUI.showToast({ text: t("GPS error: ") + (e.message || e) });
    }
  }

  saveLocation(lat, lon) {
    this.locationRow.setText(t("Saving…"));

    this.task.setLocation(lat, lon).then((resp) => {
      if (resp && resp.error) {
        this.isSaving = false;
        this.locationRow.setText(this.task.geo ? t("Update location") : t("Add current location"));
        hmUI.showToast({ text: resp.error });
        return;
      }
      this.reloadEditScreen();
    }).catch((e) => {
      this.isSaving = false;
      this.locationRow.setText(this.task.geo ? t("Update location") : t("Add current location"));
      hmUI.showToast({ text: e.message || t("Failed to save") });
    });
  }

  clearLocation() {
    if(this.isSaving) return;

    this.isSaving = true;
    createSpinner();

    this.task.setLocation(null, null, "").then((resp) => {
      if (resp && resp.error) {
        this.isSaving = false;
        hmUI.showToast({ text: resp.error });
        return;
      }
      this.reloadEditScreen();
    }).catch((e) => {
      this.isSaving = false;
      hmUI.showToast({ text: e.message || t("Failed to clear") });
    });
  }

  showCalendarPicker() {
    // Navigate to AddEventScreen with task data pre-filled
    const paramObj = {
      title: this.task.title,
      startDate: this.task.startDate ? this.task.startDate.getTime() : null,
      endDate: this.task.dueDate ? this.task.dueDate.getTime() : null,
      lat: this.task.geo ? this.task.geo.lat : null,
      lon: this.task.geo ? this.task.geo.lon : null,
      description: this.task.description || ""
    };

    // Store params in config as workaround for API 3.0 push() not passing params
    config.set("_addEventParams", paramObj);

    // ALSO store TaskEditScreen params - it will be reconstructed when we back()
    config.set("_editTaskParams", { list_id: this.listId, task_id: this.taskId });

    push({
      url: "page/amazfit/AddEventScreen",
      param: JSON.stringify(paramObj)
    });
  }
}

// noinspection JSCheckFunctionSignatures
Page({
  onInit(params) {
    setStatusBarVisible(true);
    updateStatusBarTitle("");

    setWakeUpRelaunch({ relaunch: true });
    setPageBrightTime({ brightTime: 15000 });

    // Initialize gesture handler for back swipe
    AppGesture.init();

    try {
      this.screen = new TaskEditScreen(params);

      // Intercept back swipe to hide keyboard instead of navigating back
      AppGesture.on("right", () => {
        if (this.screen && this.screen.hideKeyboardIfVisible()) {
          return true; // Prevent default back navigation
        }
        return false; // Allow default back navigation
      });

      this.screen.init();
    } catch(e) {
      console.log("TaskEditScreen error:", e);
      hmUI.showToast({ text: "Error: " + (e.message || e) });
    }
  },

  onDestroy() {
    setWakeUpRelaunch({ relaunch: false });
  }
})
