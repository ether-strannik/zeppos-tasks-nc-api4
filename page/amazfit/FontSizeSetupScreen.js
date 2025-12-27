import { setStatusBarVisible, updateStatusBarTitle } from "@zos/ui";
import { FontSizeSetupScreen } from "../../lib/mmk/FontSizeSetupScreen";

const { config } = getApp()._options.globalData

class ConfiguredFontSizeSetupScreen extends FontSizeSetupScreen {
  getSavedFontSize(f) {
    return config.get("fontSize", f);
  }

  onChange(v) {
    config.set("fontSize", v);
  }
}

Page({
  onInit() {
    setStatusBarVisible(true);
    updateStatusBarTitle("");

    new ConfiguredFontSizeSetupScreen().start();
  }
})
