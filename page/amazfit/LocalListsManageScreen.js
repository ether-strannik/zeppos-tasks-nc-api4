import hmUI, { setStatusBarVisible, updateStatusBarTitle } from "@zos/ui";
import { push, back } from "@zos/router";
import { ConfiguredListScreen } from "../ConfiguredListScreen";

const { config, t } = getApp()._options.globalData;

class LocalListsManageScreen extends ConfiguredListScreen {
  constructor(params) {
    super();
    this.selectedLists = new Set(); // Track selected list IDs
  }

  build() {
    this.headline(t("Manage Local Lists"));

    const localLists = config.get("localLists", []);

    if (localLists.length === 0) {
      this.offset(32);
      this.text({
        text: t("No local lists yet"),
        color: 0x999999,
        align_h: hmUI.align.CENTER_H
      });
      return;
    }

    // Show all local lists with checkboxes
    localLists.forEach((list) => {
      const isSelected = this.selectedLists.has(list.id);

      this.listRows = this.listRows || [];
      const row = this.row({
        text: list.title,
        icon: `icon_s/cb_${isSelected}.png`,
        callback: () => this.toggleListSelection(list.id, row)
      });
      this.listRows.push({ id: list.id, row });
    });

    // Delete button at bottom
    if (localLists.length > 0) {
      this.offset(32);
      this.row({
        text: t("Delete selected lists"),
        icon: "icon_s/delete.png",
        callback: () => this.deleteSelectedLists()
      });

      this.offset(16);
      this.text({
        text: t("This will permanently delete the selected local lists and all their tasks"),
        fontSize: this.fontSize - 2,
        color: 0x999999
      });
    }

    this.offset();
  }

  toggleListSelection(listId, row) {
    if (this.selectedLists.has(listId)) {
      this.selectedLists.delete(listId);
    } else {
      this.selectedLists.add(listId);
    }

    // Update checkbox icon
    const isSelected = this.selectedLists.has(listId);
    row.iconView.setProperty(hmUI.prop.SRC, `icon_s/cb_${isSelected}.png`);
  }

  deleteSelectedLists() {
    if (this.selectedLists.size === 0) {
      return hmUI.showToast({ text: t("No lists selected") });
    }

    // Confirm deletion
    if (!this.deleteConfirmed) {
      this.deleteConfirmed = true;
      return hmUI.showToast({ text: t("Tap again to confirm") });
    }

    const localLists = config.get("localLists", []);
    const currentListId = config.get("cur_list_id");

    // Filter out selected lists
    const remainingLists = localLists.filter(list => !this.selectedLists.has(list.id));

    // Update config
    config.update({
      localLists: remainingLists
    });

    // If current list was deleted, clear cur_list_id
    if (currentListId && this.selectedLists.has(currentListId)) {
      config.set("cur_list_id", null);
    }

    hmUI.showToast({
      text: t(`Deleted ${this.selectedLists.size} list(s)`)
    });

    // Go back to settings
    back();
  }
}

// noinspection JSCheckFunctionSignatures
Page({
  onInit(params) {
    setStatusBarVisible(true);
    updateStatusBarTitle("");

    new LocalListsManageScreen(params).build();
  }
});
