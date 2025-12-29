import { setStatusBarVisible, createKeyboard, deleteKeyboard, inputType } from "@zos/ui";
import { back, replace } from "@zos/router";
import {createSpinner} from "../Utils";
import {ConfiguredListScreen} from "../ConfiguredListScreen";

const { t, config, tasksProvider } = getApp()._options.globalData

class NewNoteScreen extends ConfiguredListScreen {
  constructor(params) {
    super();

    console.log("=== NEWNOTESCREEN CONSTRUCTOR ===");
    console.log("Raw params:", params);

    // Handle undefined params gracefully
    if (params === undefined || params === "undefined" || !params) {
      console.log("Params undefined, checking config fallback");
      // Fallback: read from config if push() didn't pass params (API 3.0 issue)
      const savedParams = config.get("_newNoteParams");
      if (savedParams) {
        console.log("Found saved params:", JSON.stringify(savedParams));
        this.params = savedParams;
        config.set("_newNoteParams", null); // Clear after use
      } else {
        console.log("No saved params, using cur_list_id fallback");
        // Fallback to current list from config
        this.params = {
          list: config.get("cur_list_id")
        };
      }
    } else {
      try {
        this.params = JSON.parse(params);
        console.log("Parsed params:", JSON.stringify(this.params));
      } catch(e) {
        console.log("Error parsing params:", e);
        this.params = {};
      }
    }

    console.log("Final this.params.mode:", this.params.mode);
    console.log("Final this.params.list:", this.params.list);
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

    // Check if we're creating a local list instead of a task
    if (this.params.mode === "create_local_list") {
      console.log("=== CREATE LOCAL LIST START ===");
      console.log("List title:", text.trim());

      const localLists = config.get("localLists", []);
      console.log("Current localLists count:", localLists.length);
      console.log("Current localLists:", JSON.stringify(localLists));

      const nextId = config.get("next_local_list_id", 0);
      console.log("next_local_list_id:", nextId);

      const newListId = `local:${nextId}`;
      console.log("New list ID:", newListId);

      const newList = {
        id: newListId,
        title: text.trim(),
        tasks: []
      };
      console.log("New list object:", JSON.stringify(newList));

      localLists.push(newList);
      console.log("After push, localLists count:", localLists.length);

      console.log("About to call config.update()...");
      config.update({
        localLists: localLists,
        next_local_list_id: nextId + 1,
        cur_list_id: newListId  // Auto-select new list
      });
      console.log("config.update() completed");

      console.log("=== VERIFICATION START ===");
      const verifyLists = config.get("localLists", []);
      const verifyCurList = config.get("cur_list_id");
      const verifyNextId = config.get("next_local_list_id");
      console.log("Verify localLists count:", verifyLists.length);
      console.log("Verify localLists:", JSON.stringify(verifyLists));
      console.log("Verify cur_list_id:", verifyCurList);
      console.log("Verify next_local_list_id:", verifyNextId);

      // Check if our newly created list is in the verified lists
      const foundNewList = verifyLists.find(l => l.id === newListId);
      console.log("Can find new list in verified data?", foundNewList ? "YES" : "NO");
      if (foundNewList) {
        console.log("Found list:", JSON.stringify(foundNewList));
      }
      console.log("=== VERIFICATION END ===");
      console.log("=== CREATE LOCAL LIST END ===");

      // Navigate directly to HomeScreen with the new local list
      console.log("Navigating to HomeScreen...");
      replace({
        url: "page/amazfit/HomeScreen",
        param: JSON.stringify({ fromListPicker: true })
      });
      return;
    }

    // Regular task creation
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
