import hmUI from "@zos/ui";
import { setStatusBarVisible, updateStatusBarTitle } from "@zos/ui";
import { replace, push } from "@zos/router";
import { setWakeUpRelaunch, setPageBrightTime } from "@zos/display";
import {ICON_SIZE_MEDIUM, ICON_SIZE_SMALL, SCREEN_MARGIN_Y, SCREEN_WIDTH, WIDGET_WIDTH} from "../../lib/mmk/UiParams";

import {createSpinner, getOfflineInfo, log, flushLog} from "../Utils";
import {ConfiguredListScreen} from "../ConfiguredListScreen";
import {TouchEventManager} from "../../lib/mmk/TouchEventManager";
import {AppGesture} from "../../lib/mmk/AppGesture";
import {cancelTaskAlarms} from "../../utils/app-reminder-manager";

const {t, config, tasksProvider, messageBuilder} = getApp()._options.globalData

class HomeScreen extends ConfiguredListScreen {
  constructor(params) {
    console.log("=== HOMESCREEN CONSTRUCTOR START ===");
    console.log("Raw params received:", params);

    super();
    console.log("super() completed");

    this.cachedMode = false;
    this.currentList = null;
    this.taskData = null;

    console.log("Parsing params...");
    try {
      this.params = JSON.parse(params);
      console.log("Parsed params:", JSON.stringify(this.params));
      if(!this.params) this.params = {};
    } catch(e) {
      console.log("Error parsing params:", e);
      this.params = {};
    }
    console.log("=== HOMESCREEN CONSTRUCTOR END ===");
  }

  init() {
    console.log("=== HOMESCREEN INIT START ===");
    console.log("this.params:", JSON.stringify(this.params));

    // Determine which list to load
    let selectedListId = config.get("cur_list_id");
    console.log("cur_list_id from config:", selectedListId);

    // SAFETY: If selectedListId is a local list, verify it exists before trying to load
    if (selectedListId && selectedListId.startsWith("local:")) {
      console.log("Verifying local list exists...");
      const localLists = config.get("localLists", []);
      console.log("localLists count:", localLists.length);
      const listExists = localLists.find(l => l.id === selectedListId);

      if (!listExists) {
        console.log("WARNING: cur_list_id points to non-existent local list!");
        console.log("Clearing cur_list_id and routing to CalDAV instead");
        selectedListId = null;  // Clear it so we route to CalDAV
        config.set("cur_list_id", null);
      } else {
        console.log("Local list exists, OK to proceed");
      }
    }

    // Check launch settings (only on initial launch)
    const isInitialLaunch = !this.params.returnToListPicker && !this.params.fromListPicker;
    console.log("isInitialLaunch:", isInitialLaunch);

    if (isInitialLaunch) {
      const launchMode = config.get("launchListMode", "last");
      console.log("launchMode:", launchMode);

      if (launchMode === "specific") {
        const launchListId = config.get("launchListId", "");
        console.log("launchListId:", launchListId);
        if (launchListId) selectedListId = launchListId;
      }
    }

    console.log("Final selectedListId:", selectedListId);

    // Route by ID prefix
    if (selectedListId && selectedListId.startsWith("local:")) {
      console.log("Routing to loadLocalList()");
      this.loadLocalList(selectedListId);
    } else {
      console.log("Routing to loadCalDAVList()");
      this.loadCalDAVList();
    }
    console.log("=== HOMESCREEN INIT END ===");
  }

  /**
   * Load local list from device storage
   */
  loadLocalList(listId) {
    console.log("=== LOAD LOCAL LIST START ===");
    console.log("listId:", listId);

    this.cachedMode = true;
    this.taskLists = [];  // CRITICAL: Don't populate with local lists
    console.log("Set cachedMode = true, taskLists = []");

    const localHandler = tasksProvider.getCachedHandler();
    console.log("Got localHandler");

    const listWrapper = localHandler.getTaskList(listId);
    console.log("listWrapper:", listWrapper ? "Found" : "NULL");

    if (!listWrapper) {
      // List not found - Need to fetch CalDAV lists before showing picker
      console.log("ERROR: Local list not found! Fetching CalDAV lists then opening picker...");
      const hideSpinner = createSpinner();

      tasksProvider.init().then(() => {
        return tasksProvider.getTaskLists();
      }).then((lists) => {
        hideSpinner();
        this.taskLists = lists;  // Now we have CalDAV lists
        this.cachedMode = false;  // Switch to CalDAV mode
        this.openTaskListPicker("browse");
      }).catch((e) => {
        hideSpinner();
        console.log("ERROR: Failed to fetch CalDAV lists:", e);
        hmUI.showToast({ text: t("List not found") });
      });
      return;
    }

    console.log("List found - ID:", listWrapper.id, "Title:", listWrapper.title);
    this.currentList = listWrapper;

    const withComplete = config.get("withComplete", false);
    const sortMode = config.get("sortMode", "none");
    console.log("withComplete:", withComplete, "sortMode:", sortMode);

    this.currentList.getTasks(withComplete).then((taskData) => {
      console.log("getTasks() returned");
      if (!taskData) {
        console.log("ERROR: taskData is null!");
        return;
      }

      console.log("taskData.tasks count:", taskData.tasks.length);
      this.taskData = taskData;
      this.taskData.tasks = this.sortTasks(this.taskData.tasks);
      console.log("After sort, tasks count:", this.taskData.tasks.length);
      console.log("Building UI...");
      this.build();
      console.log("=== LOAD LOCAL LIST END ===");
    }).catch((error) => {
      console.log("ERROR in getTasks():", error);
      hmUI.showToast({ text: t("Failed to load list") });
    });
  }

  /**
   * Load CalDAV list from server
   */
  loadCalDAVList() {
    this.cachedMode = false;
    this.hideSpinner = createSpinner();
    this.onlineInit();
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
      // Filter out null entries from lists array
      lists = (lists || []).filter(l => l !== null && l !== undefined);
      this.taskLists = lists;

      // Sync cached lists with server - add new lists, remove deleted ones
      if (!config.get("forever_offline")) {
        const cachedLists = config.get("cachedLists", []).filter(c => c !== null && c !== undefined);

        log("=== List Sync ===");
        log("Server lists:", lists.length);
        log("Cached lists:", cachedLists.length);

        // Build new cached lists array matching server
        const newCachedLists = lists.map((serverList) => {
          if (!serverList || !serverList.id) {
            return null;
          }
          // Find existing cached data for this list
          const cached = cachedLists.find(c => c && c.id === serverList.id);
          if (cached) {
            // Keep cached tasks, update title
            return { ...cached, title: serverList.title };
          } else {
            // New list - add with empty tasks
            return { id: serverList.id, title: serverList.title, tasks: [] };
          }
        }).filter(l => l !== null && l !== undefined);

        log("New cached lists:", newCachedLists.length);
        config.update({ cachedLists: newCachedLists });
        flushLog();
      }

      if(config.get("forever_offline")) {
        this.currentList = this.taskLists[0];
      } else {
        this.currentList = this.findCurrentList();
        if(!this.currentList) {
          this.openTaskListPicker("setup", true);
          return Promise.resolve(); // Return empty resolved promise to skip rest of chain
        }
      }

      // Get tasks from current list
      if (!this.currentList) {
        console.log("currentList is null, cannot getTasks");
        return null;
      }
      return this.currentList.getTasks(config.get("withComplete", false), this.params.page);
    }).then((taskData) => {
      if (!taskData) return;
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
  openTaskListPicker(mode, shouldReplace = false) {
    console.log("=== OPEN TASK LIST PICKER ===");
    console.log("mode:", mode);
    console.log("shouldReplace:", shouldReplace);
    console.log("this.cachedMode:", this.cachedMode);
    console.log("this.taskLists.length:", this.taskLists.length);

    const isOfflineMode = config.get("forever_offline", false);
    console.log("forever_offline:", isOfflineMode);

    // Helper to navigate to TaskListPickerScreen
    const navigateToListPicker = (lists) => {
      const paramObj = { lists, mode };
      config.set("_taskListPickerParams", paramObj);
      const params = {
        url: `page/amazfit/TaskListPickerScreen`,
        param: JSON.stringify(paramObj)
      };
      shouldReplace ? replace(params) : push(params);
    };

    // If in offline mode, skip CalDAV fetch - go directly to list picker
    if (isOfflineMode) {
      console.log("In offline mode, skipping CalDAV fetch");
      navigateToListPicker([]);
      return;
    }

    if (this.cachedMode && this.taskLists.length === 0) {
      // In local mode but not offline - try to fetch CalDAV lists
      console.log("In local mode, fetching CalDAV lists...");
      const hideSpinner = createSpinner();

      tasksProvider.init().then(() => {
        return tasksProvider.getTaskLists();
      }).then((lists) => {
        hideSpinner();
        navigateToListPicker(lists);
      }).catch((e) => {
        hideSpinner();
        console.log("CalDAV list fetch failed:", e.message);
        // Still navigate with empty CalDAV lists
        navigateToListPicker([]);
      });
    } else {
      // Already have CalDAV lists
      navigateToListPicker(this.taskLists);
    }
  }

  /**
   * Open new note creation UI
   */
  openNewNoteUI() {
    const paramObj = {
      list: this.currentList.id
    };

    // Save params to config as workaround for API 3.0 push() not passing params
    config.set("_newNoteParams", paramObj);
    console.log("openNewNoteUI: Saved params to config:", JSON.stringify(paramObj));

    push({
      url: `page/amazfit/NewNoteScreen`,
      param: JSON.stringify(paramObj)
    });
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

    // If no list is selected (fresh install), return first available list
    if (!selectedList && this.taskLists.length > 0) {
      return this.taskLists[0];
    }

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
      if (entry === null || entry === undefined) {
        continue;
      }
      // noinspection JSUnresolvedReference
      if (entry.id === selectedList) {
        return entry;
      }
    }

    return this.taskLists.length > 0 ? this.taskLists[0] : null;
  }

  /**
   * Refresh CalDAV list from server
   */
  refreshCalDAVList() {
    const hideSpinner = createSpinner();

    tasksProvider.init().then(() => {
      return this.currentList.getTasks(config.get("withComplete", false));
    }).then((taskData) => {
      if (!taskData) return;

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
      hideSpinner();
      hmUI.showToast({ text: t("Refreshed") });
      this.rebuild();
    }).catch((e) => {
      hideSpinner();
      hmUI.showToast({ text: e.message || t("Sync failed") });
    });
  }

  /**
   * Build main UI
   */
  build(offlineInfo="") {
    // Header
    this.twoActionBar([
      {
        text: this.currentList.title,
        color: this.cachedMode ? 0xFF9900 : 0xFFFFFF,
        icon: `icon_s/mode_${this.cachedMode ? "local" : "online"}.png`,
        callback: () => this.openTaskListPicker(this.cachedMode ? "browse": "online")
      },
      {
        text: t("New…"),
        icon: "icon_s/new.png",
        callback: () => this.openNewNoteUI()
      }
    ])

    // Tasks
    this.headline(t(this.cachedMode ? "Offline tasks:" : "Tasks:"));
    this.taskData.tasks.map((data) => {
      this.taskCard(data);
    });

    if(this.taskData.tasks.length === 0) {
      this.text({
        text: t("There's no incomplete tasks in that list")
      })
    }

    this.taskData.nextPageToken ? this.moreButton() : this.offset();

    // Pull-to-refresh for CalDAV lists only
    if (!this.cachedMode && config.get("pullToRefresh", false)) {
      this.lastSwipeTime = 0;
      AppGesture.init();
      AppGesture.on("down", () => {
        const now = Date.now();
        if (now - this.lastSwipeTime < 1000) {
          // Double swipe detected - refresh CalDAV list
          this.refreshCalDAVList();
        } else {
          // First swipe - show hint
          hmUI.showToast({ text: t("Swipe again to sync") });
          this.lastSwipeTime = now;
        }
        return true;
      });
    }
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
          const paramObj = {
            list_id: this.currentList.id,
            task_id: data.id
          };
          // Store params in config as workaround for API 3.0 push() not passing params
          config.set("_editTaskParams", paramObj);
          push({
            url: `page/amazfit/TaskEditScreen`,
            param: JSON.stringify(paramObj)
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

            // Cancel app-based reminder alarms when task is marked completed
            if (completed && data.uid) {
              console.log("Task marked completed - cancelling app-based reminder alarms:", data.uid);
              cancelTaskAlarms(data.uid);
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
      const rowHeight = row.config.height;
      // Center ring around icon: icon is at (ICON_SIZE_SMALL/2, (rowHeight-ICON_SIZE_SMALL)/2)
      // Ring should be 2px larger on each side, so offset by -2
      const ringX = Math.floor(ICON_SIZE_SMALL / 2) - 2;
      const ringY = Math.floor((rowHeight - ringSize) / 2);

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
      const rowHeight = row.config.height;
      const iconX = WIDGET_WIDTH - iconSize - 8;  // Right side of row
      const iconY = Math.floor((rowHeight - iconSize) / 2);

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
      const rowHeight = row.config.height;
      // Position to the left of notes icon (if present) or right side
      const hasNotes = data.description && data.description.trim().length > 0;
      const tagX = WIDGET_WIDTH - tagWidth - (hasNotes ? ICON_SIZE_SMALL + 16 : 8);
      const tagY = Math.floor((rowHeight - tagHeight) / 2);

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
   * @param {Object} subtask - The subtask object
   * @param {number} indentLevel - Nesting level (1 for direct subtasks, 2+ for nested)
   */
  subtaskRow(subtask, indentLevel = 1) {
    let {completed, inProgress} = subtask;
    const supportsStatus = typeof subtask.setStatus === 'function';

    // Get checkbox icon based on status
    const getCheckboxIcon = () => {
      if (completed) return 'icon_s/cb_true.png';
      if (inProgress) return 'icon_s/cb_inprogress.png';
      return 'icon_s/cb_false.png';
    };

    // Build display title with optional reminder countdown
    let displayTitle = subtask.title;
    if (config.get("showCountdown", false) && typeof subtask.getReminderCountdown === 'function') {
      const countdown = subtask.getReminderCountdown();
      if (countdown) {
        displayTitle += ` (${countdown})`;
      }
    }

    // Double-tap detection
    let lastTapTime = 0;
    const DOUBLE_TAP_THRESHOLD = 400; // ms

    // Indentation for subtask - increase with nesting level
    const indent = ICON_SIZE_SMALL * indentLevel;
    // Text indent with spaces (proportional to nesting level)
    const textIndent = "      ".repeat(indentLevel);

    const row = this.row({
      text: textIndent + displayTitle,
      icon: getCheckboxIcon(),
      iconOffset: indent,  // Offset icon position for subtask indentation
      card: {
        hiddenButton: t("Edit"),
        hiddenButtonCallback: () => {
          const paramObj = {
            list_id: subtask.list ? subtask.list.id : this.currentList.id,
            task_id: subtask.id
          };
          // Store params in config as workaround for API 3.0 push() not passing params
          config.set("_editTaskParams", paramObj);
          push({
            url: `page/amazfit/TaskEditScreen`,
            param: JSON.stringify(paramObj)
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

          // Cancel app-based reminder alarms when subtask is marked completed
          if (completed && subtask.uid) {
            console.log("Subtask marked completed - cancelling app-based reminder alarms:", subtask.uid);
            cancelTaskAlarms(subtask.uid);
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
      const rowHeight = row.config.height;
      const ringX = Math.floor(ICON_SIZE_SMALL / 2) + indent - 2;
      const ringY = Math.floor((rowHeight - ringSize) / 2);

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

    // Add category tag badge if enabled and subtask has categories
    if (config.get("showCategories", false) && subtask.categories && subtask.categories.length > 0) {
      const tagText = "#" + subtask.categories[0];
      const tagPadding = 10;
      const tagFontSize = 22;
      const tagCharWidth = 11;  // Approximate character width
      const tagWidth = tagText.length * tagCharWidth + tagPadding * 2;
      const tagHeight = 28;
      const rowHeight = row.config.height;
      // Position to the left of notes icon (if present) or right side
      const hasNotes = subtask.description && subtask.description.trim().length > 0;
      const tagX = WIDGET_WIDTH - tagWidth - (hasNotes ? ICON_SIZE_SMALL + 16 : 8);
      const tagY = Math.floor((rowHeight - tagHeight) / 2);

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

    // Add notes indicator icon on right side if subtask has description
    if (subtask.description && subtask.description.trim().length > 0) {
      const iconSize = ICON_SIZE_SMALL;
      const rowHeight = row.config.height;
      const iconX = WIDGET_WIDTH - iconSize - 8;  // Right side of row
      const iconY = Math.floor((rowHeight - iconSize) / 2);

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

    // Display nested subtasks recursively with increased indentation
    if (subtask.subtasks && subtask.subtasks.length > 0) {
      subtask.subtasks.forEach((nestedSubtask) => {
        this.subtaskRow(nestedSubtask, indentLevel + 1);
      });
    }
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

        const validLists = lists.filter(l => l && l.id);
        this.currentList = validLists.find(l => l.id === selectedListId) || validLists[0];

        if (!this.currentList) {
          console.log("currentList is null in loadCachedTasks");
          this.showOfflineOptions(message);
          return null;
        }

        return this.currentList.getTasks(config.get("withComplete", false));
      }).then((taskData) => {
        if (!taskData) {
          console.log("No taskData returned");
          return;
        }

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
      if (!this.currentList) {
        console.log("Legacy currentList is null");
        this.showOfflineOptions(message);
        return;
      }
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
    console.log("=== PAGE.ONINIT CALLED ===");
    console.log("params:", JSON.stringify(params));

    setStatusBarVisible(true);
    updateStatusBarTitle(t("Tasks"));

    setWakeUpRelaunch({ relaunch: true });
    setPageBrightTime({ brightTime: 15000 });

    console.log("About to create HomeScreen instance...");
    try {
      const homeScreen = new HomeScreen(params);
      console.log("HomeScreen instance created successfully");
      console.log("About to call init()...");
      homeScreen.init();
      console.log("init() completed successfully");
    } catch(e) {
      console.log("!!! EXCEPTION IN PAGE.ONINIT !!!");
      console.log("Error:", e);
      console.log("Error message:", e ? e.message : "null");
      console.log("Error stack:", e ? e.stack : "null");
      console.log("Error toString:", e ? e.toString() : "null");
    }
  },

  onDestroy() {
    setWakeUpRelaunch({ relaunch: false });
  }
})
