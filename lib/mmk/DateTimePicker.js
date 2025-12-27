/**
 * DateTimePicker - Combined date and time picker screen
 */

import hmUI from "@zos/ui";
import { CalendarPicker } from "./CalendarPicker";
import { TimePicker } from "./TimePicker";
import { SCREEN_WIDTH, SCREEN_HEIGHT, SCREEN_MARGIN_X, SCREEN_MARGIN_Y } from "./UiParams";

export class DateTimePicker {
  constructor(options = {}) {
    this.onConfirm = options.onConfirm ?? (() => {});
    this.onCancel = options.onCancel ?? (() => {});
    this.showTime = options.showTime ?? true;

    // Initial date/time
    const initDate = options.initialDate ?? new Date();
    this.selectedYear = initDate.getFullYear();
    this.selectedMonth = initDate.getMonth();
    this.selectedDay = initDate.getDate();
    this.selectedHour = initDate.getHours();
    this.selectedMinute = initDate.getMinutes();

    this.mode = "date";
    this.widgets = [];
    this.calendarPicker = null;
    this.timePicker = null;
  }

  start() {
    this.renderDateMode();
  }

  renderDateMode() {
    this.destroy();
    this.mode = "date";

    // Start calendar lower for easier month navigation
    const startY = Math.max(50, SCREEN_MARGIN_Y);

    // Calendar picker
    this.calendarPicker = new CalendarPicker({
      x: SCREEN_MARGIN_X,
      y: startY,
      width: SCREEN_WIDTH - SCREEN_MARGIN_X * 2,
      initialDate: new Date(this.selectedYear, this.selectedMonth, this.selectedDay),
      onSelect: (year, month, day) => {
        this.selectedYear = year;
        this.selectedMonth = month;
        this.selectedDay = day;
        // Re-render buttons after selection
        this.renderButtons();
      }
    });
    this.calendarPicker.render();

    this.renderButtons();
  }

  renderButtons() {
    // Clear old buttons
    for (const widget of this.widgets) {
      hmUI.deleteWidget(widget);
    }
    this.widgets = [];

    const startY = Math.max(50, SCREEN_MARGIN_Y);
    const calendarBottom = startY + this.calendarPicker.getHeight();
    const btnY = calendarBottom + 6;
    const btnWidth = 100;
    const btnHeight = 36;

    // Single centered button (swipe left to cancel)
    const confirmBtn = hmUI.createWidget(hmUI.widget.BUTTON, {
      x: (SCREEN_WIDTH - btnWidth) / 2,
      y: btnY,
      w: btnWidth,
      h: btnHeight,
      text: this.showTime ? "Time >" : "OK",
      text_size: 16,
      radius: 18,
      normal_color: 0x00aaff,
      press_color: 0x0088cc,
      click_func: () => {
        const sel = this.calendarPicker.getSelected();
        this.selectedYear = sel.year;
        this.selectedMonth = sel.month;
        this.selectedDay = sel.day;

        if (this.showTime) {
          this.renderTimeMode();
        } else {
          this.confirm();
        }
      }
    });
    this.widgets.push(confirmBtn);
  }

  renderTimeMode() {
    this.destroy();
    this.mode = "time";

    // Time picker with numeric keypad (includes its own OK button)
    this.timePicker = new TimePicker({
      initialHour: this.selectedHour,
      initialMinute: this.selectedMinute,
      onSelect: (hour, minute) => {
        this.selectedHour = hour;
        this.selectedMinute = minute;
      },
      onConfirm: (hour, minute) => {
        this.selectedHour = hour;
        this.selectedMinute = minute;
        this.confirm();
      }
    });
    this.timePicker.render();
  }

  confirm() {
    const date = new Date(
      this.selectedYear,
      this.selectedMonth,
      this.selectedDay,
      this.selectedHour,
      this.selectedMinute,
      0
    );
    this.destroy();
    this.onConfirm(date);
  }

  getSelectedDate() {
    return new Date(
      this.selectedYear,
      this.selectedMonth,
      this.selectedDay,
      this.selectedHour,
      this.selectedMinute,
      0
    );
  }

  destroy() {
    if (this.calendarPicker) {
      this.calendarPicker.destroy();
      this.calendarPicker = null;
    }
    if (this.timePicker) {
      this.timePicker.destroy();
      this.timePicker = null;
    }
    for (const widget of this.widgets) {
      hmUI.deleteWidget(widget);
    }
    this.widgets = [];
  }
}
