import {gettext as t} from 'i18n';
import {BottomToolbar, SettingsBody} from "../lib/mmk/setting/Layout";
import {AccountTab} from "./tabs/AccountTab";
import {TabButton} from "../lib/mmk/setting/Tabs";
import {SETTINGS_32} from "../lib/mmk/setting/Icons";
import {StateManager} from "../lib/mmk/setting/StateManager";
import {ACCOUNT_32} from "./Icons";
import {DebugPhoneTab} from "./tabs/DebugPhoneTab";
import {DebugWatchTab} from "./tabs/DebugWatchTab";

AppSettingsPage({
  build(ctx) {
    const state = new StateManager(ctx, "root");
    const [tab, setTab] = state.useState("account");

    // Trigger Side-Service to start
    const nowTag = (new Date()).toISOString().substring(0, 19);
    if(ctx.settingsStorage.getItem("now") !== nowTag) ctx.settingsStorage.setItem("now", nowTag);

    // Build UI root
    return SettingsBody([
      tab === "account" ? AccountTab(ctx) : null,
      tab === "debug_phone" ? DebugPhoneTab(ctx) : null,
      tab === "debug_watch" ? DebugWatchTab(ctx) : null,
      // TabOffset(),
      BottomToolbar([
        TabButton({
          text: t("Account"),
          icon: ACCOUNT_32,
          active: tab === "account",
          callback: () => setTab("account"),
        }),
        TabButton({
          text: "Debug P",
          icon: SETTINGS_32,
          active: tab === "debug_phone",
          callback: () => setTab("debug_phone"),
        }),
        TabButton({
          text: "Debug W",
          icon: SETTINGS_32,
          active: tab === "debug_watch",
          callback: () => setTab("debug_watch"),
        }),
      ]),
    ]);

    // return View({
    //   style: {
    //     margin: "8px"
    //   }
    // }, [
    //     Headline("Debug"),
    // ]);
  },
})
