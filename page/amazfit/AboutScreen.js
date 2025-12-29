import { setStatusBarVisible, updateStatusBarTitle } from "@zos/ui";
import { BaseAboutScreen } from "../../lib/mmk/BaseAboutScreen";
import {VERSION} from "../../version";

const { t } = getApp()._options.globalData

class AboutScreen extends BaseAboutScreen {
  constructor(p) {
    super();

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

// noinspection JSCheckFunctionSignatures
Page({
  onInit(params) {
    setStatusBarVisible(false);
    updateStatusBarTitle("");

    new AboutScreen(params).start();
  }
})
