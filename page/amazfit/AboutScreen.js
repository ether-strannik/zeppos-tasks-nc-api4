import { setStatusBarVisible } from "@zos/ui";
import { BaseAboutScreen } from "../../lib/mmk/BaseAboutScreen";
import { ListScreen } from "../../lib/mmk/ListScreen";
import {VERSION} from "../../version";

const { t } = getApp()._options.globalData

class AboutScreen extends BaseAboutScreen {
  constructor(p) {
    super();

    const params = JSON.parse(p);
    this.debugLog = params.debugLog || null;

    this.appId = 1023438;
    this.appName = "Tasks NC";
    this.version = VERSION;

    this.iconSize = 100;
    this.iconFile = "icon_about.png";

    this.infoRows = [
      ["ether-strannik", "Developer"],
      ["by melianmiko", "Fork of ZeppTasks"],
    ];

    this.uninstallText = t("Uninstall");
    this.uninstallConfirm = t("Tap again to confirm");
    this.uninstallResult = t("Uninstall complete");
  }
}

class DebugLogScreen extends ListScreen {
  constructor(logContent) {
    super();
    this.logContent = logContent;
  }

  start() {
    this.headline(t("Debug Log:"));
    this.text({
      text: this.logContent || "(no logs)",
      fontSize: this.fontSize - 4,
      color: 0xCCCCCC
    });
    this.offset();
  }
}

// noinspection JSCheckFunctionSignatures
Page({
  onInit(params) {
    setStatusBarVisible(false);

    const parsed = JSON.parse(params || "{}");
    if (parsed.debugLog !== undefined) {
      new DebugLogScreen(parsed.debugLog).start();
    } else {
      new AboutScreen(params).start();
    }
  }
})
