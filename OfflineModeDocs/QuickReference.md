# Quick Reference Guide

## ID Conventions

- Local list IDs: `"local:N"` (e.g., `"local:0"`, `"local:1"`)
- Task IDs: `"cached:N"` (e.g., `"cached:123"`)
- Counter config keys: `next_local_list_id`, `next_id`

## Routing Logic

```javascript
// In TasksProvider.getTaskList()
if (id.startsWith("local:")) return this.getLocalHandler().getTaskList(id);
return this._handler.getTaskList(id);  // CalDAV
```

## Config Storage

```javascript
config.localLists = [
  {
    id: "local:0",
    title: "Shopping List",
    tasks: [
      {
        id: "cached:123",
        title: "Buy milk",
        completed: false,
        subtasks: [],      // Always initialize
        checklistItems: []  // Always initialize
      }
    ]
  }
]
```

## Critical Patterns

### 1. Config Update (use in all setters)

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

setTitle(value) {
  this._updateTask({ title: value });
  this.title = value;
  return Promise.resolve();  // API compatibility
}
```

### 2. HomeScreen Mode Detection

```javascript
init() {
  let selectedListId = config.get("cur_list_id");

  // Launch settings (initial launch only)
  if (isInitialLaunch && launchMode === "specific") {
    selectedListId = config.get("launchListId", "");
  }

  // Route by ID
  if (selectedListId && selectedListId.startsWith("local:")) {
    this.loadLocalList(selectedListId);
  } else {
    this.loadCalDAVList();
  }
}
```

### 3. Local List Loading

```javascript
loadLocalList(listId) {
  this.cachedMode = true;
  this.taskLists = [];  // CRITICAL: Don't populate

  const listWrapper = localHandler.getTaskList(listId);
  // Load tasks...
}
```

### 4. Fetch CalDAV from Local Mode

```javascript
openTaskListPicker(mode, replace) {
  if (this.cachedMode && this.taskLists.length === 0) {
    // Fetch CalDAV lists first
    tasksProvider.init().then(() => {
      return tasksProvider.getTaskLists();
    }).then((lists) => {
      push({
        url: "page/amazfit/TaskListPickerScreen",
        param: JSON.stringify({ mode, lists, replace })
      });
    });
  } else {
    // Already have CalDAV lists
    push({
      url: "page/amazfit/TaskListPickerScreen",
      param: JSON.stringify({ mode, lists: this.taskLists, replace })
    });
  }
}
```

### 5. Dual-Source List Picker

```javascript
constructor(params) {
  this.caldavLists = params.lists || [];       // From params
  this.localLists = config.get("localLists", []);  // From config
}

build() {
  // CalDAV section first
  if (this.caldavLists.length > 0) {
    this.headline("CalDAV lists:");
    this.caldavLists.forEach(/* render */);
  }

  // Local section second
  if (this.localLists.length > 0) {
    this.headline("Local lists:");
    this.localLists.forEach(/* render */);
  }
}
```

### 6. Local List Creation

```javascript
// From TaskListPickerScreen
this.row({
  text: t("Create local list"),
  callback: () => push({
    url: "page/amazfit/NewNoteScreen",
    param: JSON.stringify({ mode: "create_local_list" })
  })
});

// In NewNoteScreen.doCreateTask()
if (this.params.mode === "create_local_list") {
  const nextId = config.get("next_local_list_id", 0);
  const newListId = `local:${nextId}`;

  localLists.push({
    id: newListId,
    title: name.trim(),
    tasks: []
  });

  config.update({
    localLists: localLists,
    next_local_list_id: nextId + 1,
    cur_list_id: newListId  // Auto-select!
  });

  back();
}
```

### 7. Recursive Subtask Search

```javascript
insertSubtask(title, parentUid) {
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

  findAndAddSubtask(tasks);
}
```

### 8. iCalendar Parameter Stripping

```javascript
ics2js(ics) {
  let key = line.substring(0, line.indexOf(":"));

  // Strip parameters like "COMPLETED;VALUE=DATE-TIME"
  const semicolonIndex = key.indexOf(";");
  if (semicolonIndex > -1) {
    key = key.substring(0, semicolonIndex);
  }

  result[key] = value;
}
```

## Common Mistakes to Avoid

1. **DON'T** populate `this.taskLists` in local mode → causes duplication
2. **DON'T** forget to fetch CalDAV lists when opening picker from local mode
3. **DON'T** forget to auto-select new list (`cur_list_id`) after creation
4. **DON'T** forget Promise.resolve() in local operations
5. **DON'T** trust instance properties - always read fresh from config
6. **DON'T** forget to initialize arrays (`subtasks: []`, `checklistItems: []`)
7. **DON'T** forget to strip iCalendar parameters when parsing

## Files Modified in Original Implementation

**Deleted:**
- `src/cached/LogExecutor.js` (298 lines)

**Renamed:**
- `src/cached/CachedHandler.js` → `src/cached/LocalHandler.js`

**Modified:**
- `page/amazfit/HomeScreen.js` - Refactored init(), added loadLocalList()
- `page/amazfit/SettingsScreen.js` - Removed "Work offline" toggle
- `page/amazfit/TaskListPickerScreen.js` - Dual-source lists
- `page/amazfit/NewNoteScreen.js` - Added list creation mode
- `src/TasksProvider.js` - Added routing, removed sync code

**Net result:** -574 lines, +103 lines = -471 lines total

## Testing Checklist

- [ ] Create local list → auto-selected
- [ ] Create task in local list
- [ ] Switch local → CalDAV list
- [ ] Switch CalDAV → local list
- [ ] Open picker from local mode → shows CalDAV lists
- [ ] Open picker from CalDAV mode → shows local lists
- [ ] No duplication in picker UI
- [ ] CalDAV lists appear first
- [ ] Pull-to-refresh works for CalDAV
- [ ] Subtasks work in local lists
- [ ] Complete/delete tasks in local lists
- [ ] Categories work in local lists (if applicable)
