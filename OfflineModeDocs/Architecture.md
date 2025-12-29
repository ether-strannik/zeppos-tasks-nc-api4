# Local Lists Architecture

## Overview

The offline mode removal replaced a broken sync system with a simple dual-storage model:
- **Local Lists**: Pure device storage, no sync
- **CalDAV Lists**: Real-time server API calls

## Architectural Change

### Before: Broken Offline Sync Model
```
[CalDAV Server] ←→ [Watch Cache] + [Sync Log]
                         ↓
                    execCachedLog() tries to replay changes
                    (frequently failed/lost data)
```

### After: Simple Local vs Remote Model
```
[CalDAV Server] ←→ [Watch: CalDAV Lists]
                         (real-time API calls)

[Watch: Local Lists] (config.localLists)
                         (no sync, purely local)
```

## Key Components

### 1. Storage Model

```javascript
config.localLists = [
  {
    id: "local:0",           // ID format: "local:N"
    title: "Shopping List",
    tasks: [
      {
        id: "cached:123",    // ID format: "cached:N"
        title: "Buy milk",
        completed: false,
        important: false,
        checklistItems: [],
        subtasks: [],
        priority: 0,
        status: "NEEDS-ACTION",
        // ... other CalDAV-compatible fields
      }
    ]
  }
]
```

### 2. ID Conventions

- **List IDs**: `"local:N"` where N is from `next_local_list_id` counter
- **Task IDs**: `"cached:N"` where N is from `next_id` counter
- **ID prefixes determine routing**: Everything starts with `"local:"` check

### 3. Handler Routing

TasksProvider routes by ID prefix:

```javascript
getTaskList(id) {
  if(id.startsWith("local:")) return this.getLocalHandler().getTaskList(id);
  return this._handler.getTaskList(id);  // CalDAV
}
```

### 4. Dual Source UI

TaskListPickerScreen reads from two sources:

- **CalDAV lists**: Passed as `params.lists` from HomeScreen
- **Local lists**: Read directly from `config.get("localLists")`

Renders separate sections with CalDAV lists first.

## Critical Architectural Principles

1. **No sync queue**: Local lists never sync to server
2. **ID-based routing**: List ID prefix determines handler
3. **Config as source of truth**: All local data in `config.localLists`
4. **Promise compatibility**: Local operations return `Promise.resolve()` to match CalDAV async interface
5. **Fresh reads**: Always read from config at operation time, never trust cached values

## HomeScreen Mode Detection

```javascript
init() {
  let selectedListId = config.get("cur_list_id");

  // Check launch settings (only on initial launch)
  const isInitialLaunch = !this.params.returnToListPicker && !this.params.fromListPicker;
  if (isInitialLaunch) {
    const launchMode = config.get("launchListMode", "last");
    if (launchMode === "specific") {
      selectedListId = config.get("launchListId", "");
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

### Local Mode (this.cachedMode = true)

- Load from `config.localLists`
- Set `this.taskLists = []` (don't populate with local lists)
- No network calls, no spinner

### CalDAV Mode (this.cachedMode = false)

- Show spinner
- Call `tasksProvider.init()` then `getTaskLists()`
- Populate `this.taskLists` with CalDAV lists
- Find current list or show picker

## Files Changed in Original Implementation

**Deleted:**
- `src/cached/LogExecutor.js` (298 lines - entire sync system)

**Renamed:**
- `src/cached/CachedHandler.js` → `src/cached/LocalHandler.js`

**Modified:**
- `page/amazfit/HomeScreen.js` - Refactored init() to route by list type
- `page/amazfit/SettingsScreen.js` - Removed "Work offline" toggle
- `src/TasksProvider.js` - Added routing logic, removed execCachedLog()

**Net result:** 574 lines deleted, 103 lines added
