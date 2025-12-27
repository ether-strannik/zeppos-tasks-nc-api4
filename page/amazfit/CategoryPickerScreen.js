import hmUI, { setStatusBarVisible, updateStatusBarTitle } from "@zos/ui";
import { replace, back } from "@zos/router";
import { setScrollMode } from "@zos/page";
import {ConfiguredListScreen} from "../ConfiguredListScreen";
import {ScreenBoard} from "../../lib/mmk/ScreenBoard";
import {createSpinner} from "../Utils";

const { t, config, tasksProvider } = getApp()._options.globalData

class CategoryPickerScreen extends ConfiguredListScreen {
  constructor(param) {
    super();

    try {
      // Handle undefined, null, empty string, or literal "undefined" string
      param = (param && param !== "undefined") ? JSON.parse(param) : {};
    } catch(e) {
      console.log("CategoryPickerScreen param parse error:", e);
      param = {};
    }

    // Fallback: read from config if push() didn't pass params (API 3.0 issue)
    if (!param.listId || !param.taskId) {
      const savedParams = config.get("_categoryPickerParams");
      if (savedParams) {
        console.log("CategoryPickerScreen: Using params from config:", JSON.stringify(savedParams));
        param = savedParams;
        config.set("_categoryPickerParams", null); // Clear after use
      }
    }

    this.listId = param.listId;
    this.taskId = param.taskId;
    this.currentCategories = param.currentCategories || [];

    // Selected categories (copy of current to allow editing)
    this.selected = [...this.currentCategories];

    // Get predefined categories from config
    this.predefinedCategories = config.get("userCategories", []);

    // Merge: include all predefined + any task categories not in predefined
    this.allCategories = [...this.predefinedCategories];
    for (const cat of this.currentCategories) {
      if (!this.allCategories.includes(cat)) {
        this.allCategories.push(cat);
      }
    }
  }

  build() {
    this.headline(t("Categories"));

    if (this.allCategories.length === 0) {
      this.text({
        text: t("No categories defined. Add one below."),
        fontSize: this.fontSize - 2,
        color: 0x999999
      });
    }

    // Show all categories with checkboxes
    this.categoryRows = [];
    for (const category of this.allCategories) {
      const isSelected = this.selected.includes(category);
      const row = this.row({
        text: category,
        icon: `icon_s/cb_${isSelected}.png`,
        callback: () => this.toggleCategory(category)
      });
      this.categoryRows.push({ category, row });
    }

    // Add new category option
    this.offset(16);
    this.row({
      text: t("Add new category..."),
      icon: "icon_s/new.png",
      callback: () => this.showAddCategoryEditor()
    });

    // Delete selected categories (only show if there are categories)
    if (this.allCategories.length > 0) {
      this.row({
        text: t("Delete selected"),
        icon: "icon_s/delete.png",
        callback: () => this.deleteSelected()
      });
    }

    // Save button
    this.offset(16);
    this.row({
      text: t("Save"),
      icon: "icon_s/cb_true.png",
      callback: () => this.saveCategories()
    });

    this.offset();

    // Setup ScreenBoard for adding new category
    this.addCategoryBoard = new ScreenBoard();
    this.addCategoryBoard.title = t("New category");
    this.addCategoryBoard.value = "";
    this.addCategoryBoard.confirmButtonText = t("Add");
    this.addCategoryBoard.onConfirm = (v) => this.doAddCategory(v);
    this.addCategoryBoard.visible = false;
  }

  toggleCategory(category) {
    const index = this.selected.indexOf(category);
    if (index >= 0) {
      // Remove from selection
      this.selected.splice(index, 1);
    } else {
      // Add to selection
      this.selected.push(category);
    }

    // Update UI
    for (const item of this.categoryRows) {
      if (item.category === category) {
        const isSelected = this.selected.includes(category);
        item.row.iconView.setProperty(hmUI.prop.SRC, `icon_s/cb_${isSelected}.png`);
        break;
      }
    }
  }

  showAddCategoryEditor() {
    this.addCategoryBoard.visible = true;
    // hmApp.setLayerY(0);
    setScrollMode({ mode: 0 });
  }

  deleteSelected() {
    if (this.selected.length === 0) {
      hmUI.showToast({ text: t("Select categories first") });
      return;
    }

    // Remove selected categories from predefined list
    const userCategories = config.get("userCategories", []);
    const remaining = userCategories.filter(cat => !this.selected.includes(cat));
    config.set("userCategories", remaining);

    // Reload page with empty selection
    const paramObj = {
      listId: this.listId,
      taskId: this.taskId,
      currentCategories: []
    };
    // Store params in config as workaround for API 3.0 replace() not passing params
    config.set("_categoryPickerParams", paramObj);
    replace({
      url: "page/amazfit/CategoryPickerScreen",
      param: JSON.stringify(paramObj)
    });
  }

  doAddCategory(name) {
    if (!name || !name.trim()) {
      hmUI.showToast({ text: t("Name required") });
      return;
    }

    name = name.trim();

    // Check if already exists
    if (this.allCategories.includes(name)) {
      hmUI.showToast({ text: t("Category exists") });
      return;
    }

    // Add to predefined categories in config
    const userCategories = config.get("userCategories", []);
    userCategories.push(name);
    config.set("userCategories", userCategories);

    // Add to current selection
    this.allCategories.push(name);
    this.selected.push(name);

    // Reload page to show new category
    const paramObj = {
      listId: this.listId,
      taskId: this.taskId,
      currentCategories: this.selected
    };
    // Store params in config as workaround for API 3.0 replace() not passing params
    config.set("_categoryPickerParams", paramObj);
    replace({
      url: "page/amazfit/CategoryPickerScreen",
      param: JSON.stringify(paramObj)
    });
  }

  saveCategories() {
    const task = tasksProvider.getTaskList(this.listId).getTask(this.taskId);

    if (typeof task.setCategories !== 'function') {
      hmUI.showToast({ text: t("Not supported") });
      return;
    }

    const hideSpinner = createSpinner();

    // Sync task first to load rawData, then set categories
    task.sync().then(() => {
      return task.setCategories(this.selected);
    }).then((resp) => {
      hideSpinner();
      if (resp && resp.error) {
        hmUI.showToast({ text: resp.error });
        return;
      }
      back();
    }).catch((e) => {
      hideSpinner();
      hmUI.showToast({ text: e.message || t("Failed to save") });
    });
  }
}

Page({
  onInit(param) {
    setStatusBarVisible(true);
    updateStatusBarTitle(t("Categories"));

    new CategoryPickerScreen(param).build();
  }
})
