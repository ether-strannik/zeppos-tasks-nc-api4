import hmUI, { setStatusBarVisible, updateStatusBarTitle } from "@zos/ui";
import { replace, push } from "@zos/router";
import { ConfiguredListScreen } from "../ConfiguredListScreen";
import { AppGesture } from "../../lib/mmk/AppGesture";

const { config, t, tasksProvider } = getApp()._options.globalData

class TaskListPickerScreen extends ConfiguredListScreen {
  constructor(params) {
    super();

    console.log("=== TASKLISTPICKERSCREEN CONSTRUCTOR ===");
    console.log("Raw params:", params);

    try {
      params = (params && params !== "undefined") ? JSON.parse(params) : {};
    } catch(e) {
      console.log("Error parsing params:", e);
      params = {};
    }

    console.log("Parsed params:", JSON.stringify(params));

    // Fallback: read from config if push() didn't pass params (API 3.0 issue)
    if (!params.lists || !params.mode) {
      console.log("No lists/mode in params, checking config fallback");
      const savedParams = config.get("_taskListPickerParams");
      if (savedParams) {
        console.log("Found saved params:", JSON.stringify(savedParams));
        params = savedParams;
        config.set("_taskListPickerParams", null); // Clear after use
      }
    }

    this.mode = params.mode;
    console.log("Mode:", this.mode);

    // CalDAV lists from params (passed from HomeScreen)
    this.caldavLists = params.lists || [];
    console.log("CalDAV lists count:", this.caldavLists.length);

    // Local lists from config (always read fresh)
    this.localLists = config.get("localLists", []);
    console.log("Local lists count:", this.localLists.length);
    console.log("Local lists:", JSON.stringify(this.localLists));
    console.log("=== TASKLISTPICKERSCREEN CONSTRUCTOR END ===");
  }

  build() {
    // CalDAV lists section (show first)
    if (this.caldavLists.length > 0) {
      this.headline(t("CalDAV lists:"));
      this.caldavLists.forEach(({ id, title }) => {
        this.row({
          text: title,
          icon: "icon_s/list.png",
          callback: () => this.selectList(id)
        });
      });
    }

    // Local lists section (show second)
    if (this.localLists.length > 0) {
      this.offset(16);
      this.headline(t("Local lists:"));
      this.localLists.forEach(({ id, title }) => {
        this.row({
          text: title,
          icon: "icon_s/list.png",
          callback: () => this.selectList(id)
        });
      });
    }

    // Create local list button
    this.offset(16);
    this.row({
      text: t("Create local list"),
      icon: "icon_s/add.png",
      callback: () => this.createLocalList()
    });

    // Settings button
    this.offset(16);
    this.row({
      text: t("Settings"),
      icon: "icon_s/link.png",
      callback: () => this.openSettings()
    });

    this.offset();
  }

  selectList(id) {
    config.set("cur_list_id", id);
    // Use replace with flag so HomeScreen knows this is a manual selection
    replace({
      url: "page/amazfit/HomeScreen",
      param: JSON.stringify({ fromListPicker: true })
    });
  }

  createLocalList() {
    console.log("=== CREATE LOCAL LIST BUTTON CLICKED ===");
    // Clear any corrupted cur_list_id before navigating
    config.set("cur_list_id", null);
    console.log("Cleared cur_list_id, now pushing to NewNoteScreen...");

    const paramObj = { mode: "create_local_list" };
    // Store params in config as workaround for API 3.0 push() not passing params
    config.set("_newNoteParams", paramObj);
    console.log("Saved params to config:", JSON.stringify(paramObj));

    push({
      url: "page/amazfit/NewNoteScreen",
      param: JSON.stringify(paramObj)
    });
    console.log("push() completed");
  }

  openSettings() {
    push({
      url: "page/amazfit/SettingsScreen",
      param: JSON.stringify({
        mode: this.mode
      })
    });
  }
}

Page({
  onInit(params) {
    try {
      setStatusBarVisible(true);
      updateStatusBarTitle("");

      // Pull-to-refresh: double swipe down to sync (if enabled)
      if (config.get("pullToRefresh", false)) {
        let lastSwipe = 0;
        AppGesture.init();
        AppGesture.on("down", () => {
          const now = Date.now();
          if (now - lastSwipe < 1000) {
            // Second swipe within 1 second - refresh all lists and tasks
            hmUI.showToast({ text: t("Syncing...") });
            replace({
              url: "page/amazfit/HomeScreen",
              param: JSON.stringify({ forceOnline: true, returnToListPicker: true })
            });
          } else {
            // First swipe - show hint
            hmUI.showToast({ text: t("Swipe again to sync") });
            lastSwipe = now;
          }
          return true;
        });
      }

      new TaskListPickerScreen(params).build();
    } catch(e) {
      console.log("TaskListPickerScreen error:", e);
      hmUI.showToast({ text: "Error: " + e.message });
    }
  }
})
