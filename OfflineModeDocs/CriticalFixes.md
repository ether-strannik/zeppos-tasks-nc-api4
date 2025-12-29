# Critical Fixes After Initial Implementation

These are the fixes that followed the offline mode removal. Each represents a lesson learned.

## Fix 1: Restore Pull-to-Refresh (de13346)

**Problem**: Pull-to-refresh was removed along with offline sync system

**Why it's needed**:
- Watch-to-phone communication is real-time via request()
- Phone-to-watch requires manual refresh
- CalDAV changes on server need manual sync

**Solution**: Restored AppGesture double-swipe pattern for CalDAV lists only

```javascript
if (!this.cachedMode && config.get("pullToRefresh", false)) {
  hmApp.registerGestureEvent((event) => {
    if (event === hmApp.gesture.DOWN) {
      const now = Date.now();
      if (now - this.lastSwipeTime < 1000) {
        // Double swipe detected
        this.refreshCalDAVList();
      }
      this.lastSwipeTime = now;
    }
  });
}
```

**Key insight**: Local lists don't need refresh (already on device), only CalDAV lists do.

---

## Fix 2: Add Local List Creation (1e50268)

**Problem**: Users couldn't create local lists, only CalDAV lists existed

**Solution**:
1. Add "Create local list" button to TaskListPickerScreen
2. Make NewNoteScreen dual-mode (task creation vs list creation)
3. Auto-generate ID using `next_local_list_id` counter
4. Auto-select new list by setting `cur_list_id`

```javascript
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
    cur_list_id: newListId  // Auto-select!
  });

  back();  // HomeScreen.init() loads new list
}
```

**Key insight**: Must auto-select new list or user sees empty screen.

---

## Fix 3: Fix List Duplication in Picker (57e35e1)

**Problem**: Local lists appeared in both sections of TaskListPickerScreen

**Root cause**: `this.taskLists` was being set to local lists in HomeScreen.loadLocalList()

**Solution**: When loading local lists, set `this.taskLists = []`

```javascript
loadLocalList(listId) {
  this.cachedMode = true;
  this.taskLists = [];  // CRITICAL: Don't populate with local lists

  const localHandler = tasksProvider.getCachedHandler();
  const listWrapper = localHandler.getTaskList(listId);
  // ...
}
```

**Key insight**: TaskListPickerScreen reads local lists directly from config, not from params.

---

## Fix 4: Fix Task Picker from Local Mode (5e321c4)

**Problem**: Opening TaskListPickerScreen from local mode showed no CalDAV lists

**Root cause**: `this.taskLists = []` when in local mode (from Fix 3)

**Solution**: Detect local mode and fetch CalDAV lists before opening picker

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
          lists: lists,  // Pass fetched CalDAV lists
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

**Key insight**: Local mode and CalDAV mode have different data availability.

---

## Fix 5: Fix Task Creation in Local Lists (eeecced)

**Problem**: Creating task in local list caused "init error" - `tasksProvider.getTaskList("local:0")` returned undefined

**Root cause**: TasksProvider.getTaskList() had no routing logic for local list IDs

**Solution**: Add routing in TasksProvider.getTaskList()

```javascript
getTaskList(id) {
  if(id === "cached") return this.getCachedTasksList();
  if(id.startsWith("local:")) return this.getCachedHandler().getTaskList(id);
  return this._handler.getTaskList(id);  // CalDAV
}
```

**Key insight**: Need explicit routing for ALL operations that accept list IDs.

---

## Fix 6: Reorder Task List Picker (19577b9)

**Problem**: UX - local lists were shown first, but CalDAV lists are more important

**Solution**: Show CalDAV lists first, then local lists

```javascript
build() {
  // CalDAV section first
  if (this.caldavLists.length > 0) {
    this.headline(t("CalDAV lists:"));
    this.caldavLists.forEach(/* render */);
  }

  // Local section second
  if (this.localLists.length > 0) {
    this.offset(16);
    this.headline(t("Local lists:"));
    this.localLists.forEach(/* render */);
  }
}
```

**Key insight**: Prioritize server-synced lists for better UX.

---

## Fix 7: Fix CalDAV Subtask Recognition (d8a756e)

**Problem**: Subtasks from Nextcloud not recognized on watch

**Root cause**: iCalendar parser stored `"RELATED-TO;RELTYPE=PARENT"` as property key instead of `"RELATED-TO"`

**Solution**: Strip parameters from property names in ics2js()

```javascript
ics2js(ics) {
  const lines = ics.split(/\r?\n/);
  const result = {};

  for (const line of lines) {
    if (line.indexOf(":") === -1) continue;

    let key = line.substring(0, line.indexOf(":"));

    // Strip parameters
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

**Also added**: insertSubtask() to LocalHandler for feature parity with CalDAV

**Key insight**: iCalendar properties can have parameters (e.g., `COMPLETED;VALUE=DATE-TIME`). Always strip them.

---

## Summary of Lessons

1. **Pull-to-refresh is essential** for CalDAV sync (phone-to-watch direction)

2. **Auto-select after creation** or user sees empty screen

3. **this.taskLists must be empty in local mode** to prevent duplication

4. **Fetch CalDAV lists when opening picker from local mode**

5. **Route ALL operations by list ID**, not just initial load

6. **Prioritize CalDAV lists in UI** for better UX

7. **Strip iCalendar parameters** when parsing properties

8. **Feature parity**: If CalDAV supports subtasks, local lists must too

## Testing Checklist for API4

After implementing local lists, verify:

- [ ] Can create local list
- [ ] New list is auto-selected
- [ ] Can create task in local list
- [ ] Can switch between local and CalDAV lists
- [ ] Opening picker from local mode shows CalDAV lists
- [ ] Opening picker from CalDAV mode shows local lists
- [ ] Local lists don't appear in CalDAV section (no duplication)
- [ ] CalDAV lists appear first in picker
- [ ] Pull-to-refresh works for CalDAV lists
- [ ] Pull-to-refresh doesn't interfere with local lists
- [ ] Subtasks work in local lists
- [ ] Categories work in local lists (if applicable)
- [ ] Completing tasks in local lists works
- [ ] Deleting tasks in local lists works
