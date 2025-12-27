import {pjXML} from "../lib/pjxml";
import {generateUUID} from "./UUID";

// Default proxy URL - can be overridden in settings
const DEFAULT_PROXY_URL = "https://caldav-proxy-emn8.vercel.app";

const PAYLOAD_GET_CALENDARS = "<x0:propfind xmlns:x0=\"DAV:\"><x0:prop><x0:displayname /><x1:supported-calendar-component-set xmlns:x1=\"urn:ietf:params:xml:ns:caldav\" /></x0:prop></x0:propfind>\n";
// Get ALL tasks (no completion filter) - let client filter
const PAYLOAD_GET_ALL_TASKS = "<x1:calendar-query xmlns:x1=\"urn:ietf:params:xml:ns:caldav\"><x0:prop xmlns:x0=\"DAV:\"><x0:getetag/><x1:calendar-data/></x0:prop><x1:filter><x1:comp-filter name=\"VCALENDAR\"><x1:comp-filter name=\"VTODO\"/></x1:comp-filter></x1:filter></x1:calendar-query>\n";

// noinspection HttpUrlsUsage
export class CalDAVProxy {
  constructor() {
    this.onConfigAvailable();
    this.debugLog = [];
  }

  log(msg) {
    const timestamp = new Date().toISOString().substring(11, 19);
    const line = `[${timestamp}] ${msg}`;
    console.log(line);
    this.debugLog.push(line);
    // Keep only last 50 lines
    if (this.debugLog.length > 50) {
      this.debugLog.shift();
    }
    // Store in settingsStorage for Debug tab
    try {
      settings.settingsStorage.setItem("phone_debug_log", JSON.stringify({
        timestamp: new Date().toISOString(),
        content: this.debugLog.join('\n')
      }));
    } catch(e) {}
  }

  async handleRequest(ctx, request) {
    if(request.package !== "caldav_proxy") return;

    let response = {error: "unknown action"};
    switch(request.action) {
      case "insert_task":
        response = await this.insertTask(request.listId, request.title, request.parentUid);
        break;
      case "delete_task":
        response = await this.deleteTask(request.id);
        break;
      case "get_task_lists":
        response = await this.getTaskLists();
        break;
      case "read_task":
        response = await this.getTask(request.id);
        break;
      case "list_tasks":
        response = await this.listTasks(request.listId, request.completed);
        break;
      case "replace_task":
        response = await this.replaceTask(request.id, request.rawData, request.etag);
        break;
      // Calendar events
      case "get_event_calendars":
        response = await this.getEventCalendars();
        break;
      case "insert_event":
        response = await this.insertEvent(request.calendarId, request.event);
        break;
    }

    ctx.response({data: response});
  }

  async request(method, path, body=undefined, headers={}) {
    // Build proxy URL with path
    const proxyUrl = `${this.proxyUrl}${path}`;
    // Target host is the user's actual Nextcloud server
    const targetHost = this.config.host;

    console.log(`CalDAV ${method} ${proxyUrl} -> ${targetHost}`);

    try {
      const resp = await fetch({
        method: method === "GET" ? method : "POST",
        url: proxyUrl,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Authorization": this.authHeader,
          "X-HTTP-Method-Override": method,
          "X-Target-Host": targetHost,
          "Cookie": "",
          ...headers,
        },
        body,
      });
      console.log(`CalDAV response: ${resp.status}`);
      return resp;
    } catch(e) {
      console.log(`CalDAV request error: ${e}`);
      throw e;
    }
  }

  async getTask(id) {
    if(!this.config || !this.config.host)
      return {error: "Config not loaded"};
    if(!this.authHeader)
      return {error: "Auth not configured"};

    try {
      const resp = await this.request("GET", id);
      if(resp.status >= 300) {
        console.log("CalDAV getTask failed:", resp.status);
        return {error: `Server error ${resp.status}`};
      }
      return {id, rawData: this.ics2js(resp.body)};
    } catch(e) {
      console.log("CalDAV getTask error:", e);
      return {error: `Failed to get task: ${e.message || e}`};
    }
  }

  async deleteTask(id) {
    if(!this.config || !this.config.host)
      return {error: "Config not loaded"};
    if(!this.authHeader)
      return {error: "Auth not configured"};

    try {
      const resp = await this.request("DELETE", id);
      if(resp.status >= 300 && resp.status !== 404) {
        console.log("CalDAV deleteTask failed:", resp.status);
        return {error: `Server error ${resp.status}`};
      }
      return {result: true};
    } catch(e) {
      console.log("CalDAV deleteTask error:", e);
      return {error: `Failed to delete task: ${e.message || e}`};
    }
  }

  async insertTask(listId, title, parentUid = null) {
    if(!this.config || !this.config.host)
      return {error: "Config not loaded"};
    if(!this.authHeader)
      return {error: "Auth not configured"};

    try {
      const taskFile = `${Math.round(Math.random() * 10e15)}-${Date.now()}.ics`;
      const now = this.currentTimeString();
      const vtodo = {
        "UID": generateUUID(),
        "CREATED": now,
        "LAST-MODIFIED": now,
        "DTSTAMP": now,
        "SUMMARY": title,
      };

      // Add RELATED-TO for subtasks
      if (parentUid) {
        vtodo["RELATED-TO"] = parentUid;
      }

      const taskBody = this.js2ics({
        "VCALENDAR": {
          "VERSION": "2.0",
          "PRODID": "-//Tasks for ZeppOS v2.1+",
          "VTODO": vtodo
        }
      });

      const resp = await this.request("PUT",
        listId + "/" + taskFile,
        taskBody, {
          "Depth": "0",
          "Content-Type": "text/calendar; charset=UTF-8",
        });

      if(resp.status !== 201) {
        console.log("CalDAV insertTask failed:", resp.status);
        return {error: `Failed to create task (${resp.status})`};
      }
      return {result: true};
    } catch(e) {
      console.log("CalDAV insertTask error:", e);
      return {error: `Failed to create task: ${e.message || e}`};
    }
  }

  async listTasks(listID, completed) {
    if(!this.config || !this.config.host)
      return {error: "Config not loaded"};
    if(!this.authHeader)
      return {error: "Auth not configured"};

    try {
      // Fetch ALL tasks, filter by completion status client-side
      const resp = await this.request("REPORT",
        listID,
        PAYLOAD_GET_ALL_TASKS,
        {
          "Depth": "1",
        });

      if(resp.status >= 300) {
        console.log("CalDAV listTasks failed:", resp.status);
        return {error: `Server error ${resp.status}`};
      }

      const basePath = this.config.host.substring(this.config.host.indexOf("/", "https://".length));

      const xml = pjXML.parse(resp.body);
      const output = [];
      for(const node of xml.selectAll("//d:response")) {
        const hrefNodes = node.selectAll("//d:href");
        if(hrefNodes.length < 1) continue;
        const id = hrefNodes[0].content[0].substring(basePath.length);

        let rawData = node.selectAll("//cal:calendar-data");
        if(rawData.length < 1) continue;
        rawData = rawData[0].content[0];

        // Get ETag for update operations
        let etag = "";
        const etagNodes = node.selectAll("//d:getetag");
        if(etagNodes.length > 0 && etagNodes[0].content.length > 0) {
          etag = etagNodes[0].content[0];
        }

        const parsedData = this.ics2js(rawData);
        output.push({id, rawData: parsedData, etag});
      }

      // Filter by completion status client-side
      // completed = "all" means return everything, false means only incomplete
      if (completed === "all") {
        console.log("CalDAV listTasks: returning all", output.length, "tasks");
        return output;
      }

      const filtered = output.filter(task => {
        const status = task.rawData?.VCALENDAR?.VTODO?.STATUS;
        const isCompleted = status === "COMPLETED";
        return !isCompleted;  // Only incomplete tasks
      });

      console.log("CalDAV listTasks: found", output.length, "total,", filtered.length, "incomplete");
      return filtered;
    } catch(e) {
      console.log("CalDAV listTasks error:", e);
      return {error: `Failed to list tasks: ${e.message || e}`};
    }
  }

  async replaceTask(id, rawData, etag) {
    if(!this.config || !this.config.host)
      return {error: "Config not loaded"};
    if(!this.authHeader)
      return {error: "Auth not configured"};

    try {
      const headers = {
        "Depth": "0",
        "Content-Type": "text/calendar; charset=UTF-8",
      };

      // Add If-Match header with ETag to prevent 412 errors
      if(etag) {
        headers["If-Match"] = etag;
      }

      const body = this.js2ics(rawData);
      this.log("=== replaceTask ===");
      this.log("ID: " + id);
      this.log("Body:\n" + body);
      const resp = await this.request("PUT", id, body, headers);

      if(resp.status === 412) {
        return {error: "Task was modified elsewhere. Please refresh and try again."};
      }

      if(resp.status >= 300) {
        this.log("FAILED " + resp.status);
        this.log("Response: " + (resp.body || "empty"));
        return {error: `Failed (${resp.status}): ${resp.body?.substring(0, 100) || 'no details'}`};
      }

      this.log("SUCCESS " + resp.status);

      return {result: true};
    } catch(e) {
      console.log("CalDAV replaceTask error:", e);
      return {error: `Failed to update task: ${e.message || e}`};
    }
  }

  async getTaskLists() {
    if(!this.config || !this.config.host) {
      console.log("CalDAV getTaskLists: config not loaded", this.config);
      return {error: "Config not loaded. Please log in again."};
    }
    if(!this.authHeader) {
      console.log("CalDAV getTaskLists: no auth header");
      return {error: "Auth not configured. Please log in again."};
    }

    try {
      const resp = await this.request("PROPFIND",
        `/calendars/${this.config.user}/`,
        PAYLOAD_GET_CALENDARS,
        {
          "Depth": "1",
        });

      if(resp.status >= 300) {
        console.log("CalDAV getTaskLists failed:", resp.status, resp.body);
        return {error: `Server error ${resp.status}. Check credentials.`};
      }
      if(typeof resp.body !== "string") {
        console.log("CalDAV getTaskLists: invalid body type", typeof resp.body);
        return {error: "Invalid server response"};
      }

      const basePath = this.config.host.substring(this.config.host.indexOf("/", "https://".length));

      const xml = pjXML.parse(resp.body);
      const output = [];
      for(const node of xml.selectAll("//d:response")) {
        const type = node.select("//cal:comp");
        if(!type.attributes || type.attributes.name !== "VTODO") continue;

        const id = node.select("//d:href").content[0].substring(basePath.length);
        const title = node.select("//d:displayname").content[0];
        output.push({id, title});
      }

      console.log("CalDAV getTaskLists: found", output.length, "lists");
      output.forEach(l => console.log("  List:", l.id, "->", l.title));
      return output;
    } catch(e) {
      console.log("CalDAV getTaskLists error:", e);
      return {error: `Connection failed: ${e.message || e}`};
    }
  }

  async getEventCalendars() {
    if(!this.config || !this.config.host) {
      return {error: "Config not loaded. Please log in again."};
    }
    if(!this.authHeader) {
      return {error: "Auth not configured. Please log in again."};
    }

    try {
      const resp = await this.request("PROPFIND",
        `/calendars/${this.config.user}/`,
        PAYLOAD_GET_CALENDARS,
        {
          "Depth": "1",
        });

      if(resp.status >= 300) {
        console.log("CalDAV getEventCalendars failed:", resp.status, resp.body);
        return {error: `Server error ${resp.status}. Check credentials.`};
      }
      if(typeof resp.body !== "string") {
        return {error: "Invalid server response"};
      }

      const basePath = this.config.host.substring(this.config.host.indexOf("/", "https://".length));

      const xml = pjXML.parse(resp.body);
      const output = [];
      for(const node of xml.selectAll("//d:response")) {
        const type = node.select("//cal:comp");
        // Filter for VEVENT calendars (not VTODO)
        if(!type.attributes || type.attributes.name !== "VEVENT") continue;

        const id = node.select("//d:href").content[0].substring(basePath.length);
        const title = node.select("//d:displayname").content[0];
        output.push({id, title});
      }

      console.log("CalDAV getEventCalendars: found", output.length, "calendars");
      return output;
    } catch(e) {
      console.log("CalDAV getEventCalendars error:", e);
      return {error: `Connection failed: ${e.message || e}`};
    }
  }

  async insertEvent(calendarId, event) {
    if(!this.config || !this.config.host)
      return {error: "Config not loaded"};
    if(!this.authHeader)
      return {error: "Auth not configured"};

    try {
      const eventFile = `${Math.round(Math.random() * 10e15)}-${Date.now()}.ics`;
      const now = this.currentTimeString();

      const vevent = {
        "UID": generateUUID(),
        "CREATED": now,
        "LAST-MODIFIED": now,
        "DTSTAMP": now,
        "SUMMARY": event.title || "Untitled Event",
      };

      // Add start time (required)
      if (event.dtstart) {
        vevent["DTSTART"] = event.dtstart;
      }

      // Add end time
      if (event.dtend) {
        vevent["DTEND"] = event.dtend;
      }

      // Add optional fields
      if (event.location) {
        vevent["LOCATION"] = event.location;
      }
      if (event.description) {
        vevent["DESCRIPTION"] = event.description;
      }

      const eventBody = this.js2ics({
        "VCALENDAR": {
          "VERSION": "2.0",
          "PRODID": "-//Tasks NC for ZeppOS//",
          "VEVENT": vevent
        }
      });

      this.log("=== insertEvent ===");
      this.log("Calendar: " + calendarId);
      this.log("Body:\n" + eventBody);

      const resp = await this.request("PUT",
        calendarId + "/" + eventFile,
        eventBody, {
          "Depth": "0",
          "Content-Type": "text/calendar; charset=UTF-8",
        });

      if(resp.status !== 201) {
        this.log("FAILED " + resp.status);
        return {error: `Failed to create event (${resp.status})`};
      }

      this.log("SUCCESS " + resp.status);
      return {result: true};
    } catch(e) {
      console.log("CalDAV insertEvent error:", e);
      return {error: `Failed to create event: ${e.message || e}`};
    }
  }

  currentTimeString() {
    const date = new Date();
    return date.getFullYear().toString() +
      (date.getMonth() + 1).toString().padStart(2, "0") +
      (date.getDate()).toString().padStart(2, "0") + "T" +
      (date.getHours()).toString().padStart(2, "0") +
      (date.getMinutes()).toString().padStart(2, "0") +
      (date.getSeconds()).toString().padStart(2, "0");
  }

  ics2js(ics) {
    const useWin32split = ics.indexOf("\r\n") > -1;
    const lines = ics.split(useWin32split ? "\r\n" : "\n");

    let stack = [{}];
    for(const line of lines) {
      const key = line.substring(0, line.indexOf(":"));
      const value = line.substring(key.length + 1);
      if(key === "BEGIN") {
        const o = {};
        stack[stack.length - 1][value] = o
        stack.push(o);
      } else if(key === "END") {
        stack.pop();
      } else if(key !== "") {
        stack[stack.length - 1][key] = eval(`"${value}"`);
      }
    }

    return stack[0];
  }

  js2ics(obj) {
    let out = "";
    for(const key in obj) {
      if(key === "") continue;
      const val = obj[key];
      // Handle string and number values as properties
      if(typeof val === "string" || typeof val === "number") {
        out += key + ":" + this.icsEscape(String(val)) + "\r\n";
      } else if(typeof val === "object" && val !== null) {
        out += "BEGIN:" + key + "\r\n";
        out += this.js2ics(val);
        out += "END:" + key + "\r\n";
      }
      // Skip null, undefined, and other types
    }

    return out;
  }

  icsEscape(v) {
    // Escape special characters in iCalendar TEXT values
    // Note: Commas are NOT escaped - they are valid list delimiters (e.g., CATEGORIES)
    // Backslash must be escaped first (before other escapes add more backslashes)
    v = v.replaceAll("\\", "\\\\");
    // Escape newlines as literal \n (required by iCalendar spec)
    v = v.replaceAll("\r\n", "\\n");
    v = v.replaceAll("\n", "\\n");
    v = v.replaceAll("\r", "\\n");
    return v;
  }

  onConfigAvailable() {
    try {
      this.config = JSON.parse(settings.settingsStorage.getItem("access_token"));
      if(this.config.host.endsWith("/"))
        this.config.host = this.config.host.substring(0, this.config.host.length -1);
      this.authHeader = "Basic " + btoa(`${this.config.user}:${this.config.password}`);
      // Load proxy URL from config or use default
      this.proxyUrl = this.config.proxyUrl || DEFAULT_PROXY_URL;
      if(this.proxyUrl.endsWith("/"))
        this.proxyUrl = this.proxyUrl.substring(0, this.proxyUrl.length -1);
      console.log("Load CalDAV config", this.config.host, this.config.user, "proxy:", this.proxyUrl);
    } catch(e) {
      this.config = {};
      this.proxyUrl = DEFAULT_PROXY_URL;
    }
  }

  async validateNextcloudURL(url) {
    if(!url.startsWith("http://") && !url.startsWith("https://"))
      url = "https://" + url;
    if(!url.endsWith("/"))
      url += "/";
    if(!url.endsWith("remote.php/dav/"))
      url += "remote.php/dav/";

    console.log("Trying", url, "via proxy", this.proxyUrl);
    // Validate via proxy with X-Target-Host
    const resp = await fetch({
      method: "GET",
      url: (this.proxyUrl || DEFAULT_PROXY_URL) + "/remote.php/dav/",
      headers: {
        "X-Target-Host": url.replace(/\/remote\.php\/dav\/$/, ""),
      }
    });
    if(resp.status !== 401 && resp.status !== 400) {
      console.log("Reject this url", resp.status);
      settings.settingsStorage.setItem("nextcloud_url_valid", "false");
      return;
    }

    console.log("URL check passed");
    settings.settingsStorage.setItem("nextcloud_url_validate", JSON.stringify(url));
    settings.settingsStorage.setItem("nextcloud_url_valid", "true");
  }

  async validateConfig(config) {
    console.log("Validating CalDAV config:", config);
    try {
      const authHeader = "Basic " + btoa(`${config.user}:${config.password}`);
      // Use proxy with X-Target-Host header
      const proxyUrlBase = config.proxyUrl || this.proxyUrl || DEFAULT_PROXY_URL;
      const proxyUrl = proxyUrlBase + "/calendars/" + config.user + "/";
      const resp = await fetch({
        method: "POST",
        url: proxyUrl,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Authorization": authHeader,
          "X-HTTP-Method-Override": "PROPFIND",
          "X-Target-Host": config.host,
          "Depth": "0",
        }
      });

      console.log("CalDAV validate response:", resp.status);
      settings.settingsStorage.setItem("caldav_validate_result", JSON.stringify(resp.status < 300));
    } catch(e) {
      console.log("CalDAV validate error:", e);
      settings.settingsStorage.setItem("caldav_validate_result", JSON.stringify(false));
    }
  }
}