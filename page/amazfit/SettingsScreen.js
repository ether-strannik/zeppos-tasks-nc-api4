import hmUI, { setStatusBarVisible, updateStatusBarTitle } from "@zos/ui";
import { push, back } from "@zos/router";
import { ConfiguredListScreen } from "../ConfiguredListScreen";
import { readLog, clearLog, clearAllLogs, syncLogToPhone } from "../Utils";

const { config, t, tasksProvider } = getApp()._options.globalData

class SettingsScreen extends ConfiguredListScreen {
  constructor(params) {
    super();

    try {
      params = params ? JSON.parse(params) : {};
    } catch(e) {
      params = {};
    }
    this.mode = params.mode;

    this.wipeConfirm = 3;

    // Load cached lists for "On Launch Open" picker
    this.cachedLists = config.get("cachedLists", []);
  }

  build() {
    // User interface
    this.headline(t("User interface:"));
    this.row({
      text: t("Font size…"),
      icon: "icon_s/font_size.png",
      callback: () => push({
        url: `page/amazfit/FontSizeSetupScreen`
      })
    });
    this.row({
      text: t("Keyboard…"),
      icon: "icon_s/keyboard.png",
      callback: () => push({
        url: `page/amazfit/ScreenBoardSetup`
      })
    });

    // Additional features
    this.offset(16);
    this.headline(t("Additional features:"));
    if(this.mode !== "cached" && tasksProvider && !tasksProvider.cantListCompleted) {
      this.row({
        text: t("Show complete tasks"),
        icon: `icon_s/cb_${config.get("withComplete", false)}.png`,
        callback: () => {
          config.set("withComplete", !config.get("withComplete", false));
          back();
        }
      });
    }
    this.row({
      text: t("Sort alphabetically"),
      icon: `icon_s/cb_${config.get("sortMode", "none") === "alpha"}.png`,
      callback: () => {
        const current = config.get("sortMode", "none");
        config.set("sortMode", current === "alpha" ? "none" : "alpha");
        back();
      }
    });
    this.row({
      text: t("Show reminder countdown"),
      icon: `icon_s/cb_${config.get("showCountdown", false)}.png`,
      callback: () => {
        config.set("showCountdown", !config.get("showCountdown", false));
        back();
      }
    });
    this.row({
      text: t("Show categories"),
      icon: `icon_s/cb_${config.get("showCategories", false)}.png`,
      callback: () => {
        config.set("showCategories", !config.get("showCategories", false));
        back();
      }
    });

    // Synchronization settings
    this.offset(16);
    this.headline(t("Synchronization:"));
    this.row({
      text: t("Work offline"),
      icon: `icon_s/cb_${config.get("offlineMode", false)}.png`,
      callback: () => {
        config.set("offlineMode", !config.get("offlineMode", false));
        back();
      }
    });
    this.row({
      text: t("Pull down to refresh"),
      icon: `icon_s/cb_${config.get("pullToRefresh", false)}.png`,
      callback: () => {
        config.set("pullToRefresh", !config.get("pullToRefresh", false));
        back();
      }
    });

    // On Launch Open setting
    this.offset(16);
    this.headline(t("On launch open:"));
    this.launchListRow = this.row({
      text: this.getLaunchListText(),
      icon: "icon_s/list.png",
      callback: () => this.cycleLaunchList()
    });

    // Advanced settings
    this.offset(16);
    this.headline(t("Advanced:"));
    if(config.get("forever_offline", false)) {
      this.row({
        text: t("Remove completed tasks"),
        icon: "icon_s/cleanup.png",
        callback: () => this.offlineRemoveComplete()
      });
    }
    this.row({
      text: t("Wipe ALL local data"),
      icon: "icon_s/wipe_all.png",
      callback: () => this.wipeEverything()
    });
    this.text({
      text: t("Option above didn't delete any data from your Nextcloud account"),
      fontSize: this.fontSize - 2,
      color: 0x999999
    });

    // About
    this.offset(16);
    this.buildHelpItems();

    // Debug section
    this.offset(16);
    this.headline(t("Debug:"));
    this.row({
      text: t("View debug log"),
      icon: "icon_s/edit.png",
      callback: () => this.showDebugLog()
    });
    this.row({
      text: t("Sync log to phone"),
      icon: "icon_s/link.png",
      callback: () => this.syncLog()
    });
    this.row({
      text: t("Clear debug log"),
      icon: "icon_s/delete.png",
      callback: () => {
        clearLog();
        clearAllLogs().then(() => {
          hmUI.showToast({ text: t("All logs cleared") });
        }).catch(() => {
          hmUI.showToast({ text: t("Watch log cleared") });
        });
      }
    });

    this.offset();
  }

  wipeEverything() {
    if(this.wipeConfirm > 0) {
      this.wipeConfirm--;
      return hmUI.showToast({text: t("Tap again to confirm")});
    }

    config.wipe();
    back();
  }

  offlineRemoveComplete() {
    const storage = config.get("tasks", []);
    const output = []
    for(const task of storage) {
      if(!task.completed)
        output.push(task);
    }
    config.set("tasks", output);
    back();
  }

  showDebugLog() {
    const logContent = readLog();
    // Navigate to About screen with log content as param
    push({
      url: `page/amazfit/AboutScreen`,
      param: JSON.stringify({ debugLog: logContent })
    });
  }

  syncLog() {
    hmUI.showToast({ text: t("Syncing...") });
    syncLogToPhone().then((resp) => {
      if (resp && resp.error) {
        hmUI.showToast({ text: resp.error });
      } else {
        hmUI.showToast({ text: t("Log synced to phone") });
      }
    }).catch((e) => {
      hmUI.showToast({ text: t("Sync failed") });
    });
  }

  buildHelpItems() {
    this.row({
      text: t("About…"),
      icon: "icon_s/about.png",
      callback: () => push({
        url: `page/amazfit/AboutScreen`,
        param: JSON.stringify({})
      })
    });
  }

  /**
   * Get display text for current launch list setting
   */
  getLaunchListText() {
    const mode = config.get("launchListMode", "last");
    if (mode === "last") {
      return t("Last viewed list");
    }
    const listId = config.get("launchListId", "");
    const list = this.cachedLists.find(l => l.id === listId);
    return list ? list.title : t("Last viewed list");
  }

  /**
   * Cycle through launch list options: Last viewed → List1 → List2 → ...
   */
  cycleLaunchList() {
    const currentMode = config.get("launchListMode", "last");
    const currentListId = config.get("launchListId", "");

    if (currentMode === "last") {
      // Switch to first specific list
      if (this.cachedLists.length > 0) {
        config.set("launchListMode", "specific");
        config.set("launchListId", this.cachedLists[0].id);
      }
    } else {
      // Find current list index and cycle to next
      const currentIndex = this.cachedLists.findIndex(l => l.id === currentListId);
      const nextIndex = currentIndex + 1;

      if (nextIndex >= this.cachedLists.length) {
        // Wrap back to "Last viewed"
        config.set("launchListMode", "last");
        config.set("launchListId", "");
      } else {
        config.set("launchListId", this.cachedLists[nextIndex].id);
      }
    }

    // Update UI
    if (this.launchListRow) {
      this.launchListRow.textView.setProperty(hmUI.prop.TEXT, this.getLaunchListText());
    }
  }
}

// noinspection JSCheckFunctionSignatures
Page({
  onInit(params) {
    setStatusBarVisible(true);
    updateStatusBarTitle("");

    new SettingsScreen(params).build();
  }
})
