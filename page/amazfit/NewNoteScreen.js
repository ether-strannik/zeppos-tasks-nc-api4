import { setStatusBarVisible, createKeyboard, deleteKeyboard, inputType } from "@zos/ui";
import { back } from "@zos/router";
import {createSpinner} from "../Utils";
import {ConfiguredListScreen} from "../ConfiguredListScreen";

const { t, config, tasksProvider } = getApp()._options.globalData

class NewNoteScreen extends ConfiguredListScreen {
  constructor(params) {
    super();

    // CRITICAL: Log with guaranteed output
    const logMsg = "NewNoteScreen constructor called";
    console.log("=== " + logMsg + " ===");
    console.log("params type:", typeof params);
    console.log("params value:", params);
    console.log("params === undefined:", params === undefined);
    console.log("params === 'undefined':", params === "undefined");

    // Handle undefined params gracefully
    if (params === undefined || params === "undefined" || !params) {
      console.log("WARNING: No params provided, using currentList from config");
      const currentListId = config.get("cur_list_id");
      console.log("Current list ID from config:", currentListId);

      this.params = {
        list: currentListId
      };
      console.log("Fallback list ID:", this.params.list);
    } else {
      try {
        this.params = JSON.parse(params);
        console.log("Parsed params successfully");
        console.log("List ID from params:", this.params.list);
      } catch(e) {
        console.log("Error parsing params:", e);
        console.log("Error name:", e.name);
        console.log("Error message:", e.message);
        this.params = {};
      }
    }

    this.keyboard = null;
  }

  build() {
    console.log("=== NewNoteScreen.build() called ===");
    console.log("About to create keyboard with inputType.CHAR");

    // Create system keyboard with CHAR input type (T9 with voice support)
    this.keyboard = createKeyboard({
      inputType: inputType.CHAR,
      text: "",  // Initial text
      onComplete: (keyboardWidget, result) => {
        console.log("=== KEYBOARD ONCOMPLETE TRIGGERED ===");
        console.log("Keyboard result.data:", result.data);
        console.log("typeof result.data:", typeof result.data);
        console.log("result.data length:", result.data ? result.data.length : "N/A");

        // Delete keyboard first to prevent loop
        try {
          deleteKeyboard();
          console.log("Keyboard deleted successfully");
        } catch (e) {
          console.log("Error deleting keyboard:", e);
        }

        console.log("Calling doCreateTask with text:", result.data);
        this.doCreateTask(result.data);
      },
      onCancel: () => {
        console.log("=== KEYBOARD CANCELLED ===");
        try {
          deleteKeyboard();
        } catch (e) {
          console.log("Error deleting keyboard on cancel:", e);
        }
        back();
      }
    });

    console.log("Keyboard created:", this.keyboard !== null);
  }

  doCreateTask(text) {
    console.log("=== doCreateTask called ===");
    console.log("Text value:", text);
    console.log("Text trimmed:", text ? text.trim() : "NULL");

    if (!text || text.trim() === "") {
      console.log("Empty text detected, going back");
      back();
      return;
    }

    console.log("Text validation passed, creating task");
    console.log("this.params:", JSON.stringify(this.params));
    console.log("this.params.list:", this.params.list);

    if (!this.params.list) {
      console.log("ERROR: No list ID available!");
      console.log("Cannot create task without a target list");
      back();
      return;
    }

    createSpinner();
    console.log("Spinner created");

    try {
      console.log("Getting task list from tasksProvider");
      console.log("List ID:", this.params.list);
      const list = tasksProvider.getTaskList(this.params.list);
      console.log("Got list:", list ? "YES" : "NULL");
      console.log("List type:", list ? list.constructor.name : "N/A");

      if (!list) {
        console.log("ERROR: getTaskList returned null/undefined!");
        back();
        return;
      }

      console.log("Calling list.insertTask with text:", text);
      list.insertTask(text).then(() => {
        console.log("=== Task created successfully ===");
        back();
      }).catch((error) => {
        console.log("=== Error creating task (promise rejected) ===");
        console.log("Error:", error);
        console.log("Error message:", error.message);
        console.log("Error stack:", error.stack);
        back();
      });
    } catch (error) {
      console.log("=== Exception in doCreateTask ===");
      console.log("Error:", error);
      console.log("Error message:", error.message);
      console.log("Error stack:", error.stack);
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
