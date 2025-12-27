import hmUI, { setStatusBarVisible, updateStatusBarTitle } from "@zos/ui";
import { reloadPage, push } from "@zos/router";
import { ConfiguredListScreen } from "../ConfiguredListScreen";
import { AppGesture } from "../../lib/mmk/AppGesture";

const { config, t, tasksProvider } = getApp()._options.globalData

class TaskListPickerScreen extends ConfiguredListScreen {
  constructor(params) {
    super();

    try {
      params = params ? JSON.parse(params) : {};
    } catch(e) {
      params = {};
    }
    this.lists = params.lists || [];
    this.mode = params.mode;

    // Fallback to cached lists if none provided
    if (this.lists.length === 0 && tasksProvider.hasCachedLists()) {
      const cachedLists = config.get("cachedLists", []);
      this.lists = cachedLists.map(l => ({ id: l.id, title: l.title }));
    }
  }

  build() {
    // Task lists
    this.headline(t("Task lists:"));

    if (this.lists.length === 0) {
      this.text({
        text: t("No lists available"),
        color: 0x999999
      });
    } else {
      this.lists.forEach(({ id, title }) => {
        this.row({
          text: title,
          icon: "icon_s/list.png",
          callback: () => this.selectList(id)
        });
      });
    }

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
    // Use reloadPage with flag so HomeScreen knows this is a manual selection
    reloadPage({
      url: "page/amazfit/HomeScreen",
      param: JSON.stringify({ fromListPicker: true })
    });
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
            reloadPage({
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
