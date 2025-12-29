import { setStatusBarVisible, createKeyboard, deleteKeyboard, inputType } from "@zos/ui";
import { back } from "@zos/router";
import {createSpinner} from "../Utils";
import {ConfiguredListScreen} from "../ConfiguredListScreen";

const { t, config, tasksProvider } = getApp()._options.globalData

class NewNoteScreen extends ConfiguredListScreen {
  constructor(params) {
    super();

    // Handle undefined params gracefully
    if (params === undefined || params === "undefined" || !params) {
      // Fallback to current list from config
      this.params = {
        list: config.get("cur_list_id")
      };
    } else {
      try {
        this.params = JSON.parse(params);
      } catch(e) {
        console.log("Error parsing params:", e);
        this.params = {};
      }
    }

    this.keyboard = null;
  }

  build() {
    // Create system keyboard with CHAR input type (T9 with voice support)
    this.keyboard = createKeyboard({
      inputType: inputType.CHAR,
      text: "",
      onComplete: (keyboardWidget, result) => {
        // Delete keyboard first to prevent loop
        try {
          deleteKeyboard();
        } catch (e) {
          console.log("Error deleting keyboard:", e);
        }

        this.doCreateTask(result.data);
      },
      onCancel: () => {
        try {
          deleteKeyboard();
        } catch (e) {
          console.log("Error deleting keyboard on cancel:", e);
        }
        back();
      }
    });
  }

  doCreateTask(text) {
    if (!text || text.trim() === "") {
      back();
      return;
    }

    if (!this.params.list) {
      console.log("ERROR: No list ID available for task creation");
      back();
      return;
    }

    createSpinner();

    try {
      const list = tasksProvider.getTaskList(this.params.list);

      if (!list) {
        console.log("ERROR: Task list not found:", this.params.list);
        back();
        return;
      }

      list.insertTask(text).then(() => {
        back();
      }).catch((error) => {
        console.log("Error creating task:", error);
        back();
      });
    } catch (error) {
      console.log("Exception in doCreateTask:", error);
      back();
    }
  }
}

// noinspection JSCheckFunctionSignatures
Page({
  onInit(params) {
    setStatusBarVisible(false);
    new NewNoteScreen(params).build();
  }
})
