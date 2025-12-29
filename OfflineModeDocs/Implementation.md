# Implementation Plan for API4 Project

## Phase 1: Core Infrastructure

### Step 1: Rename CachedHandler to LocalHandler

**Files:**
- `src/cached/CachedHandler.js` → `src/cached/LocalHandler.js`
- Update all imports that reference CachedHandler

**Changes in LocalHandler.js:**
- Rename class `CachedHandler` → `LocalHandler`
- Rename class `CachedListWrapper` → `LocalListWrapper`
- Rename class `CachedTask` → `LocalTask`

### Step 2: Update TasksProvider Routing

**File:** `src/TasksProvider.js`

Add routing logic to getTaskList():

```javascript
getTaskList(id) {
  if(id === "cached") return this.getCachedTasksList();
  if(id.startsWith("local:")) return this.getCachedHandler().getTaskList(id);
  return this._handler.getTaskList(id);
}
```

Update method names:
- `getCachedHandler()` - returns LocalHandler instance
- Rename `_cachedHandler` to `_localHandler` for clarity (optional)

### Step 3: Remove Offline Mode Toggle

**File:** `page/amazfit/SettingsScreen.js`

Remove the "Work offline" toggle:

```javascript
// DELETE THIS SECTION:
this.row({
  text: t("Work offline"),
  icon: `icon_s/cb_${config.get("offlineMode", false)}.png`,
  callback: () => {
    config.set("offlineMode", !config.get("offlineMode", false));
    back();
  }
});
```

### Step 4: Clean Up LocalHandler

**File:** `src/cached/LocalHandler.js`

Remove all log-related code:
- Delete all `log.push()` calls
- Remove log parameter from constructor
- Simplify to direct config updates

Ensure all operations use the Config Update Pattern:

```javascript
_updateTask(updates) {
  const localLists = this.config.get("localLists", []);
  const listIndex = localLists.findIndex(l => l.id === this.list.id);
  if (listIndex >= 0) {
    const taskIndex = localLists[listIndex].tasks.findIndex(t => t.id === this.id);
    if (taskIndex >= 0) {
      Object.assign(localLists[listIndex].tasks[taskIndex], updates);
      this.config.update({ localLists: localLists });
    }
  }
}
```

## Phase 2: HomeScreen Refactoring

### Step 5: Refactor HomeScreen.init()

**File:** `page/amazfit/HomeScreen.js`

Replace offline mode detection with list type routing:

**Before:**
```javascript
const offlineMode = config.get("offlineMode", false);
if (offlineMode && hasCachedLists && !forceOnline) {
  this.cachedMode = true;
  // Load from cache
} else {
  // Load online
}
```

**After:**
```javascript
init() {
  // Determine which list to load
  let selectedListId = config.get("cur_list_id");

  // Check launch settings (only on initial launch)
  const isInitialLaunch = !this.params.returnToListPicker && !this.params.fromListPicker;
  if (isInitialLaunch) {
    const launchMode = config.get("launchListMode", "last");
    if (launchMode === "specific") {
      const launchListId = config.get("launchListId", "");
      if (launchListId) selectedListId = launchListId;
    }
  }

  // Route by ID prefix
  if (selectedListId && selectedListId.startsWith("local:")) {
    this.loadLocalList(selectedListId);
  } else {
    this.loadCalDAVList();
  }
}
```

### Step 6: Implement loadLocalList()

**File:** `page/amazfit/HomeScreen.js`

```javascript
loadLocalList(listId) {
  this.cachedMode = true;
  this.taskLists = [];  // CRITICAL: Don't populate with local lists

  const localHandler = tasksProvider.getCachedHandler();
  const listWrapper = localHandler.getTaskList(listId);

  if (!listWrapper) {
    // List not found - show picker
    this.openTaskListPicker("browse");
    return;
  }

  this.currentList = listWrapper;

  const withComplete = config.get("withComplete", false);
  const sortMode = config.get("sortMode", "none");

  this.currentList.getTasks(withComplete).then((tasks) => {
    // Sort if needed
    if (sortMode === "alpha") {
      tasks.sort((a, b) => a.title.localeCompare(b.title));
    }

    this.tasks = tasks;
    this.render();
  });
}
```

### Step 7: Refactor loadCalDAVList()

Extract CalDAV loading to separate method (rename existing logic):

```javascript
loadCalDAVList() {
  this.cachedMode = false;
  this.hideSpinner = createSpinner();

  tasksProvider.init().then(() => {
    return tasksProvider.getTaskLists();
  }).then((lists) => {
    this.taskLists = lists;  // Populate for CalDAV mode

    const selectedListId = config.get("cur_list_id");
    const currentList = lists.find(l => l.id === selectedListId);

    if (!currentList) {
      // List not found - show picker
      this.hideSpinner();
      this.openTaskListPicker("browse");
      return;
    }

    this.currentList = currentList;
    return this.loadTasksFromCalDAV();
  }).catch((e) => {
    this.hideSpinner();
    hmUI.showToast({ text: e.message });
  });
}
```

### Step 8: Update openTaskListPicker()

**File:** `page/amazfit/HomeScreen.js`

Add CalDAV fetching when in local mode:

```javascript
openTaskListPicker(mode, replace = false) {
  if (this.cachedMode && this.taskLists.length === 0) {
    // In local mode - fetch CalDAV lists first
    const hideSpinner = createSpinner();

    tasksProvider.init().then(() => {
      return tasksProvider.getTaskLists();
    }).then((lists) => {
      hideSpinner();

      push({
        url: "page/amazfit/TaskListPickerScreen",
        param: JSON.stringify({
          mode: mode,
          lists: lists,
          replace: replace
        })
      });
    }).catch((e) => {
      hideSpinner();
      hmUI.showToast({ text: e.message });
    });
  } else {
    // Already have CalDAV lists
    push({
      url: "page/amazfit/TaskListPickerScreen",
      param: JSON.stringify({
        mode: mode,
        lists: this.taskLists,
        replace: replace
      })
    });
  }
}
```

## Phase 3: TaskListPickerScreen Updates

### Step 9: Implement Dual-Source List Picker

**File:** `page/amazfit/TaskListPickerScreen.js`

Update constructor:

```javascript
constructor(params) {
  super();

  try {
    params = params ? JSON.parse(params) : {};
  } catch(e) {
    params = {};
  }

  this.mode = params.mode || "browse";
  this.replace = params.replace || false;

  // CalDAV lists from params
  this.caldavLists = params.lists || [];

  // Local lists from config
  this.localLists = config.get("localLists", []);
}
```

Update build():

```javascript
build() {
  this.headline(t("Select list:"));

  // CalDAV section (show first)
  if (this.caldavLists.length > 0) {
    this.headline(t("CalDAV lists:"));
    this.caldavLists.forEach(list => {
      this.row({
        text: list.title,
        icon: "icon_s/list.png",
        callback: () => this.selectList(list.id)
      });
    });
  }

  // Local section (show second)
  if (this.localLists.length > 0) {
    this.offset(16);
    this.headline(t("Local lists:"));
    this.localLists.forEach(list => {
      this.row({
        text: list.title,
        icon: "icon_s/list.png",
        callback: () => this.selectList(list.id)
      });
    });
  }

  // Create local list button
  this.offset(16);
  this.row({
    text: t("Create local list"),
    icon: "icon_s/add.png",
    callback: () => this.createLocalList()
  });

  this.offset();
}
```

Add createLocalList():

```javascript
createLocalList() {
  push({
    url: "page/amazfit/NewNoteScreen",
    param: JSON.stringify({ mode: "create_local_list" })
  });
}
```

## Phase 4: Local List Creation

### Step 10: Update NewNoteScreen for Dual Mode

**File:** `page/amazfit/NewNoteScreen.js`

Update doCreateTask() to handle list creation:

```javascript
doCreateTask(name) {
  if (!name || !name.trim()) {
    hmUI.showToast({ text: t("Name cannot be empty") });
    return;
  }

  // Check if creating local list
  if (this.params.mode === "create_local_list") {
    const localLists = config.get("localLists", []);
    const nextId = config.get("next_local_list_id", 0);
    const newListId = `local:${nextId}`;

    const newList = {
      id: newListId,
      title: name.trim(),
      tasks: []
    };

    localLists.push(newList);

    config.update({
      localLists: localLists,
      next_local_list_id: nextId + 1,
      cur_list_id: newListId  // Auto-select
    });

    back();  // Returns to HomeScreen
    return;
  }

  // Regular task creation
  const listId = this.params.list;

  if (!listId) {
    hmUI.showToast({ text: t("No list selected") });
    return;
  }

  const hideSpinner = createSpinner();

  tasksProvider.getTaskList(listId).then((list) => {
    return list.insertTask(name.trim());
  }).then(() => {
    hideSpinner();
    back();
  }).catch((e) => {
    hideSpinner();
    hmUI.showToast({ text: e.message });
  });
}
```

## Phase 5: Pull-to-Refresh

### Step 11: Restore Pull-to-Refresh for CalDAV

**File:** `page/amazfit/HomeScreen.js`

Add to build() method (only for CalDAV mode):

```javascript
build() {
  // ... existing code ...

  // Pull-to-refresh for CalDAV lists only
  if (!this.cachedMode && config.get("pullToRefresh", false)) {
    this.lastSwipeTime = 0;

    hmApp.registerGestureEvent((event) => {
      if (event === hmApp.gesture.DOWN) {
        const now = Date.now();
        if (now - this.lastSwipeTime < 1000) {
          // Double swipe detected
          this.refreshCalDAVList();
        }
        this.lastSwipeTime = now;
      }
      return true;
    });
  }
}
```

Add refreshCalDAVList():

```javascript
refreshCalDAVList() {
  const hideSpinner = createSpinner();

  tasksProvider.init().then(() => {
    return this.loadTasksFromCalDAV();
  }).then(() => {
    hideSpinner();
    hmUI.showToast({ text: t("Refreshed") });
  }).catch((e) => {
    hideSpinner();
    hmUI.showToast({ text: e.message });
  });
}
```

## Phase 6: Testing and Validation

### Step 12: Test All Scenarios

Use the testing checklist from CriticalFixes.md:

- [ ] Can create local list
- [ ] New list is auto-selected
- [ ] Can create task in local list
- [ ] Can switch between local and CalDAV lists
- [ ] Opening picker from local mode shows CalDAV lists
- [ ] Opening picker from CalDAV mode shows local lists
- [ ] Local lists don't appear in CalDAV section
- [ ] CalDAV lists appear first in picker
- [ ] Pull-to-refresh works for CalDAV lists
- [ ] Subtasks work in local lists
- [ ] Completing tasks in local lists works
- [ ] Deleting tasks in local lists works

## Phase 7: Optional Enhancements

### Step 13: Add Subtask Support to Local Lists

If not already present, add to LocalHandler:

```javascript
insertSubtask(title, parentUid) {
  const localLists = this.config.get("localLists", []);
  const listIndex = localLists.findIndex(l => l.id === this.list.id);

  if (listIndex < 0) {
    return Promise.reject(new Error("List not found"));
  }

  const tasks = localLists[listIndex].tasks;
  const nextId = this.config.get("next_id", 0);
  const subtaskId = `cached:${nextId}`;

  const newSubtask = {
    id: subtaskId,
    uid: subtaskId,
    title: title,
    completed: false,
    checklistItems: [],
    subtasks: [],
    priority: 0,
    status: "NEEDS-ACTION"
  };

  // Find parent and add subtask recursively
  const findAndAddSubtask = (taskList) => {
    for (let task of taskList) {
      if (task.id === parentUid || task.uid === parentUid) {
        if (!task.subtasks) task.subtasks = [];
        task.subtasks.push(newSubtask);
        return true;
      }
      if (task.subtasks && findAndAddSubtask(task.subtasks)) {
        return true;
      }
    }
    return false;
  };

  if (!findAndAddSubtask(tasks)) {
    return Promise.reject(new Error("Parent task not found"));
  }

  this.config.update({
    localLists: localLists,
    next_id: nextId + 1
  });

  return Promise.resolve();
}
```

## Implementation Order Summary

1. **Phase 1**: Core infrastructure (rename, routing, cleanup)
2. **Phase 2**: HomeScreen refactoring (init, loadLocalList, loadCalDAVList)
3. **Phase 3**: TaskListPickerScreen dual-source
4. **Phase 4**: Local list creation in NewNoteScreen
5. **Phase 5**: Pull-to-refresh for CalDAV
6. **Phase 6**: Testing all scenarios
7. **Phase 7**: Optional enhancements (subtasks, etc.)

## Expected Outcome

- **Code reduction**: ~500 lines deleted (LogExecutor + sync code)
- **Code addition**: ~100 lines (routing, dual-source picker)
- **Net result**: Simpler, more reliable architecture
- **User benefit**: Offline lists that actually work (no sync failures)
