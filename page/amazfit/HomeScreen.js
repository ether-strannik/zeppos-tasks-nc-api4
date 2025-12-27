import hmUI from "@zos/ui";
import { setStatusBarVisible, updateStatusBarTitle } from "@zos/ui";
import { replace, push } from "@zos/router";
import { setWakeUpRelaunch, setPageBrightTime } from "@zos/display";
import {ICON_SIZE_MEDIUM, ICON_SIZE_SMALL, SCREEN_MARGIN_Y, SCREEN_WIDTH, WIDGET_WIDTH} from "../../lib/mmk/UiParams";

import {createSpinner, getOfflineInfo, log, flushLog} from "../Utils";
import {ConfiguredListScreen} from "../ConfiguredListScreen";
import {TouchEventManager} from "../../lib/mmk/TouchEventManager";
import {AppGesture} from "../../lib/mmk/AppGesture";

const {t, config, tasksProvider, messageBuilder} = getApp()._options.globalData

class HomeScreen extends ConfiguredListScreen {
  constructor(params) {
    super();
    this.cachedMode = false;
    this.currentList = null;
    this.taskData = null;

    try {
      this.params = JSON.parse(params);
      if(!this.params) this.params = {};
    } catch(e) {
      this.params = {};
    }
  }

  init() {
    const offlineMode = config.get("offlineMode", false);
    const forceOnline = this.params.forceOnline;
    const hasCachedLists = tasksProvider.hasCachedLists();

    // Manual offline mode - use cache only, no sync (unless forced)
    if (offlineMode && hasCachedLists && !forceOnline) {
      this.cachedMode = true;
      const cachedHandler = tasksProvider.getCachedHandler();

      cachedHandler.getTaskLists().then((lists) => {
        this.taskLists = lists;
        let selectedListId = config.get("cur_list_id");

        // On initial launch, check launch list setting
        const isInitialLaunch = !this.params.forceOnline && !this.params.returnToListPicker && !this.params.fromListPicker;
        if (isInitialLaunch) {
          const launchMode = config.get("launchListMode", "last");
          if (launchMode === "specific") {
            const launchListId = config.get("launchListId", "");
            if (launchListId) selectedListId = launchListId;
          }
        }

        this.currentList = lists.find(l => l.id === selectedListId) || lists[0];

        if (!this.currentList) {
          this.showOfflineOptions("No cached lists");
          return;
        }

        return this.currentList.getTasks(config.get("withComplete", false));
      }).then((taskData) => {
        if (!taskData) return;

        this.taskData = taskData;
        this.taskData.tasks = this.sortTasks(this.taskData.tasks);
        this.build();
      }).catch((error) => {
        console.log("Cache load failed:", error);
        this.showOfflineOptions(error instanceof Error ? error.message : error);
      });
    } else {
      // Online mode - fetch from server
      this.hideSpinner = createSpinner();
      this.onlineInit();
    }
  }

  /**
   * Online init - fetch from server and cache
   */
  onlineInit() {
    messageBuilder.request({
      package: "tasks_login",
      action: "notify_offline",
      value: config.get("forever_offline", false),
    }, {});

    tasksProvider.init().then(() => {
      return tasksProvider.getTaskLists();
    }).then((lists) => {
      this.taskLists = lists;

      // Sync cached lists with server - add new lists, remove deleted ones
      if (!config.get("forever_offline")) {
        const cachedLists = config.get("cachedLists", []);
        log("=== List Sync ===");
        log("Server lists:", lists.length);
        log("Cached lists:", cachedLists.length);

        // Build new cached lists array matching server
        const newCachedLists = lists.map(serverList => {
          // Find existing cached data for this list
          const cached = cachedLists.find(c => c.id === serverList.id);
          if (cached) {
            // Keep cached tasks, update title
            return { ...cached, title: serverList.title };
          } else {
            // New list - add with empty tasks
            return { id: serverList.id, title: serverList.title, tasks: [] };
          }
        });

        log("New cached lists:", newCachedLists.length);
        config.update({ cachedLists: newCachedLists });
        flushLog();
      }

      if(config.get("forever_offline")) {
        this.currentList = this.taskLists[0];
      } else {
        this.currentList = this.findCurrentList();
        if(!this.currentList) return this.openTaskListPicker("setup", true);
      }

      return tasksProvider.execCachedLog();
    }).then(() => {
      return this.currentList.getTasks(config.get("withComplete", false), this.params.page);
    }).then((taskData) => {
      this.taskData = taskData;
      this.taskData.tasks = this.sortTasks(this.taskData.tasks);

      // Fetch checklist items for all tasks
      const checklistPromises = this.taskData.tasks.map((task) => {
        if (typeof task.getChecklistItems === 'function') {
          return task.getChecklistItems().then((items) => {
            task.checklistItems = items;
          }).catch(() => {
            task.checklistItems = [];
          });
        } else {
          task.checklistItems = [];
          return Promise.resolve();
        }
      });

      return Promise.all(checklistPromises);
    }).then(() => {
      // Cache for offline use
      if (!config.get("forever_offline") && !this.params.page) {
        this.cacheCurrentData();
      }

      // If this was a forced sync while in offline mode, go back to offline
      if (this.params.forceOnline && config.get("offlineMode", false)) {
        this.hideSpinner();
        hmUI.showToast({ text: t("Sync complete") });
        replace({
          url: "page/amazfit/HomeScreen",
          param: JSON.stringify({})
        });
        return;
      }

      this.cachedMode = false;
      this.hideSpinner();

      // If returnToListPicker flag is set, navigate directly to TaskListPickerScreen
      if (this.params.returnToListPicker) {
        this.openTaskListPicker("online", true);
        return;
      }

      this.build();
    }).catch((error) => {
      this.onInitFailure(error instanceof Error ? error.message : error);
      this.hideSpinner();
    });
  }

  /**
   * Cache current list data after successful online fetch
   */
  cacheCurrentData() {
    // Cache to legacy single-list structure
    tasksProvider.createCacheData(this.currentList.id, this.taskData.tasks);

    // Also cache to multi-list structure
    const cachedLists = config.get("cachedLists", []);
    const listIndex = cachedLists.findIndex(l => l.id === this.currentList.id);

    // Helper to cache a task (including subtasks recursively)
    const cacheTask = (task) => ({
      id: task.id,
      title: task.title,
      completed: task.completed,
      important: task.important || false,
      checklistItems: task.checklistItems || [],
      uid: task.uid || null,
      parentId: task.parentId || null,
      priority: task.priority || 0,
      status: task.status || "NEEDS-ACTION",
      inProgress: task.inProgress || false,
      dueDate: task.dueDate ? task.dueDate.getTime() : null,  // Store as timestamp
      categories: task.categories || [],
      alarm: task.alarm !== undefined ? task.alarm : null,
      subtasks: (task.subtasks || []).map(cacheTask)
    });

    const listData = {
      id: this.currentList.id,
      title: this.currentList.title,
      tasks: this.taskData.tasks.map(cacheTask)
    };

    if (listIndex >= 0) {
      cachedLists[listIndex] = listData;
    } else {
      cachedLists.push(listData);
    }
    config.update({ cachedLists: cachedLists });
  }

  /**
   * Open task list picker (as new pane or replace current)
   */
  openTaskListPicker(mode, replace = false) {
    const params = {
      url: `page/amazfit/TaskListPickerScreen`,
      param: JSON.stringify({
        lists: this.taskLists,
        mode
      })
    };

    replace ? replace(params) : push(params);
  }

  /**
   * Open new note creation UI
   */
  openNewNoteUI() {
    push({
      url: `page/amazfit/NewNoteScreen`,
      param: JSON.stringify({
        list: this.currentList.id
      })
    })
  }

  /**
   * Sort tasks based on user preference
   */
  sortTasks(tasks) {
    const sortMode = config.get("sortMode", "none");
    if (sortMode === "alpha") {
      return tasks.slice().sort((a, b) =>
        (a.title || "").toLowerCase().localeCompare((b.title || "").toLowerCase())
      );
    }
    return tasks;
  }

  /**
   * Find saved user list
   * On initial launch, respects "On Launch Open" setting
   */
  findCurrentList() {
    let selectedList = config.get("cur_list_id");

    // On initial app launch (no special params), check launch list setting
    const isInitialLaunch = !this.params.forceOnline && !this.params.returnToListPicker && !this.params.fromListPicker;
    if (isInitialLaunch) {
      const launchMode = config.get("launchListMode", "last");
      if (launchMode === "specific") {
        const launchListId = config.get("launchListId", "");
        if (launchListId) {
          selectedList = launchListId;
        }
      }
    }

    for (const entry of this.taskLists) {
      // noinspection JSUnresolvedReference
      if (entry.id === selectedList) {
        return entry;
      }
    }

    return null;
  }

  /**
   * Build main UI
   */
  build(offlineInfo="") {
    // Header
    this.twoActionBar([
      {
        text: this.cachedMode ? getOfflineInfo(offlineInfo) : this.currentList.title,
        color: this.cachedMode ? 0xFF9900 : 0xFFFFFF,
        icon: `icon_s/mode_${this.cachedMode ? "cached" : "online"}.png`,
        callback: () => this.openTaskListPicker(this.cachedMode ? "cached": "online")
      },
      {
        text: t("New…"),
        icon: "icon_s/new.png",
        callback: () => this.openNewNoteUI()
      }
    ])

    // Tasks
    this.headline(t(this.cachedMode ? "Offline tasks:" : "Tasks:"));
    console.log(this.taskData.tasks);
    this.taskData.tasks.map((data) => {
      this.taskCard(data);
    });

    if(this.taskData.tasks.length === 0) {
      this.text({
        text: t("There's no incomplete tasks in that list")
      })
    }

    this.taskData.nextPageToken ? this.moreButton() : this.offset();
  }

  /**
   * UI: Show more button
   */
  moreButton() {
    const height = Math.max(64, SCREEN_MARGIN_Y);
    const view = hmUI.createWidget(hmUI.widget.IMG, {
      x: 0,
      y: this.positionY,
      w: SCREEN_WIDTH,
      h: height,
      pos_x: Math.floor((SCREEN_WIDTH - ICON_SIZE_MEDIUM) / 2),
      pos_y: Math.floor((height - ICON_SIZE_MEDIUM) / 2),
      src: "icon_m/more.png"
    });

    new TouchEventManager(view).ontouch = () => {
      replace({
        url: `page/amazfit/HomeScreen`,
        param: JSON.stringify({
          page: this.taskData.nextPageToken
        })
      })
    };

    this.positionY += height;
  }

  /**
   * UI: Task card widget
   */
  taskCard(data) {
    let {title, completed, important, inProgress, status} = data;

    if(!title) title = "";
    let displayTitle = title;

    // Add reminder countdown if enabled and available
    if (config.get("showCountdown", false) && typeof data.getReminderCountdown === 'function') {
      const countdown = data.getReminderCountdown();
      if (countdown) {
        displayTitle += ` (${countdown})`;
      }
    }

    // Determine if task supports status (CalDAV)
    const supportsStatus = typeof data.setStatus === 'function';

    // Double-tap detection
    let lastTapTime = 0;
    const DOUBLE_TAP_THRESHOLD = 400; // ms

    const row = this.row({
      text: displayTitle,
      card: {
        hiddenButton: t("Edit"),
        hiddenButtonCallback: () => {
          push({
            url: `page/amazfit/TaskEditScreen`,
            param: JSON.stringify({
              list_id: this.currentList.id,
              task_id: data.id
            })
          })
        }
      },
      callback: () => {
        const now = Date.now();
        const isDoubleTap = (now - lastTapTime) < DOUBLE_TAP_THRESHOLD;
        lastTapTime = now;

        if (supportsStatus && isDoubleTap) {
          // Double tap: set to IN-PROCESS
          try {
            data.setStatus("IN-PROCESS");
          } catch(e) {
            hmUI.showToast({ text: e.message });
            return;
          }
          status = "IN-PROCESS";
          completed = false;
          inProgress = true;
        } else {
          // Single tap: toggle completed
          completed = !completed;
          try {
            if (supportsStatus) {
              data.setStatus(completed ? "COMPLETED" : "NEEDS-ACTION");
              status = completed ? "COMPLETED" : "NEEDS-ACTION";
              inProgress = false;
            } else {
              data.setCompleted(completed);
            }
          } catch(e) {
            hmUI.showToast({ text: e.message });
            return;
          }
        }

        updateStatus();
      }
    });

    // Get priority color for checkbox border
    const getPriorityColor = () => {
      if (typeof data.getPriorityColor === 'function') {
        return data.getPriorityColor();
      } else if (important) {
        return 0xFFD700; // Microsoft important - gold
      }
      return null; // No priority color
    };

    // Add colored ring around checkbox if task has priority
    let priorityRing = null;
    const priorityColor = getPriorityColor();
    if (priorityColor && priorityColor !== 0xFFFFFF) {
      const ringSize = ICON_SIZE_SMALL + 4;
      const ringX = Math.floor(ICON_SIZE_SMALL / 2) - 2;
      const ringY = Math.floor((row.viewHeight - ICON_SIZE_SMALL) / 2) - 2;

      priorityRing = row.group.createWidget(hmUI.widget.ARC, {
        x: ringX,
        y: ringY,
        w: ringSize,
        h: ringSize,
        start_angle: 0,
        end_angle: 360,
        color: priorityColor,
        line_width: 2
      });
    }

    // Add notes indicator icon on right side if task has description
    if (data.description && data.description.trim().length > 0) {
      const iconSize = ICON_SIZE_SMALL;
      const iconX = WIDGET_WIDTH - iconSize - 8;  // Right side of row
      const iconY = Math.floor((row.viewHeight - iconSize) / 2);

      row.group.createWidget(hmUI.widget.IMG, {
        x: iconX,
        y: iconY,
        w: iconSize,
        h: iconSize,
        src: 'icon_s/edit.png'
      });
    }

    // Add category tag badge if enabled and task has categories
    if (config.get("showCategories", false) && data.categories && data.categories.length > 0) {
      const tagText = "#" + data.categories[0];
      const tagPadding = 10;
      const tagFontSize = 22;
      const tagCharWidth = 11;  // Approximate character width
      const tagWidth = tagText.length * tagCharWidth + tagPadding * 2;
      const tagHeight = 28;
      // Position to the left of notes icon (if present) or right side
      const hasNotes = data.description && data.description.trim().length > 0;
      const tagX = WIDGET_WIDTH - tagWidth - (hasNotes ? ICON_SIZE_SMALL + 16 : 8);
      const tagY = Math.floor((row.viewHeight - tagHeight) / 2);

      // Background rounded rectangle
      row.group.createWidget(hmUI.widget.FILL_RECT, {
        x: tagX,
        y: tagY,
        w: tagWidth,
        h: tagHeight,
        radius: 4,
        color: 0x444444  // Dark gray background
      });

      // Tag text
      row.group.createWidget(hmUI.widget.TEXT, {
        x: tagX,
        y: tagY,
        w: tagWidth,
        h: tagHeight,
        text: tagText,
        text_size: tagFontSize,
        color: 0xCCCCCC,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V
      });
    }

    // Get checkbox icon based on status
    const getCheckboxIcon = () => {
      if (completed) return 'icon_s/cb_true.png';
      if (inProgress) return 'icon_s/cb_inprogress.png';
      return 'icon_s/cb_false.png';
    };

    const updateStatus = () => {
      row.textView.setProperty(hmUI.prop.COLOR, completed ? 0x999999 : 0xFFFFFF);
      row.iconView.setProperty(hmUI.prop.SRC, getCheckboxIcon());

      // Hide/dim priority ring when completed
      if (priorityRing) {
        priorityRing.setProperty(hmUI.prop.COLOR, completed ? 0x666666 : priorityColor);
      }
    }

    updateStatus();

    // Display steps (checklist items) under the task - Microsoft
    if (data.checklistItems && data.checklistItems.length > 0) {
      data.checklistItems.forEach((item) => {
        this.stepRow(data, item);
      });
    }

    // Display subtasks under the task - CalDAV/Nextcloud
    if (data.subtasks && data.subtasks.length > 0) {
      data.subtasks.forEach((subtask) => {
        this.subtaskRow(subtask);
      });
    }
  }

  /**
   * UI: Step (checklist item) row - indented under task
   */
  stepRow(task, item) {
    let isChecked = item.isChecked;

    const getPrefix = () => isChecked ? "    ✓ " : "    ○ ";

    const row = this.row({
      text: getPrefix() + item.displayName,
      callback: () => {
        if (typeof task.setChecklistItemChecked === 'function') {
          isChecked = !isChecked;

          // Update UI immediately
          row.textView.setProperty(hmUI.prop.TEXT, getPrefix() + item.displayName);
          row.textView.setProperty(hmUI.prop.COLOR, isChecked ? 0x666666 : 0xAAAAAA);

          // Fire API call (don't wait for it)
          task.setChecklistItemChecked(item.id, isChecked).catch(() => {
            hmUI.showToast({ text: t("Failed to update") });
          });
        }
      }
    });

    // Style: gray color for steps
    row.textView.setProperty(hmUI.prop.COLOR, isChecked ? 0x666666 : 0xAAAAAA);
  }

  /**
   * UI: Subtask row - indented under parent task (CalDAV/Nextcloud)
   */
  subtaskRow(subtask) {
    let {completed, inProgress} = subtask;
    const supportsStatus = typeof subtask.setStatus === 'function';

    // Get checkbox icon based on status
    const getCheckboxIcon = () => {
      if (completed) return 'icon_s/cb_true.png';
      if (inProgress) return 'icon_s/cb_inprogress.png';
      return 'icon_s/cb_false.png';
    };

    // Double-tap detection
    let lastTapTime = 0;
    const DOUBLE_TAP_THRESHOLD = 400; // ms

    // Indentation for subtask
    const indent = ICON_SIZE_SMALL;

    const row = this.row({
      text: "      " + subtask.title,  // Text indent via spaces
      icon: getCheckboxIcon(),
      card: {
        hiddenButton: t("Edit"),
        hiddenButtonCallback: () => {
          push({
            url: `page/amazfit/TaskEditScreen`,
            param: JSON.stringify({
              list_id: subtask.list ? subtask.list.id : this.currentList.id,
              task_id: subtask.id
            })
          })
        }
      },
      callback: () => {
        const now = Date.now();
        const isDoubleTap = (now - lastTapTime) < DOUBLE_TAP_THRESHOLD;
        lastTapTime = now;

        if (supportsStatus && isDoubleTap) {
          // Double tap: set to IN-PROCESS
          subtask.setStatus("IN-PROCESS").catch(() => {
            hmUI.showToast({ text: t("Failed to update") });
          });
          completed = false;
          inProgress = true;
        } else {
          // Single tap: toggle completed
          completed = !completed;
          if (supportsStatus) {
            subtask.setStatus(completed ? "COMPLETED" : "NEEDS-ACTION").catch(() => {
              hmUI.showToast({ text: t("Failed to update") });
            });
            inProgress = false;
          } else {
            subtask.setCompleted(completed).catch(() => {
              hmUI.showToast({ text: t("Failed to update") });
            });
          }
        }

        // Update UI immediately
        row.textView.setProperty(hmUI.prop.COLOR, completed ? 0x666666 : 0xAAAAAA);
        row.iconView.setProperty(hmUI.prop.SRC, getCheckboxIcon());

        // Update priority ring
        if (priorityRing) {
          priorityRing.setProperty(hmUI.prop.COLOR, completed ? 0x666666 : priorityColor);
        }
      }
    });

    // Move icon to indented position
    row.iconView.setProperty(hmUI.prop.X, Math.floor(ICON_SIZE_SMALL / 2) + indent);

    // Get priority color
    let priorityColor = null;
    if (typeof subtask.getPriorityColor === 'function') {
      priorityColor = subtask.getPriorityColor();
      if (priorityColor === 0xFFFFFF) priorityColor = null;
    }

    // Add colored ring around checkbox if priority set
    let priorityRing = null;
    if (priorityColor) {
      const ringSize = ICON_SIZE_SMALL + 4;
      const ringX = Math.floor(ICON_SIZE_SMALL / 2) + indent - 2;
      const ringY = Math.floor((row.viewHeight - ICON_SIZE_SMALL) / 2) - 2;

      priorityRing = row.group.createWidget(hmUI.widget.ARC, {
        x: ringX,
        y: ringY,
        w: ringSize,
        h: ringSize,
        start_angle: 0,
        end_angle: 360,
        color: completed ? 0x666666 : priorityColor,
        line_width: 2
      });
    }

    // Add notes indicator icon on right side if subtask has description
    if (subtask.description && subtask.description.trim().length > 0) {
      const iconSize = ICON_SIZE_SMALL;
      const iconX = WIDGET_WIDTH - iconSize - 8;  // Right side of row
      const iconY = Math.floor((row.viewHeight - iconSize) / 2);

      row.group.createWidget(hmUI.widget.IMG, {
        x: iconX,
        y: iconY,
        w: iconSize,
        h: iconSize,
        src: 'icon_s/edit.png'
      });
    }

    // Style: gray for subtasks
    row.textView.setProperty(hmUI.prop.COLOR, completed ? 0x666666 : 0xAAAAAA);
  }

  /**
   * This function will handle init error
   */
  onInitFailure(message) {
    // Try new multi-list cache first
    if (tasksProvider.hasCachedLists() && !config.get("forever_offline", false)) {
      this.cachedMode = true;
      const cachedHandler = tasksProvider.getCachedHandler();

      return cachedHandler.getTaskLists().then((lists) => {
        this.taskLists = lists;
        let selectedListId = config.get("cur_list_id");

        // On initial launch, check launch list setting
        const isInitialLaunch = !this.params.forceOnline && !this.params.returnToListPicker && !this.params.fromListPicker;
        if (isInitialLaunch) {
          const launchMode = config.get("launchListMode", "last");
          if (launchMode === "specific") {
            const launchListId = config.get("launchListId", "");
            if (launchListId) selectedListId = launchListId;
          }
        }

        this.currentList = lists.find(l => l.id === selectedListId) || lists[0];

        if (!this.currentList) {
          this.showOfflineOptions(message);
          return;
        }

        return this.currentList.getTasks(config.get("withComplete", false));
      }).then((taskData) => {
        if (!taskData) return;

        this.taskData = taskData;
        this.taskData.tasks = this.sortTasks(this.taskData.tasks);
        this.build(message);
      }).catch(() => {
        this.showOfflineOptions(message);
      });
    }

    // Fall back to legacy single-list cache
    if (config.get("tasks", false) && !config.get("forever_offline", false)) {
      this.cachedMode = true;
      this.currentList = tasksProvider.getCachedTasksList();
      return this.currentList.getTasks().then((tasks) => {
        this.taskData = tasks;
        this.taskData.tasks = this.sortTasks(this.taskData.tasks);
        this.build(message);
      });
    }

    this.showOfflineOptions(message);
  }

  /**
   * Show offline/error options when no cache available
   */
  showOfflineOptions(message) {
    this.row({
      text: getOfflineInfo(message),
      color: 0xFF9900,
      icon: "icon_s/mode_cached.png",
      card: {
        color: 0x0
      }
    });

    this.row({
      text: t("Use application without sync"),
      icon: "icon_s/mode_offline.png",
      callback: () => {
        tasksProvider.setupOffline();
        replace({
          url: `page/amazfit/HomeScreen`,
        })
      }
    });
  }
}

// noinspection JSCheckFunctionSignatures
Page({
  onInit(params) {
    console.log("HomePage.build()");
    setStatusBarVisible(true);
    updateStatusBarTitle(t("Tasks"));

    setWakeUpRelaunch({ relaunch: true });
    setPageBrightTime({ brightTime: 15000 });

    // Pull-to-refresh: double swipe down to sync (if enabled)
    if (config.get("pullToRefresh", false)) {
      let lastSwipe = 0;
      AppGesture.init();
      AppGesture.on("down", () => {
        const now = Date.now();
        if (now - lastSwipe < 1000) {
          // Second swipe within 1 second - trigger sync
          hmUI.showToast({ text: t("Syncing...") });
          replace({
            url: "page/amazfit/HomeScreen",
            param: JSON.stringify({ forceOnline: true })
          });
        } else {
          // First swipe - show hint
          hmUI.showToast({ text: t("Swipe again to sync") });
          lastSwipe = now;
        }
        return true;
      });
    }

    try {
      new HomeScreen(params).init();
    } catch(e) {
      console.log(e);
    }
  },

  onDestroy() {
    setWakeUpRelaunch({ relaunch: false });
  }
})
