import {t} from "../../lib/mmk/i18n";

/**
 * @implements TaskInterface
 */
export class CalDAVTask {
  constructor(data, list, handler) {
    this.id = data.id;
    this.etag = data.etag || "";

    this.rawData = data.rawData;
    const vtodo = data.rawData?.VCALENDAR?.VTODO;
    if(vtodo) {
      this.title = vtodo.SUMMARY || "";
      this.description = vtodo.DESCRIPTION || "";
      this.status = vtodo.STATUS || "NEEDS-ACTION";
      this.completed = this.status === "COMPLETED";
      this.inProgress = this.status === "IN-PROCESS";
      this.uid = vtodo.UID || null;
      this.parentId = this._getPropertyValue(vtodo, "RELATED-TO");
      this.priority = parseInt(vtodo.PRIORITY, 10) || 0;
      this.startDate = this._parseDueDate(this._getPropertyValue(vtodo, "DTSTART"));
      this.dueDate = this._parseDueDate(this._getPropertyValue(vtodo, "DUE"));
      this.location = vtodo.LOCATION || "";
      this.geo = this._parseGeo(vtodo.GEO);
      // Parse CATEGORIES (comma-separated string to array)
      const categoriesStr = vtodo.CATEGORIES || "";
      this.categories = categoriesStr ? categoriesStr.split(",").map(c => c.trim()) : [];
      // Parse VALARM (reminder) - get minutes before due/start
      this.alarm = this._parseAlarm(vtodo.VALARM);
    } else {
      this.title = "";
      this.description = "";
      this.status = "NEEDS-ACTION";
      this.completed = false;
      this.inProgress = false;
      this.uid = null;
      this.parentId = null;
      this.priority = 0;
      this.startDate = null;
      this.dueDate = null;
      this.location = "";
      this.geo = null;
      this.categories = [];
      this.alarm = null;
    }

    // Subtasks will be populated by CalDAVTaskList
    this.subtasks = [];

    this.list = list;
    this._handler = handler;
  }

  /**
   * Get property value, handling parameterized property names
   * e.g., "DTSTART" might be stored as "DTSTART;VALUE=DATE"
   */
  _getPropertyValue(vtodo, propName) {
    // Try exact match first
    if (vtodo[propName] !== undefined) {
      return vtodo[propName];
    }
    // Try parameterized versions (e.g., "DTSTART;VALUE=DATE")
    for (const key of Object.keys(vtodo)) {
      if (key === propName || key.startsWith(propName + ";")) {
        return vtodo[key];
      }
    }
    return null;
  }

  /**
   * Parse iCalendar DUE date string to Date object
   * Formats: 20231225T120000, 20231225T120000Z, 20231225
   */
  _parseDueDate(due) {
    if (!due) return null;

    try {
      // Remove any parameters (e.g., VALUE=DATE)
      const dateStr = due.toString();

      // Format: YYYYMMDD or YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
      const year = parseInt(dateStr.substring(0, 4), 10);
      const month = parseInt(dateStr.substring(4, 6), 10) - 1;
      const day = parseInt(dateStr.substring(6, 8), 10);

      if (dateStr.length === 8) {
        // Date only - set to end of day
        return new Date(year, month, day, 23, 59, 59);
      }

      // Has time component
      const hour = parseInt(dateStr.substring(9, 11), 10);
      const minute = parseInt(dateStr.substring(11, 13), 10);
      const second = parseInt(dateStr.substring(13, 15), 10) || 0;

      if (dateStr.endsWith('Z')) {
        // UTC time
        return new Date(Date.UTC(year, month, day, hour, minute, second));
      }

      // Local time
      return new Date(year, month, day, hour, minute, second);
    } catch (e) {
      console.log("Failed to parse DUE date:", due, e);
      return null;
    }
  }

  /**
   * Parse iCalendar GEO property to {lat, lon} object
   * Format: latitude;longitude (e.g., "37.386013;-122.082932")
   */
  _parseGeo(geo) {
    if (!geo) return null;

    try {
      const parts = geo.toString().split(';');
      if (parts.length === 2) {
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lon)) {
          return { lat, lon };
        }
      }
    } catch (e) {
      console.log("Failed to parse GEO:", geo, e);
    }
    return null;
  }

  /**
   * Parse VALARM component to get reminder info
   * Relative TRIGGER format: -PT15M (15 min before), -P1D (1 day before)
   * Absolute TRIGGER format: 20231225T100000Z or with VALUE=DATE-TIME parameter
   * Returns: {type: 'relative', minutes: N} or {type: 'absolute', date: Date} or null
   */
  _parseAlarm(valarm) {
    if (!valarm) return null;

    try {
      // VALARM can be an object or array of objects
      const alarm = Array.isArray(valarm) ? valarm[0] : valarm;
      if (!alarm) return null;

      // Find TRIGGER - can be plain TRIGGER or parameterized like TRIGGER;VALUE=DATE-TIME
      let trigger = null;
      for (const key of Object.keys(alarm)) {
        if (key === 'TRIGGER' || key.startsWith('TRIGGER;')) {
          trigger = alarm[key];
          break;
        }
      }

      if (!trigger) return null;

      // Check if TRIGGER is an object with value (e.g., {VALUE: "DATE-TIME", value: "..."})
      if (typeof trigger === 'object' && trigger.value) {
        trigger = trigger.value.toString();
      } else {
        trigger = trigger.toString();
      }

      // Try to parse as duration format: -PT15M, -P1D, -PT1H30M, etc.
      const durationMatch = trigger.match(/^-?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
      if (durationMatch) {
        const days = parseInt(durationMatch[1], 10) || 0;
        const hours = parseInt(durationMatch[2], 10) || 0;
        const minutes = parseInt(durationMatch[3], 10) || 0;
        return { type: 'relative', minutes: days * 24 * 60 + hours * 60 + minutes };
      }

      // Try to parse as absolute date-time: 20231225T100000Z or 20231225T100000
      const dateMatch = trigger.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
      if (dateMatch) {
        const date = new Date(Date.UTC(
          parseInt(dateMatch[1], 10),
          parseInt(dateMatch[2], 10) - 1,
          parseInt(dateMatch[3], 10),
          parseInt(dateMatch[4], 10),
          parseInt(dateMatch[5], 10),
          parseInt(dateMatch[6], 10)
        ));
        return { type: 'absolute', date: date };
      }

      console.log("Unknown TRIGGER format:", trigger);
    } catch (e) {
      console.log("Failed to parse VALARM:", valarm, e);
    }
    return null;
  }

  /**
   * Get time until due date (e.g., "3.5h", "2d", "-1d" for overdue)
   * Returns null if no due date
   */
  getReminderCountdown() {
    if (!this.dueDate) return null;

    const diff = this.dueDate.getTime() - Date.now();
    const hours = diff / (1000 * 60 * 60);

    if (Math.abs(hours) < 24) {
      const h = hours.toFixed(1);
      return hours < 0 ? `${h}h` : `${h}h`;
    } else {
      const days = Math.round(hours / 24);
      return `${days}d`;
    }
  }

  getCurrentTimeString() {
    const now = new Date();
    return now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, "0") +
      now.getDate().toString().padStart(2, "0") +
      "T" + now.getHours().toString().padStart(2, "0") +
      now.getMinutes().toString().padStart(2, "0") +
      now.getSeconds().toString().padStart(2, "0") +
      "Z";  // UTC indicator
  }

  setCompleted(completed) {
    // For backwards compatibility, map to status
    return this.setStatus(completed ? "COMPLETED" : "NEEDS-ACTION");
  }

  /**
   * Set task status: NEEDS-ACTION, IN-PROCESS, or COMPLETED
   */
  setStatus(newStatus) {
    const vtodo = this.rawData?.VCALENDAR?.VTODO;
    if (!vtodo) {
      return Promise.reject(new Error("Task data not loaded"));
    }

    this.status = newStatus;
    this.completed = newStatus === "COMPLETED";
    this.inProgress = newStatus === "IN-PROCESS";
    vtodo.STATUS = newStatus;

    if(newStatus === "COMPLETED") {
      vtodo.COMPLETED = this.getCurrentTimeString();
      vtodo["PERCENT-COMPLETE"] = "100";
    } else {
      delete vtodo.COMPLETED;
      if(newStatus === "IN-PROCESS") {
        vtodo["PERCENT-COMPLETE"] = "50";
      } else {
        delete vtodo["PERCENT-COMPLETE"];
      }
    }

    return this._handler.messageBuilder.request({
      package: "caldav_proxy",
      action: "replace_task",
      id: this.id,
      rawData: this.rawData,
      etag: this.etag,
    }, {timeout: 5000}).then((resp) => {
      // Clear etag after update (will need fresh one on next sync)
      this.etag = "";
      return resp;
    });
  }

  /**
   * Cycle to next status: NEEDS-ACTION -> IN-PROCESS -> COMPLETED -> NEEDS-ACTION
   */
  cycleStatus() {
    const nextStatus = {
      "NEEDS-ACTION": "IN-PROCESS",
      "IN-PROCESS": "COMPLETED",
      "COMPLETED": "NEEDS-ACTION"
    };
    return this.setStatus(nextStatus[this.status] || "IN-PROCESS");
  }

  setTitle(title) {
    const vtodo = this.rawData?.VCALENDAR?.VTODO;
    if (!vtodo) {
      console.log("setTitle: rawData not loaded");
      return Promise.reject(new Error("Task data not loaded"));
    }

    console.log("setTitle: updating to", title);
    this.title = title;
    vtodo.SUMMARY = title;
    vtodo["LAST-MODIFIED"] = this.getCurrentTimeString();

    return this._handler.messageBuilder.request({
      package: "caldav_proxy",
      action: "replace_task",
      id: this.id,
      rawData: this.rawData,
      etag: this.etag,
    }, {timeout: 8000}).then((resp) => {
      console.log("setTitle: response", JSON.stringify(resp));
      this.etag = "";
      return resp;
    }).catch((e) => {
      console.log("setTitle: error", e);
      throw e;
    });
  }

  setDescription(description) {
    const vtodo = this.rawData?.VCALENDAR?.VTODO;
    if (!vtodo) {
      console.log("setDescription: rawData not loaded");
      return Promise.reject(new Error("Task data not loaded"));
    }

    console.log("setDescription: updating");
    this.description = description;
    if (description) {
      vtodo.DESCRIPTION = description;
    } else {
      delete vtodo.DESCRIPTION;
    }
    vtodo["LAST-MODIFIED"] = this.getCurrentTimeString();

    return this._handler.messageBuilder.request({
      package: "caldav_proxy",
      action: "replace_task",
      id: this.id,
      rawData: this.rawData,
      etag: this.etag,
    }, {timeout: 8000}).then((resp) => {
      console.log("setDescription: response", JSON.stringify(resp));
      this.etag = "";
      return resp;
    }).catch((e) => {
      console.log("setDescription: error", e);
      throw e;
    });
  }

  /**
   * Set task priority (0-9)
   * 0 = None, 1-4 = High, 5 = Medium, 6-9 = Low
   */
  setPriority(priority) {
    const vtodo = this.rawData?.VCALENDAR?.VTODO;
    if (!vtodo) {
      console.log("setPriority: rawData not loaded");
      return Promise.reject(new Error("Task data not loaded"));
    }

    // Validate priority range
    priority = parseInt(priority, 10) || 0;
    if (priority < 0) priority = 0;
    if (priority > 9) priority = 9;

    console.log("setPriority: updating to", priority);
    this.priority = priority;
    if (priority > 0) {
      vtodo.PRIORITY = priority.toString();
    } else {
      delete vtodo.PRIORITY;
    }
    vtodo["LAST-MODIFIED"] = this.getCurrentTimeString();

    return this._handler.messageBuilder.request({
      package: "caldav_proxy",
      action: "replace_task",
      id: this.id,
      rawData: this.rawData,
      etag: this.etag,
    }, {timeout: 8000}).then((resp) => {
      console.log("setPriority: response", JSON.stringify(resp));
      this.etag = "";
      return resp;
    }).catch((e) => {
      console.log("setPriority: error", e);
      throw e;
    });
  }

  /**
   * Set task start date
   * @param {Date|null} date - Start date or null to clear
   */
  setStartDate(date) {
    const vtodo = this.rawData?.VCALENDAR?.VTODO;
    if (!vtodo) {
      console.log("setStartDate: rawData not loaded");
      return Promise.reject(new Error("Task data not loaded"));
    }

    console.log("setStartDate: updating to", date);

    // Remove any existing DTSTART variants (with or without parameters)
    for (const key of Object.keys(vtodo)) {
      if (key === "DTSTART" || key.startsWith("DTSTART;")) {
        delete vtodo[key];
      }
    }

    if (date) {
      this.startDate = date;
      // Format as iCalendar datetime: YYYYMMDDTHHMMSS
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      const hh = String(date.getHours()).padStart(2, "0");
      const mm = String(date.getMinutes()).padStart(2, "0");
      const ss = String(date.getSeconds()).padStart(2, "0");
      vtodo.DTSTART = `${y}${m}${d}T${hh}${mm}${ss}`;
    } else {
      this.startDate = null;
    }

    vtodo["LAST-MODIFIED"] = this.getCurrentTimeString();

    return this._handler.messageBuilder.request({
      package: "caldav_proxy",
      action: "replace_task",
      id: this.id,
      rawData: this.rawData,
      etag: this.etag,
    }, {timeout: 8000}).then((resp) => {
      console.log("setStartDate: response", JSON.stringify(resp));
      this.etag = "";
      return resp;
    }).catch((e) => {
      console.log("setStartDate: error", e);
      throw e;
    });
  }

  /**
   * Set task due date
   * @param {Date|null} date - Due date or null to clear
   */
  setDueDate(date) {
    const vtodo = this.rawData?.VCALENDAR?.VTODO;
    if (!vtodo) {
      console.log("setDueDate: rawData not loaded");
      return Promise.reject(new Error("Task data not loaded"));
    }

    console.log("setDueDate: updating to", date);

    // Remove any existing DUE variants (with or without parameters)
    for (const key of Object.keys(vtodo)) {
      if (key === "DUE" || key.startsWith("DUE;")) {
        delete vtodo[key];
      }
    }

    if (date) {
      this.dueDate = date;
      // Format as iCalendar datetime: YYYYMMDDTHHMMSS
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      const hh = String(date.getHours()).padStart(2, "0");
      const mm = String(date.getMinutes()).padStart(2, "0");
      const ss = String(date.getSeconds()).padStart(2, "0");
      vtodo.DUE = `${y}${m}${d}T${hh}${mm}${ss}`;
    } else {
      this.dueDate = null;
    }

    vtodo["LAST-MODIFIED"] = this.getCurrentTimeString();

    return this._handler.messageBuilder.request({
      package: "caldav_proxy",
      action: "replace_task",
      id: this.id,
      rawData: this.rawData,
      etag: this.etag,
    }, {timeout: 8000}).then((resp) => {
      console.log("setDueDate: response", JSON.stringify(resp));
      this.etag = "";
      return resp;
    }).catch((e) => {
      console.log("setDueDate: error", e);
      throw e;
    });
  }

  /**
   * Set task due date AND alarm in one request (for "remind me in" feature)
   * @param {Date} date - Due date
   * @param {number} alarmMinutes - Minutes before due for alarm (0 = at due time)
   */
  setDueDateWithAlarm(date, alarmMinutes = 0) {
    const vtodo = this.rawData?.VCALENDAR?.VTODO;
    if (!vtodo) {
      console.log("setDueDateWithAlarm: rawData not loaded");
      return Promise.reject(new Error("Task data not loaded"));
    }

    console.log("setDueDateWithAlarm: due=", date, "alarm=", alarmMinutes, "min before");

    // Remove any existing DUE variants
    for (const key of Object.keys(vtodo)) {
      if (key === "DUE" || key.startsWith("DUE;")) {
        delete vtodo[key];
      }
    }

    // Remove any existing DTSTART variants (DUE must be after DTSTART, so clear it)
    for (const key of Object.keys(vtodo)) {
      if (key === "DTSTART" || key.startsWith("DTSTART;")) {
        delete vtodo[key];
      }
    }
    this.startDate = null;

    // Set DUE date
    this.dueDate = date;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    vtodo.DUE = `${y}${m}${d}T${hh}${mm}${ss}`;

    // Set VALARM (relative to DUE)
    this.alarm = { type: 'relative', minutes: alarmMinutes };
    let trigger = "-P";
    const days = Math.floor(alarmMinutes / (24 * 60));
    const remainingMinutes = alarmMinutes % (24 * 60);
    const hours = Math.floor(remainingMinutes / 60);
    const mins = remainingMinutes % 60;

    if (days > 0) {
      trigger += days + "D";
    }
    if (hours > 0 || mins > 0 || days === 0) {
      trigger += "T";
      if (hours > 0) trigger += hours + "H";
      if (mins > 0 || (hours === 0 && days === 0)) trigger += mins + "M";
    }

    // Use RELATED=END to make alarm relative to DUE date (not START)
    vtodo.VALARM = {
      ACTION: "DISPLAY",
      "TRIGGER;RELATED=END": trigger,
      DESCRIPTION: this.title || "Task reminder"
    };

    vtodo["LAST-MODIFIED"] = this.getCurrentTimeString();

    return this._handler.messageBuilder.request({
      package: "caldav_proxy",
      action: "replace_task",
      id: this.id,
      rawData: this.rawData,
      etag: this.etag,
    }, {timeout: 8000}).then((resp) => {
      console.log("setDueDateWithAlarm: response", JSON.stringify(resp));
      this.etag = "";
      return resp;
    }).catch((e) => {
      console.log("setDueDateWithAlarm: error", e);
      throw e;
    });
  }

  /**
   * Set task location (GEO coordinates and optional LOCATION text)
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {string} locationText - Optional location description
   */
  setLocation(lat, lon, locationText = "") {
    const vtodo = this.rawData?.VCALENDAR?.VTODO;
    if (!vtodo) {
      console.log("setLocation: rawData not loaded");
      return Promise.reject(new Error("Task data not loaded"));
    }

    console.log("setLocation: updating to", lat, lon, locationText);

    // Set GEO property (format: "lat;lon")
    if (lat !== null && lon !== null) {
      this.geo = { lat, lon };
      vtodo.GEO = `${lat};${lon}`;
    } else {
      this.geo = null;
      delete vtodo.GEO;
    }

    // Set LOCATION text property
    if (locationText) {
      this.location = locationText;
      vtodo.LOCATION = locationText;
    } else {
      this.location = "";
      delete vtodo.LOCATION;
    }

    vtodo["LAST-MODIFIED"] = this.getCurrentTimeString();

    return this._handler.messageBuilder.request({
      package: "caldav_proxy",
      action: "replace_task",
      id: this.id,
      rawData: this.rawData,
      etag: this.etag,
    }, {timeout: 8000}).then((resp) => {
      console.log("setLocation: response", JSON.stringify(resp));
      this.etag = "";
      return resp;
    }).catch((e) => {
      console.log("setLocation: error", e);
      throw e;
    });
  }

  /**
   * Set task categories (tags)
   * @param {string[]} categories - Array of category names
   */
  setCategories(categories) {
    const vtodo = this.rawData?.VCALENDAR?.VTODO;
    if (!vtodo) {
      console.log("setCategories: rawData not loaded");
      return Promise.reject(new Error("Task data not loaded"));
    }

    console.log("setCategories: updating to", categories);

    this.categories = categories || [];
    if (categories && categories.length > 0) {
      vtodo.CATEGORIES = categories.join(",");
    } else {
      delete vtodo.CATEGORIES;
    }

    vtodo["LAST-MODIFIED"] = this.getCurrentTimeString();

    return this._handler.messageBuilder.request({
      package: "caldav_proxy",
      action: "replace_task",
      id: this.id,
      rawData: this.rawData,
      etag: this.etag,
    }, {timeout: 8000}).then((resp) => {
      console.log("setCategories: response", JSON.stringify(resp));
      this.etag = "";
      return resp;
    }).catch((e) => {
      console.log("setCategories: error", e);
      throw e;
    });
  }

  /**
   * Set task alarm/reminder (relative to due/start date)
   * @param {number|null} minutes - Minutes before due date (null to clear)
   */
  setAlarm(minutes) {
    const vtodo = this.rawData?.VCALENDAR?.VTODO;
    if (!vtodo) {
      console.log("setAlarm: rawData not loaded");
      return Promise.reject(new Error("Task data not loaded"));
    }

    console.log("setAlarm: updating to", minutes, "minutes before");

    if (minutes !== null && minutes >= 0) {
      this.alarm = { type: 'relative', minutes: minutes };
      // Build VALARM component
      // Convert minutes to ISO 8601 duration format
      let trigger = "-P";
      const days = Math.floor(minutes / (24 * 60));
      const remainingMinutes = minutes % (24 * 60);
      const hours = Math.floor(remainingMinutes / 60);
      const mins = remainingMinutes % 60;

      if (days > 0) {
        trigger += days + "D";
      }
      if (hours > 0 || mins > 0 || days === 0) {
        trigger += "T";
        if (hours > 0) trigger += hours + "H";
        if (mins > 0 || (hours === 0 && days === 0)) trigger += mins + "M";
      }

      // Use RELATED=END to make alarm relative to DUE date (not START)
      vtodo.VALARM = {
        ACTION: "DISPLAY",
        "TRIGGER;RELATED=END": trigger,
        DESCRIPTION: this.title || "Task reminder"
      };
    } else {
      this.alarm = null;
      delete vtodo.VALARM;
    }

    vtodo["LAST-MODIFIED"] = this.getCurrentTimeString();

    return this._handler.messageBuilder.request({
      package: "caldav_proxy",
      action: "replace_task",
      id: this.id,
      rawData: this.rawData,
      etag: this.etag,
    }, {timeout: 8000}).then((resp) => {
      console.log("setAlarm: response", JSON.stringify(resp));
      this.etag = "";
      return resp;
    }).catch((e) => {
      console.log("setAlarm: error", e);
      throw e;
    });
  }

  /**
   * Set task alarm/reminder to absolute date/time
   * @param {Date|null} date - Absolute date/time for reminder (null to clear)
   */
  setAlarmAbsolute(date) {
    const vtodo = this.rawData?.VCALENDAR?.VTODO;
    if (!vtodo) {
      console.log("setAlarmAbsolute: rawData not loaded");
      return Promise.reject(new Error("Task data not loaded"));
    }

    console.log("setAlarmAbsolute: updating to", date);

    if (date !== null) {
      this.alarm = { type: 'absolute', date: date };
      // Build VALARM component with absolute trigger
      // Format: YYYYMMDDTHHMMSSZ (UTC)
      // Use parameterized property key for js2ics compatibility
      const pad = (n) => n.toString().padStart(2, '0');
      const trigger = date.getUTCFullYear().toString() +
        pad(date.getUTCMonth() + 1) +
        pad(date.getUTCDate()) + 'T' +
        pad(date.getUTCHours()) +
        pad(date.getUTCMinutes()) +
        pad(date.getUTCSeconds()) + 'Z';

      vtodo.VALARM = {
        ACTION: "DISPLAY",
        "TRIGGER;VALUE=DATE-TIME": trigger,
        DESCRIPTION: this.title || "Task reminder"
      };
    } else {
      this.alarm = null;
      delete vtodo.VALARM;
    }

    vtodo["LAST-MODIFIED"] = this.getCurrentTimeString();

    return this._handler.messageBuilder.request({
      package: "caldav_proxy",
      action: "replace_task",
      id: this.id,
      rawData: this.rawData,
      etag: this.etag,
    }, {timeout: 8000}).then((resp) => {
      console.log("setAlarmAbsolute: response", JSON.stringify(resp));
      this.etag = "";
      return resp;
    }).catch((e) => {
      console.log("setAlarmAbsolute: error", e);
      throw e;
    });
  }

  /**
   * Format alarm to human-readable string
   * Relative: 15 -> "15 min before", 60 -> "1 hour before"
   * Absolute: shows date/time or countdown
   */
  formatAlarm() {
    if (this.alarm === null) return null;

    // Handle new object format
    if (typeof this.alarm === 'object') {
      if (this.alarm.type === 'relative') {
        const minutes = this.alarm.minutes;
        if (minutes === 0) return "At time";
        if (minutes < 60) return minutes + " min before";
        if (minutes < 24 * 60) {
          const hours = minutes / 60;
          return hours === 1 ? "1 hour before" : hours + " hours before";
        }
        const days = minutes / (24 * 60);
        return days === 1 ? "1 day before" : days + " days before";
      } else if (this.alarm.type === 'absolute') {
        const date = this.alarm.date;
        const now = Date.now();
        const diff = date.getTime() - now;

        // If in the past, show "Passed"
        if (diff < 0) return "Passed";

        // If within 24 hours, show countdown
        const hours = diff / (1000 * 60 * 60);
        if (hours < 24) {
          if (hours < 1) {
            const mins = Math.round(diff / (1000 * 60));
            return "In " + mins + " min";
          }
          return "In " + hours.toFixed(1) + "h";
        }

        // Show date and time
        const pad = (n) => n.toString().padStart(2, '0');
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hour = date.getHours();
        const minute = date.getMinutes();
        return pad(month) + "/" + pad(day) + " " + pad(hour) + ":" + pad(minute);
      }
    }

    // Legacy: plain number format (for backward compatibility)
    if (typeof this.alarm === 'number') {
      if (this.alarm === 0) return "At time";
      if (this.alarm < 60) return this.alarm + " min before";
      if (this.alarm < 24 * 60) {
        const hours = this.alarm / 60;
        return hours === 1 ? "1 hour before" : hours + " hours before";
      }
      const days = this.alarm / (24 * 60);
      return days === 1 ? "1 day before" : days + " days before";
    }

    return null;
  }

  delete() {
    return this._handler.messageBuilder.request({
      package: "caldav_proxy",
      action: "delete_task",
      id: this.id,
    }, {timeout: 5000});
  }

  sync() {
    return this._handler.messageBuilder.request({
      package: "caldav_proxy",
      action: "read_task",
      id: this.id,
    }, {timeout: 5000}).then((data) => {
      this.rawData = data.rawData;
      this.etag = data.etag || "";
      const vtodo = data.rawData?.VCALENDAR?.VTODO;
      if(vtodo) {
        this.title = vtodo.SUMMARY || "";
        this.description = vtodo.DESCRIPTION || "";
        this.status = vtodo.STATUS || "NEEDS-ACTION";
        this.completed = this.status === "COMPLETED";
        this.inProgress = this.status === "IN-PROCESS";
        this.uid = vtodo.UID || null;
        this.parentId = vtodo["RELATED-TO"] || null;
        this.priority = parseInt(vtodo.PRIORITY, 10) || 0;
        this.startDate = this._parseDueDate(this._getPropertyValue(vtodo, "DTSTART"));
        this.dueDate = this._parseDueDate(this._getPropertyValue(vtodo, "DUE"));
        this.location = vtodo.LOCATION || "";
        this.geo = this._parseGeo(vtodo.GEO);
        const categoriesStr = vtodo.CATEGORIES || "";
        this.categories = categoriesStr ? categoriesStr.split(",").map(c => c.trim()) : [];
        this.alarm = this._parseAlarm(vtodo.VALARM);
      }
    })
  }

  /**
   * Get color for priority level (Nextcloud/tasks.org standard)
   * 0 = None (default white), 1-4 = High (red), 5 = Medium (yellow), 6-9 = Low (blue)
   */
  getPriorityColor() {
    if (this.priority >= 1 && this.priority <= 4) return 0xFF5555; // High - Red
    if (this.priority === 5) return 0xFFDD00; // Medium - Yellow
    if (this.priority >= 6 && this.priority <= 9) return 0x5599FF; // Low - Blue
    return 0xFFFFFF; // None - White
  }
}