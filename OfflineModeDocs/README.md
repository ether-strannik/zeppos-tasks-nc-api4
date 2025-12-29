# Offline Mode Removal Documentation

This directory contains comprehensive documentation about the offline mode removal and local lists implementation from the API 3.0 version (main ZeppOS-Tasks repository).

## Purpose

These documents serve as a reference guide for implementing the same local lists architecture in the API 4.2 version (api3-test directory).

## Document Overview

### 1. Architecture.md
**What it covers:**
- High-level architectural changes from broken offline sync to simple local/remote model
- Storage model and ID conventions
- Handler routing logic
- HomeScreen mode detection flow
- Files changed in original implementation

**When to read:** Start here to understand the overall design.

### 2. CodePatterns.md
**What it covers:**
- 10 key code patterns to replicate in API4
- Config update pattern (critical for local lists)
- ID-based routing pattern
- Dual-source list picker pattern
- Promise compatibility pattern
- Recursive subtask handling
- iCalendar parameter stripping

**When to read:** During implementation - copy these patterns exactly.

### 3. CriticalFixes.md
**What it covers:**
- 7 critical fixes that followed the initial implementation
- Lessons learned from each fix
- Testing checklist to prevent regressions

**When to read:** Before testing - understand what can go wrong.

### 4. Implementation.md
**What it covers:**
- Step-by-step implementation plan organized in 7 phases
- Exact code changes for each step
- Expected outcomes

**When to read:** Use as implementation roadmap - follow phase by phase.

### 5. QuickReference.md
**What it covers:**
- Quick lookup reference for common patterns
- ID conventions
- Critical patterns in condensed form
- Common mistakes to avoid
- Testing checklist

**When to read:** During implementation - quick lookups without reading full docs.

## Implementation Strategy

**Recommended approach:**

1. Read **Architecture.md** first to understand the design
2. Use **Implementation.md** as your roadmap (follow phases in order)
3. Reference **CodePatterns.md** when implementing each pattern
4. Keep **QuickReference.md** open for quick lookups
5. Use **CriticalFixes.md** before testing to avoid known issues

## Key Takeaways

The offline mode removal replaced 574 lines of broken sync code with a simple dual-storage model:

- **Local Lists**: Pure device storage (`config.localLists`), no sync, ID prefix `"local:"`
- **CalDAV Lists**: Real-time server API calls, ID from server

**Core principle:** Don't try to sync. Just have two separate, simple systems.

## Related Files in API4 Project

**Files that will be modified:**
- `src/cached/CachedHandler.js` → renamed to `LocalHandler.js`
- `src/TasksProvider.js` - add routing logic
- `page/amazfit/HomeScreen.js` - refactor init() and list loading
- `page/amazfit/TaskListPickerScreen.js` - dual-source lists
- `page/amazfit/NewNoteScreen.js` - add list creation mode
- `page/amazfit/SettingsScreen.js` - remove offline toggle

**Files that will be deleted:**
- `src/cached/LogExecutor.js` (if it exists in API4)

## Version History

- **2025-12-28**: Initial documentation created based on API 3.0 implementation
- **Source commits**: fa84115 through d8a756e in main ZeppOS-Tasks repository
