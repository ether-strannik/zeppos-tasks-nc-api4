# Code Patterns for Local Lists Implementation

## Pattern 1: Config Update Pattern

**Critical**: Config is the source of truth. Every update must read-modify-write entire structure.

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

**Why this pattern?**
1. Config system requires entire structure write
2. Object.assign preserves other fields
3. Fresh read ensures consistency

**Use in all setters:**
```javascript
setTitle(value) {
  this._updateTask({ title: value });
  this.title = value;  // Update instance property for immediate access
  return Promise.resolve();  // API compatibility
}
```

## Pattern 2: ID-Based Routing

Route operations by list ID prefix in TasksProvider:

```javascript
getTaskList(id) {
  if(id === "cached") return this.getCachedTasksList();
  if(id.startsWith("local:")) return this.getCachedHandler().getTaskList(id);
  return this._handler.getTaskList(id);  // CalDAV
}
```

**Apply to all operations:**
- `getTaskList(id)` - Get list object
- `insertTask(listId, title)` - Create task
- `deleteTask(listId, taskId)` - Remove task

## Pattern 3: Dual-Source List Picker

TaskListPickerScreen reads from two independent sources:

```javascript
class TaskListPickerScreen extends ConfiguredListScreen {
  constructor(params) {
    super();

    // CalDAV lists from HomeScreen params
    this.caldavLists = params.lists || [];

    // Local lists from config
    this.localLists = config.get("localLists", []);
  }

  build() {
    // Render CalDAV section
    if (this.caldavLists.length > 0) {
      this.headline(t("CalDAV lists:"));
      this.caldavLists.forEach(list => {
        this.row({
          text: list.title,
          callback: () => this.selectList(list.id)
        });
      });
    }

    // Render Local section
    if (this.localLists.length > 0) {
      this.offset(16);
      this.headline(t("Local lists:"));
      this.localLists.forEach(list => {
        this.row({
          text: list.title,
          callback: () => this.selectList(list.id)
        });
      });
    }
  }
}
```

**Order**: CalDAV first, then local (prioritize server-synced lists)

## Pattern 4: Promise Compatibility

All local operations must return Promises to match CalDAV async interface:

```javascript
// CalDAV operations are async
async setTitle(value) {
  await this.api.updateTask(this.id, { title: value });
  this.title = value;
}

// Local operations must match interface
setTitle(value) {
  this._updateTask({ title: value });
  this.title = value;
  return Promise.resolve();  // Return Promise for API compatibility
}
```

**Apply to:**
- All setter methods (setTitle, setStatus, setCompleted, etc.)
- insertTask, insertSubtask, deleteTask
- Any operation that CalDAV version is async

## Pattern 5: Recursive Subtask Handling

Find parent task recursively through nested subtasks:

```javascript
insertSubtask(title, parentUid) {
  const tasks = list.tasks;

  const findAndAddSubtask = (taskList) => {
    for (let task of taskList) {
      // Check if this is the parent
      if (task.id === parentUid || task.uid === parentUid) {
        if (!task.subtasks) task.subtasks = [];
        task.subtasks.push(newSubtask);
        return true;
      }
      // Recursively search subtasks
      if (task.subtasks && findAndAddSubtask(task.subtasks)) {
        return true;
      }
    }
    return false;
  };

  findAndAddSubtask(tasks);
  this.config.update({ localLists: localLists });
}
```

**Key points:**
- Search both `task.id` and `task.uid` (compatibility)
- Initialize `subtasks: []` if undefined
- Recurse through nested subtasks
- Return true when found to stop search

## Pattern 6: HomeScreen Task List Separation

**CRITICAL**: Local mode must NOT populate `this.taskLists`:

```javascript
loadLocalList(listId) {
  this.cachedMode = true;
  this.taskLists = [];  // CRITICAL: Don't populate with local lists

  const localHandler = tasksProvider.getCachedHandler();
  const listWrapper = localHandler.getTaskList(listId);

  // Load tasks...
}

loadCalDAVList() {
  this.cachedMode = false;

  tasksProvider.getTaskLists().then((lists) => {
    this.taskLists = lists;  // Populate for CalDAV mode
    // Find and load current list...
  });
}
```

**Why?**
- TaskListPickerScreen reads local lists from `config.get("localLists")`
- `this.taskLists` is only for CalDAV lists passed as params
- Prevents duplication in picker UI

## Pattern 7: Fetch CalDAV Lists from Local Mode

When opening picker from local mode, fetch CalDAV lists first:

```javascript
openTaskListPicker(mode, replace = false) {
  if (this.cachedMode && this.taskLists.length === 0) {
    // In local mode - need to fetch CalDAV lists
    const hideSpinner = createSpinner();

    tasksProvider.init().then(() => {
      return tasksProvider.getTaskLists();
    }).then((lists) => {
      hideSpinner();

      push({
        url: "page/amazfit/TaskListPickerScreen",
        param: JSON.stringify({
          mode: mode,
          lists: lists,  // Pass CalDAV lists
          replace: replace
        })
      });
    }).catch((e) => {
      hideSpinner();
      hmUI.showToast({ text: e.message });
    });
  } else {
    // Already have CalDAV lists in this.taskLists
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

## Pattern 8: Local List Creation

NewNoteScreen dual mode - supports both task and list creation:

```javascript
// From TaskListPickerScreen
this.row({
  text: t("Create local list"),
  icon: "icon_s/add.png",
  callback: () => push({
    url: "page/amazfit/NewNoteScreen",
    param: JSON.stringify({ mode: "create_local_list" })
  })
});

// In NewNoteScreen.doCreateTask()
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
    cur_list_id: newListId  // Auto-select new list
  });

  back();  // Returns to HomeScreen which loads new list
}
```

**Key points:**
- Auto-increment `next_local_list_id` counter
- Auto-select by setting `cur_list_id`
- Initialize with empty `tasks: []`

## Pattern 9: iCalendar Parameter Stripping

When parsing CalDAV data, strip parameters from property names:

```javascript
ics2js(ics) {
  const lines = ics.split(/\r?\n/);
  const result = {};

  for (const line of lines) {
    if (line.indexOf(":") === -1) continue;

    let key = line.substring(0, line.indexOf(":"));

    // Strip parameters like "COMPLETED;VALUE=DATE-TIME"
    const semicolonIndex = key.indexOf(";");
    if (semicolonIndex > -1) {
      key = key.substring(0, semicolonIndex);
    }

    const value = line.substring(line.indexOf(":") + 1);
    result[key] = value;
  }

  return result;
}
```

**Why?** Properties like `COMPLETED;VALUE=DATE-TIME` must be stored as `"COMPLETED"`, not `"COMPLETED;VALUE=DATE-TIME"`.

## Pattern 10: Initialize Arrays

Always initialize arrays to prevent undefined errors:

```javascript
const newTask = {
  id: taskId,
  title: title,
  completed: false,
  checklistItems: [],   // Always initialize
  subtasks: [],         // Always initialize
  priority: 0,
  status: "NEEDS-ACTION"
};
```

**Critical for:**
- `checklistItems`
- `subtasks`
- `categories` (if supporting categories)
