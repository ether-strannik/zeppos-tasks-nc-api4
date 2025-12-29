import hmUI, { setStatusBarVisible, updateStatusBarTitle, createKeyboard, deleteKeyboard, inputType } from "@zos/ui";
import { replace, back } from "@zos/router";
import { setScrollMode } from "@zos/page";
import {ConfiguredListScreen} from "../ConfiguredListScreen";
import {DateTimePicker} from "../../lib/mmk/DateTimePicker";
import {createSpinner, request, log, flushLog} from "../Utils";

const { t, config } = getApp()._options.globalData

class AddEventScreen extends ConfiguredListScreen {
  constructor() {
    super();

    // Event data
    this.title = "";
    this.startDate = null;
    this.endDate = null;
    this.lat = null;
    this.lon = null;
    this.description = "";
    this.isCapturingGPS = false;

    // Calendar selection
    this.calendars = [];
    this.selectedCalendarId = null;
    this.selectedCalendarTitle = "";
  }

  build() {
    this.headline(t("Add to Calendar"));

    // Load calendars first
    this.loadCalendars();

    // Title
    this.row({
      text: t("Title: ") + (this.title || t("(tap to set)")),
      icon: "icon_s/edit.png",
      callback: () => this.showTitleEditor()
    });

    // Start date/time
    this.row({
      text: t("Start: ") + this.formatDateTime(this.startDate),
      icon: "icon_s/calendar.png",
      callback: () => this.showStartDatePicker()
    });

    // End date/time
    this.row({
      text: t("End: ") + this.formatDateTime(this.endDate),
      icon: "icon_s/calendar.png",
      callback: () => this.showEndDatePicker()
    });

    // Location (GPS capture)
    const locationText = this.lat !== null && this.lon !== null
      ? `${this.lat.toFixed(6)}, ${this.lon.toFixed(6)}`
      : t("(none)");
    this.locationRow = this.row({
      text: t("Location: ") + locationText,
      icon: "icon_s/location.png",
      callback: () => this.captureGPSLocation()
    });

    // Description
    this.row({
      text: t("Notes: ") + (this.description ? this.description.substring(0, 20) + (this.description.length > 20 ? "..." : "") : t("(none)")),
      icon: "icon_s/edit.png",
      callback: () => this.showDescriptionEditor()
    });

    // Calendar selection
    this.offset(16);
    this.calendarRow = this.row({
      text: t("Calendar: ") + (this.selectedCalendarTitle || t("Loading...")),
      icon: "icon_s/list.png",
      callback: () => this.showCalendarPicker()
    });

    // Save button
    this.offset(16);
    this.row({
      text: t("Save Event"),
      icon: "icon_s/cb_true.png",
      callback: () => this.saveEvent()
    });

    this.offset();
  }

  loadCalendars() {
    request({
      package: "caldav_proxy",
      action: "get_event_calendars"
    }, 10000).then((calendars) => {
      if (Array.isArray(calendars) && calendars.length > 0) {
        this.calendars = calendars;
        // Select first calendar by default
        this.selectedCalendarId = calendars[0].id;
        this.selectedCalendarTitle = calendars[0].title;
        // Update UI
        if (this.calendarRow) {
          this.calendarRow.textView.setProperty(hmUI.prop.TEXT,
            t("Calendar: ") + this.selectedCalendarTitle);
        }
      } else {
        this.selectedCalendarTitle = t("No calendars found");
        if (this.calendarRow) {
          this.calendarRow.textView.setProperty(hmUI.prop.TEXT,
            t("Calendar: ") + this.selectedCalendarTitle);
        }
      }
    }).catch((e) => {
      console.log("Failed to load calendars:", e);
      this.selectedCalendarTitle = t("Error loading");
    });
  }

  rebuild() {
    setScrollMode({ mode: 1 });
    replace({
      url: "page/amazfit/AddEventScreen",
      param: JSON.stringify({
        title: this.title,
        startDate: this.startDate ? this.startDate.getTime() : null,
        endDate: this.endDate ? this.endDate.getTime() : null,
        lat: this.lat,
        lon: this.lon,
        description: this.description,
        selectedCalendarId: this.selectedCalendarId,
        selectedCalendarTitle: this.selectedCalendarTitle
      })
    });
  }

  formatDateTime(date) {
    if (!date) return t("(tap to set)");
    const d = date;
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  formatDateTimeForCalDAV(date) {
    if (!date) return null;
    const d = date;
    return d.getFullYear().toString() +
      (d.getMonth() + 1).toString().padStart(2, "0") +
      d.getDate().toString().padStart(2, "0") + "T" +
      d.getHours().toString().padStart(2, "0") +
      d.getMinutes().toString().padStart(2, "0") +
      d.getSeconds().toString().padStart(2, "0");
  }

  showTitleEditor() {
    createKeyboard({
      inputType: inputType.CHAR,
      text: this.title || "",
      onComplete: (keyboardWidget, result) => {
        try {
          deleteKeyboard();
        } catch (e) {
          console.log("Error deleting keyboard:", e);
        }
        this.title = result.data || "";
        this.rebuild();
      },
      onCancel: () => {
        try {
          deleteKeyboard();
        } catch (e) {
          console.log("Error deleting keyboard on cancel:", e);
        }
      }
    });
  }

  captureGPSLocation() {
    if (this.isCapturingGPS) return;

    this.isCapturingGPS = true;
    this.locationRow.setText(t("Getting GPS…"));

    // Try hmSensor API (available on most devices)
    let geolocation = null;

    log("=== GPS Capture Start (AddEvent) ===");

    try {
      if (typeof hmSensor !== 'undefined' && hmSensor.id) {
        // Try GEOLOCATION first
        if (hmSensor.id.GEOLOCATION !== undefined) {
          geolocation = hmSensor.createSensor(hmSensor.id.GEOLOCATION);
          log("Created GEOLOCATION sensor");
        }
        // Some devices might use GPS instead
        else if (hmSensor.id.GPS !== undefined) {
          geolocation = hmSensor.createSensor(hmSensor.id.GPS);
          log("Created GPS sensor");
        }
      }
    } catch(e) {
      log("Sensor creation error:", e.message || e);
    }
    flushLog();

    if (!geolocation) {
      this.isCapturingGPS = false;
      this.locationRow.setText(t("Location: ") + t("(none)"));
      hmUI.showToast({ text: t("GPS not available") });
      return;
    }

    let timeoutId = null;
    let acquired = false;

    const onGPSData = () => {
      if (acquired) return;

      let lat = geolocation.latitude;
      let lon = geolocation.longitude;

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
      }
      if (lon && typeof lon === 'object') {
        lon = dmsToDecimal(lon);
      }

      // Some APIs might use getLatitude/getLongitude methods
      if ((lat === undefined || lat === null || typeof lat === 'object') && typeof geolocation.getLatitude === 'function') {
        lat = geolocation.getLatitude();
        lon = geolocation.getLongitude();
      }

      log("GPS data: lat=" + lat + " lon=" + lon);
      flushLog();

      // Check if we have valid coordinates
      if (lat !== undefined && lon !== undefined && lat !== null && lon !== null && (lat !== 0 || lon !== 0)) {
        acquired = true;
        if (timeoutId) clearTimeout(timeoutId);

        try {
          geolocation.stop();
        } catch(e) {}

        this.isCapturingGPS = false;
        this.lat = lat;
        this.lon = lon;
        this.rebuild();
      }
    };

    try {
      // Start GPS
      geolocation.start();

      // Register callback
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
          this.isCapturingGPS = false;
          const locationText = this.lat !== null && this.lon !== null
            ? `${this.lat.toFixed(6)}, ${this.lon.toFixed(6)}`
            : t("(none)");
          this.locationRow.setText(t("Location: ") + locationText);
          hmUI.showToast({ text: t("GPS timeout") });
        }
      }, 30000);

    } catch(e) {
      log("GPS start error:", e.message || e);
      this.isCapturingGPS = false;
      this.locationRow.setText(t("Location: ") + t("(none)"));
      hmUI.showToast({ text: t("GPS error: ") + e.message });
    }
  }

  showDescriptionEditor() {
    createKeyboard({
      inputType: inputType.CHAR,
      text: this.description || "",
      onComplete: (keyboardWidget, result) => {
        try {
          deleteKeyboard();
        } catch (e) {
          console.log("Error deleting keyboard:", e);
        }
        this.description = result.data || "";
        this.rebuild();
      },
      onCancel: () => {
        try {
          deleteKeyboard();
        } catch (e) {
          console.log("Error deleting keyboard on cancel:", e);
        }
      }
    });
  }

  showStartDatePicker() {
    setScrollMode({ mode: 0 });
    // hmApp.setLayerY(0);

    this.dateTimePicker = new DateTimePicker({
      initialDate: this.startDate || new Date(),
      showTime: true,
      onConfirm: (date) => {
        this.dateTimePicker = null;
        this.startDate = date;
        // If end date not set or before start, set end = start + 1 hour
        if (!this.endDate || this.endDate <= date) {
          this.endDate = new Date(date.getTime() + 60 * 60 * 1000);
        }
        this.rebuild();
      },
      onCancel: () => {
        this.dateTimePicker = null;
        setScrollMode({ mode: 1 });
      }
    });
    this.dateTimePicker.start();
  }

  showEndDatePicker() {
    setScrollMode({ mode: 0 });
    // hmApp.setLayerY(0);

    this.dateTimePicker = new DateTimePicker({
      initialDate: this.endDate || this.startDate || new Date(),
      showTime: true,
      onConfirm: (date) => {
        this.dateTimePicker = null;
        // Validate: end must be after start
        if (this.startDate && date <= this.startDate) {
          hmUI.showToast({ text: t("End must be after start") });
          setScrollMode({ mode: 1 });
          return;
        }
        this.endDate = date;
        this.rebuild();
      },
      onCancel: () => {
        this.dateTimePicker = null;
        setScrollMode({ mode: 1 });
      }
    });
    this.dateTimePicker.start();
  }

  showCalendarPicker() {
    if (this.calendars.length === 0) {
      hmUI.showToast({ text: t("No calendars available") });
      return;
    }

    // For now, cycle through calendars on tap
    const currentIndex = this.calendars.findIndex(c => c.id === this.selectedCalendarId);
    const nextIndex = (currentIndex + 1) % this.calendars.length;
    this.selectedCalendarId = this.calendars[nextIndex].id;
    this.selectedCalendarTitle = this.calendars[nextIndex].title;

    if (this.calendarRow) {
      this.calendarRow.textView.setProperty(hmUI.prop.TEXT,
        t("Calendar: ") + this.selectedCalendarTitle);
    }
  }

  saveEvent() {
    // Validate
    if (!this.title || !this.title.trim()) {
      hmUI.showToast({ text: t("Title required") });
      return;
    }
    if (!this.startDate) {
      hmUI.showToast({ text: t("Start date required") });
      return;
    }
    if (!this.selectedCalendarId) {
      hmUI.showToast({ text: t("Select a calendar") });
      return;
    }

    const hideSpinner = createSpinner();

    // Format location as coordinates string if GPS was captured
    const locationStr = this.lat !== null && this.lon !== null
      ? `${this.lat.toFixed(6)}, ${this.lon.toFixed(6)}`
      : null;

    const event = {
      title: this.title.trim(),
      dtstart: this.formatDateTimeForCalDAV(this.startDate),
      dtend: this.endDate ? this.formatDateTimeForCalDAV(this.endDate) : null,
      location: locationStr,
      description: this.description || null
    };

    request({
      package: "caldav_proxy",
      action: "insert_event",
      calendarId: this.selectedCalendarId,
      event: event
    }, 10000).then((resp) => {
      hideSpinner();
      if (resp && resp.error) {
        hmUI.showToast({ text: resp.error });
        return;
      }
      hmUI.showToast({ text: t("Event created") });
      back();
    }).catch((e) => {
      hideSpinner();
      hmUI.showToast({ text: e.message || t("Failed to save") });
    });
  }
}

Page({
  onInit(param) {
    setStatusBarVisible(true);
    updateStatusBarTitle(t("Add to Calendar"));

    const screen = new AddEventScreen();

    // Parse params
    let state = null;
    try {
      state = param ? JSON.parse(param) : null;
    } catch(e) {
      state = null;
    }

    // Fallback: read from config if push() didn't pass params (API 3.0 issue)
    if (!state) {
      const savedParams = config.get("_addEventParams");
      if (savedParams) {
        state = savedParams;
        config.set("_addEventParams", null); // Clear after use
      }
    }

    // Restore state if available
    if (state) {
      screen.title = state.title || "";
      screen.startDate = state.startDate ? new Date(state.startDate) : null;
      screen.endDate = state.endDate ? new Date(state.endDate) : null;
      screen.lat = state.lat !== undefined ? state.lat : null;
      screen.lon = state.lon !== undefined ? state.lon : null;
      screen.description = state.description || "";
      screen.selectedCalendarId = state.selectedCalendarId || null;
      screen.selectedCalendarTitle = state.selectedCalendarTitle || "";
    }

    screen.build();
  }
})
