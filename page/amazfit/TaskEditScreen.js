import hmUI, { setStatusBarVisible, updateStatusBarTitle } from "@zos/ui";
import { replace, push, back } from "@zos/router";
import { setWakeUpRelaunch, setPageBrightTime } from "@zos/display";
import { setScrollMode } from "@zos/page";
import {ListScreen} from "../../lib/mmk/ListScreen";
import {ScreenBoard} from "../../lib/mmk/ScreenBoard";
import {DateTimePicker} from "../../lib/mmk/DateTimePicker";
import {TimePicker} from "../../lib/mmk/TimePicker";
import {PriorityPicker} from "../../lib/mmk/PriorityPicker";
import {AppGesture} from "../../lib/mmk/AppGesture";
import {createSpinner, log, flushLog, request} from "../Utils";

const { t, config, tasksProvider } = getApp()._options.globalData

class TaskEditScreen extends ListScreen {
  constructor(param) {
    super();
    this.isSaving = false;
    this.deleteConfirm = 1; // Requires 2 taps to delete

    param = JSON.parse(param);
    this.listId = param.list_id;
    this.taskId = param.task_id;
    this.task = tasksProvider.getTaskList(this.listId).getTask(this.taskId);
  }

  init() {
    const hideSpinner = createSpinner();
    this.task.sync().then(() => {
      hideSpinner();
      this.build();
    }).catch((e) => {
      console.log("Sync error:", e);
      hideSpinner();
      this.build();
    });
  }

  /**
   * Reload the edit screen to show updated data
   */
  reloadEditScreen() {
    replace({
      url: "page/amazfit/TaskEditScreen",
      param: JSON.stringify({ list_id: this.listId, task_id: this.taskId })
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
        icon: "icon_s/edit.png",
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
        icon: "icon_s/edit.png",
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
        icon: "icon_s/edit.png",
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
        icon: "icon_s/edit.png",
        callback: () => this.showReminderPicker()
      });

      // Clear option if alarm is set
      if (this.task.alarm !== null) {
        this.row({
          text: t("Clear reminder"),
          icon: "icon_s/delete.png",
          callback: () => this.clearAlarm()
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
        icon: "icon_s/edit.png",
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

    // Setup keyboard for title editing
    this.titleBoard = new ScreenBoard();
    this.titleBoard.title = t("Edit title");
    this.titleBoard.value = this.task.title;
    this.titleBoard.confirmButtonText = t("Save");
    this.titleBoard.onConfirm = (v) => this.doOverrideTitle(v);
    this.titleBoard.visible = false;

    // Setup keyboard for notes editing
    this.notesBoard = new ScreenBoard();
    this.notesBoard.title = t("Edit notes");
    this.notesBoard.value = this.task.description || "";
    this.notesBoard.confirmButtonText = t("Save");
    this.notesBoard.onConfirm = (v) => this.doOverrideNotes(v);
    this.notesBoard.visible = false;

    // Setup keyboard for subtask creation (CalDAV only)
    if (this.task.uid) {
      this.subtaskBoard = new ScreenBoard();
      this.subtaskBoard.title = t("New subtask");
      this.subtaskBoard.value = "";
      this.subtaskBoard.confirmButtonText = t("Create");
      this.subtaskBoard.onConfirm = (v) => this.doCreateSubtask(v);
      this.subtaskBoard.visible = false;
    }

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
    push({
      url: "page/amazfit/ReminderPickerScreen",
      param: JSON.stringify({
        listId: this.listId,
        taskId: this.taskId,
        currentAlarm: this.task.alarm,
        startDate: this.task.startDate ? this.task.startDate.getTime() : null,
        dueDate: this.task.dueDate ? this.task.dueDate.getTime() : null
      })
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
    this.titleBoard.visible = true;
    // hmApp.setLayerY(0) - not needed in API 3.0;
    setScrollMode({ mode: 0 });
  }

  showNotesEditor() {
    this.notesBoard.visible = true;
    // hmApp.setLayerY(0) - not needed in API 3.0;
    setScrollMode({ mode: 0 });
  }

  showSubtaskEditor() {
    this.subtaskBoard.visible = true;
    // hmApp.setLayerY(0) - not needed in API 3.0;
    setScrollMode({ mode: 0 });
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
      this.dateTimePicker = null;
      setScrollMode({ mode: 1 });
      return true;
    }
    return false;
  }

  showCategoryPicker() {
    push({
      url: "page/amazfit/CategoryPickerScreen",
      param: JSON.stringify({
        listId: this.listId,
        taskId: this.taskId,
        currentCategories: this.task.categories || []
      })
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
    this.titleBoard.confirmButtonText = t("Saving, wait…");
    this.task.setTitle(value).then((resp) => {
      if (resp && resp.error) {
        this.isSaving = false;
        this.titleBoard.confirmButtonText = t("Save");
        hmUI.showToast({ text: resp.error });
        return;
      }
      this.reloadEditScreen();
    }).catch((e) => {
      this.isSaving = false;
      this.titleBoard.confirmButtonText = t("Save");
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
    this.notesBoard.confirmButtonText = t("Saving, wait…");
    this.task.setDescription(value).then((resp) => {
      if (resp && resp.error) {
        this.isSaving = false;
        this.notesBoard.confirmButtonText = t("Save");
        hmUI.showToast({ text: resp.error });
        return;
      }
      this.reloadEditScreen();
    }).catch((e) => {
      this.isSaving = false;
      this.notesBoard.confirmButtonText = t("Save");
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
    this.subtaskBoard.confirmButtonText = t("Creating…");

    // Insert subtask with parent UID
    this.task.list.insertSubtask(title.trim(), this.task.uid).then((resp) => {
      if (resp && resp.error) {
        this.isSaving = false;
        this.subtaskBoard.confirmButtonText = t("Create");
        hmUI.showToast({ text: resp.error });
        return;
      }
      this.reloadEditScreen();
    }).catch((e) => {
      this.isSaving = false;
      this.subtaskBoard.confirmButtonText = t("Create");
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

    // Try hmSensor API (available on most devices)
    let geolocation = null;

    log("=== GPS Capture Start ===");

    try {
      if (typeof hmSensor !== 'undefined' && hmSensor.id) {
        // Check available sensor IDs
        const sensorIds = Object.keys(hmSensor.id);
        log("Available sensors:", sensorIds.join(', '));

        // Try GEOLOCATION first
        if (hmSensor.id.GEOLOCATION !== undefined) {
          log("GEOLOCATION id:", hmSensor.id.GEOLOCATION);
          geolocation = hmSensor.createSensor(hmSensor.id.GEOLOCATION);
          log("Created GEOLOCATION sensor");
        }
        // Some devices might use GPS instead
        else if (hmSensor.id.GPS !== undefined) {
          log("GPS id:", hmSensor.id.GPS);
          geolocation = hmSensor.createSensor(hmSensor.id.GPS);
          log("Created GPS sensor");
        } else {
          log("No GEOLOCATION or GPS in sensor IDs");
        }
      } else {
        log("hmSensor not available");
      }
    } catch(e) {
      log("Sensor creation error:", e.message || e);
    }
    flushLog();

    if (!geolocation) {
      this.isSaving = false;
      this.locationRow.setText(this.task.geo ? t("Update location") : t("Add current location"));
      hmUI.showToast({ text: t("GPS not available") });
      return;
    }

    let timeoutId = null;
    let acquired = false;

    const onGPSData = () => {
      if (acquired) return;

      // Log sensor object properties for debugging
      log("Sensor props:", Object.keys(geolocation).join(', '));

      // Try different property names that different API versions might use
      let lat = geolocation.latitude;
      let lon = geolocation.longitude;

      // Log raw values and their types
      log("Raw lat type:", typeof lat, "value:", JSON.stringify(lat));
      log("Raw lon type:", typeof lon, "value:", JSON.stringify(lon));

      // Convert DMS (Degrees, Minutes, Seconds) to decimal degrees
      function dmsToDecimal(dms) {
        if (!dms || typeof dms !== 'object') return dms;
        if (dms.degrees === undefined) return dms;

        let decimal = Math.abs(dms.degrees) + (dms.minutes || 0) / 60 + (dms.seconds || 0) / 3600;

        // Handle direction: S and W are negative
        if (dms.direction === 'S' || dms.direction === 'W') {
          decimal = -decimal;
        }
        return decimal;
      }

      // If lat/lon are objects (DMS format), convert to decimal
      if (lat && typeof lat === 'object') {
        lat = dmsToDecimal(lat);
        log("Converted lat:", lat);
      }
      if (lon && typeof lon === 'object') {
        lon = dmsToDecimal(lon);
        log("Converted lon:", lon);
      }

      // Some APIs might use getLatitude/getLongitude methods
      if ((lat === undefined || lat === null || typeof lat === 'object') && typeof geolocation.getLatitude === 'function') {
        lat = geolocation.getLatitude();
        lon = geolocation.getLongitude();
        log("From methods: lat=", lat, "lon=", lon);
      }

      log("Final GPS data: lat=" + lat + " lon=" + lon);
      flushLog();

      // Check if we have valid coordinates
      if (lat !== undefined && lon !== undefined && lat !== null && lon !== null && (lat !== 0 || lon !== 0)) {
        acquired = true;
        if (timeoutId) clearTimeout(timeoutId);

        try {
          geolocation.stop();
        } catch(e) {
          console.log("Error stopping GPS:", e);
        }

        console.log("GPS acquired:", lat, lon);
        this.saveLocation(lat, lon);
      }
    };

    try {
      // Start GPS
      geolocation.start();

      // Register callback - try different event names
      if (typeof geolocation.onChange === 'function') {
        geolocation.onChange(onGPSData);
      } else if ('onGPS' in geolocation) {
        geolocation.onGPS = onGPSData;
      }

      // Check immediately in case data is already available
      setTimeout(() => onGPSData(), 500);

      // Timeout after 30 seconds
      timeoutId = setTimeout(() => {
        if (!acquired) {
          try {
            geolocation.stop();
          } catch(e) {}
          this.isSaving = false;
          this.locationRow.setText(this.task.geo ? t("Update location") : t("Add current location"));
          hmUI.showToast({ text: t("GPS timeout") });
        }
      }, 30000);

    } catch(e) {
      console.log("GPS start error:", e);
      this.isSaving = false;
      this.locationRow.setText(this.task.geo ? t("Update location") : t("Add current location"));
      hmUI.showToast({ text: t("GPS error: ") + e.message });
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
    push({
      url: "page/amazfit/AddEventScreen",
      param: JSON.stringify({
        title: this.task.title,
        startDate: this.task.startDate ? this.task.startDate.getTime() : null,
        endDate: this.task.dueDate ? this.task.dueDate.getTime() : null,
        lat: this.task.geo ? this.task.geo.lat : null,
        lon: this.task.geo ? this.task.geo.lon : null,
        description: this.task.description || ""
      })
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
      console.log(e);
    }
  },

  onDestroy() {
    setWakeUpRelaunch({ relaunch: false });
  }
})
