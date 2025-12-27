// Test page - minimal version of our HomeScreen pattern
import hmUI from "@zos/ui";
import {getDeviceInfo} from "@zos/device";
import {log} from "@zos/utils";
import * as alarmMgr from "@zos/alarm";
import {Time} from "@zos/sensor";
const logger = log.getLogger("test");
const {width: DEVICE_WIDTH, height: DEVICE_HEIGHT} = getDeviceInfo();

const globalData = getApp()._options.globalData;
const messageBuilder = globalData.messageBuilder;
const config = globalData.config;

Page({
  build() {
    logger.log("Test page build()");

    // Title
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0,
      y: 80,
      w: DEVICE_WIDTH,
      h: 50,
      text: "Tasks Test",
      text_size: 36,
      color: 0x00FF00,
      align_h: hmUI.align.CENTER_H
    });

    // Test ConfigStorage
    let storageTest = "not tested";
    try {
      config.load();
      config.set("test_key", "hello");
      const val = config.get("test_key");
      storageTest = val === "hello" ? "OK" : "FAIL";
    } catch(e) {
      storageTest = "Error: " + e.message;
    }

    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 20,
      y: 160,
      w: DEVICE_WIDTH - 40,
      h: 50,
      text: "Storage: " + storageTest,
      text_size: 24,
      color: 0xFFFFFF,
      align_h: hmUI.align.CENTER_H
    });

    // Device info
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 20,
      y: 220,
      w: DEVICE_WIDTH - 40,
      h: 50,
      text: "Width: " + DEVICE_WIDTH,
      text_size: 24,
      color: 0xAAAAAA,
      align_h: hmUI.align.CENTER_H
    });

    // Status text for alarm
    const statusText = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 20,
      y: 350,
      w: DEVICE_WIDTH - 40,
      h: 50,
      text: "",
      text_size: 20,
      color: 0xFFFF00,
      align_h: hmUI.align.CENTER_H
    });

    // Button to set alarm 30 seconds from now
    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 40,
      y: 280,
      w: DEVICE_WIDTH - 80,
      h: 60,
      text: "Set Alarm (30s)",
      text_size: 24,
      radius: 12,
      normal_color: 0x333333,
      press_color: 0x555555,
      click_func: () => {
        try {
          const timeSensor = new Time();
          const now = Math.floor(timeSensor.getTime() / 1000);
          const alarmTime = now + 30; // 30 seconds from now

          const alarmId = alarmMgr.set({
            appid: 1056908,
            url: "app-service/index",
            time: alarmTime,
            param: "test_alarm",
          });

          statusText.setProperty(hmUI.prop.TEXT, "Alarm set! ID: " + alarmId);
          logger.log("Alarm set for " + alarmTime + ", ID: " + alarmId);
        } catch(e) {
          statusText.setProperty(hmUI.prop.TEXT, "Error: " + e.message);
          logger.log("Alarm error: " + e);
        }
      }
    });

    // MessageBuilder test button
    const bleStatusText = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 20,
      y: 420,
      w: DEVICE_WIDTH - 40,
      h: 50,
      text: "BLE: not tested",
      text_size: 18,
      color: 0xCCCCCC,
      align_h: hmUI.align.CENTER_H
    });

    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 40,
      y: 480,
      w: DEVICE_WIDTH - 80,
      h: 60,
      text: "Test BLE Connect",
      text_size: 22,
      radius: 12,
      normal_color: 0x222266,
      press_color: 0x333388,
      click_func: () => {
        bleStatusText.setProperty(hmUI.prop.TEXT, "BLE: connecting...");
        try {
          messageBuilder.connect(() => {
            bleStatusText.setProperty(hmUI.prop.TEXT, "BLE: connected!");
            logger.log("MessageBuilder connected!");
          });
        } catch(e) {
          bleStatusText.setProperty(hmUI.prop.TEXT, "BLE Error: " + e.message);
          logger.log("BLE error: " + e);
        }
      }
    });

    logger.log("Test page built successfully");
  }
});
