import { setStatusBarVisible, updateStatusBarTitle } from "@zos/ui";
import { ScreenBoardSetup } from "../../lib/mmk/ScreenBoardSetup";

Page({
  onInit() {
    setStatusBarVisible(true);
    updateStatusBarTitle("");

    new ScreenBoardSetup().start();
  }
})
