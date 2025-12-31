import hmUI from "@zos/ui";
import * as fs from "@zos/fs";
import * as ble from "@zos/ble";
import {
  ICON_SIZE_MEDIUM,
  IS_LOW_RAM_DEVICE,
  SCREEN_WIDTH,
  SCREEN_HEIGHT
} from "../lib/mmk/UiParams";

const { messageBuilder, t } = getApp()._options.globalData;

// File-based logger for debugging
const LOG_FILE = "debug.log";
let logBuffer = [];

export function log(...args) {
  const msg = args.map(a => {
    if (typeof a === 'object') {
      try { return JSON.stringify(a); } catch(e) { return String(a); }
    }
    return String(a);
  }).join(' ');

  const timestamp = new Date().toISOString().substr(11, 8);
  const line = `[${timestamp}] ${msg}\n`;

  // Buffer logs
  logBuffer.push(line);

  // Write to file periodically (every 5 logs or on flush)
  if (logBuffer.length >= 5) {
    flushLog();
  }
}

export function flushLog() {
  if (logBuffer.length === 0) return;

  try {
    const content = logBuffer.join('');
    logBuffer = [];

    const file = fs.openSync({ path: LOG_FILE, flag: fs.O_WRONLY | fs.O_APPEND | fs.O_CREAT });
    if (file !== undefined && file >= 0) {
      const buffer = new ArrayBuffer(content.length);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < content.length; i++) {
        view[i] = content.charCodeAt(i);
      }
      fs.writeSync({ fd: file, buffer, options: { offset: 0, length: buffer.byteLength } });
      fs.closeSync({ fd: file });
    }
  } catch(e) {
    // Log write failed
  }
}

export function readLog() {
  try {
    const stat = fs.statSync({ path: LOG_FILE });
    if (!stat) return "(no log file)";

    const file = fs.openSync({ path: LOG_FILE, flag: fs.O_RDONLY });
    if (file === undefined || file < 0) return "(cannot open log)";

    const buffer = new ArrayBuffer(Math.min(stat.size, 4096));
    fs.readSync({ fd: file, buffer, options: { offset: 0, length: buffer.byteLength } });
    fs.closeSync({ fd: file });

    const view = new Uint8Array(buffer);
    let str = "";
    for (let i = 0; i < view.length && view[i] !== 0; i++) {
      str += String.fromCharCode(view[i]);
    }
    return str || "(empty log)";
  } catch(e) {
    return "Read error: " + e;
  }
}

export function clearLog() {
  try {
    hmFS.remove(LOG_FILE);
  } catch(e) {}
}

export function clearAllLogs() {
  // Clear watch log
  clearLog();

  // Clear phone log
  return messageBuilder.request({
    package: "debug_log",
    action: "clear_log"
  }, { timeout: 3000 }).catch(() => {});
}

export function syncLogToPhone() {
  const logContent = readLog();
  if (!logContent || logContent.startsWith("(")) {
    return Promise.resolve({ error: "No log to sync" });
  }

  return messageBuilder.request({
    package: "debug_log",
    action: "save_log",
    content: logContent,
    timestamp: Date.now()
  }, { timeout: 5000 });
}

export function request(data, timeout = 10000) {
  if(!ble.connectStatus()) return Promise.reject("No connection to phone");
  return messageBuilder.request(data, {timeout}).then((data) => {
    if(data.error) 
      throw new Error(data.error);
    return Promise.resolve(data);
  });
}

export function createSpinnerLowRam() {
  const spinner = hmUI.createWidget(hmUI.widget.IMG, {
    x: Math.floor((SCREEN_WIDTH - ICON_SIZE_MEDIUM) / 2),
    y: Math.floor((SCREEN_HEIGHT - ICON_SIZE_MEDIUM) / 2),
    src: "spinner.png"
  });
  return () => hmUI.deleteWidget(spinner);
}

export function createSpinner() {
  if(IS_LOW_RAM_DEVICE) return createSpinnerLowRam();

  const spinner = hmUI.createWidget(hmUI.widget.IMG_ANIM, {
    x: Math.floor((SCREEN_WIDTH - ICON_SIZE_MEDIUM) / 2),
    y: Math.floor((SCREEN_HEIGHT - ICON_SIZE_MEDIUM) / 2),
    anim_path: "spinner",
    anim_prefix: "img",
    anim_ext: "png",
    anim_fps: 12,
    anim_size: 12,
    anim_status: hmUI.anim_status.START,
    repeat_count: 0,
  });

  return () => hmUI.deleteWidget(spinner);
}

export function getOfflineInfo(err) {
  if(err.startsWith("Timed out"))
    return t("Work offline, connection timed out");

  switch(err) {
    case "login_first":
      return t("Log into your Nextcloud account via Zepp app to use all features");
    default:
      return err;
  }
}
