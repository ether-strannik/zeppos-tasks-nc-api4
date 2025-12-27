import { setStatusBarVisible, updateStatusBarTitle } from "@zos/ui";
import { setWakeUpRelaunch, setPageBrightTime } from "@zos/display";
import {MarkdownRenderScreen, ResolveFromAssets} from "../../lib/mmk/MarkdownRender";

const { t } = getApp()._options.globalData

Page({
  onInit(filename) {
    setStatusBarVisible(true);
    updateStatusBarTitle(t("Help index"));

    setWakeUpRelaunch({ relaunch: true });
    setPageBrightTime({ brightTime: 15000 });

    try {
      const resolver = new ResolveFromAssets(`raw/help_${t("help_file_prefix")}`,
          "page/amazfit/", "help");
      const reader = new MarkdownRenderScreen(resolver, filename);
      reader.start();
    } catch(e) {
      console.log(e);
    }
  },

  onDestroy() {
    setWakeUpRelaunch({ relaunch: false });
  }
})
