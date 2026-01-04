# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- AIO orchestrator command handler for voice-controlled task creation
- Task creation with due date, due time, priority, and reminder via voice commands
- Calendar event creation via voice commands (createEvent action)
- insertTask now accepts options object (dueDate, dueTime, priority, reminder)

### Fixed
- Calendar event creation now converts date/time/duration to proper DTSTART/DTEND format
- All-day events use DATE format (no time component)

---

## [1.0.1] - 2025-01-01

### Added
- **Voice transcription button**: Quick task creation via voice input
  - Microphone button in header bar (between list title and new task button)
  - Opens system keyboard in voice mode for speech-to-text
  - Creates task automatically from transcribed text
  - List refreshes to show new task immediately
- **Clear Completed button**: Batch delete all completed tasks
  - Appears at bottom of task list when completed tasks exist
  - Shows count of completed tasks to be cleared
  - Deletes from both CalDAV server and local lists

### Changed
- **App ID**: Updated to new registered app ID for Zepp store submission

## [1.0.0] - 2024-12-30

### Added

#### Nextcloud CalDAV Integration
- **CalDAV Proxy Architecture**: Vercel-hosted proxy to workaround Zepp OS HTTP method limitations (only GET/POST supported, CalDAV requires PROPFIND/REPORT/PUT/DELETE)
  - **Shared proxy server**: One Vercel deployment works for all users
  - **X-Target-Host header**: User's Nextcloud URL passed dynamically
  - **Configurable proxy URL**: Advanced users can host their own proxy
- **Multi-status support**:
  - COMPLETED - single tap
  - IN-PROCESS - double tap (yellow progress icon)
  - NEEDS-ACTION - single tap on completed task
- **Priority levels** with colored rings around checkbox:
  - High (1-4): Red ring
  - Medium (5): Yellow ring
  - Low (6-9): Blue ring
  - None (0): White/default
- **Subtasks hierarchy**: RELATED-TO/UID support with indented display
- **Due date countdown**: Optional "8.5h" / "2d" badge display
- **Task descriptions**: DESCRIPTION property support with pencil icon indicator
- **GPS location**: GEO/LOCATION properties with automatic DMS to decimal conversion

#### Enhanced Edit Screen
- Edit task title
- Edit task description/notes
- Edit task priority (0-9) with grid-based picker
- Edit categories/tags
- **Edit start date** with visual calendar and numeric keypad time picker
- **Edit due date** with visual calendar and numeric keypad time picker
- **Date validation**: Prevents setting start date after due date (and vice versa)
- **VALARM reminders**: Tasks.org compatible reminder system
  - "Remind me in" - set DUE date to NOW + duration with alarm at due time
  - "Before due" presets - 5min, 10min, 15min, 30min, 1h, 2h, 1d before
  - Uses TRIGGER;RELATED=END for DUE-relative alarms (Tasks.org compatible)
- Add subtasks (creates RELATED-TO link)
- Add current GPS location
- Clear location
- **Stay on edit screen**: Saving any field keeps you on edit screen (allows multiple edits)
- **Keyboard cancel**: Swipe back to close keyboard discards unsaved changes

#### Date/Time Picker Components
- **CalendarPicker**: Visual calendar grid with month navigation, today highlight, weekend colors
- **TimePicker**: Numeric keypad style time input (like Android time picker)
- **DateTimePicker**: Combined date→time selection flow

#### UI Features
- **Reminder countdown**: Optional "8.5h" / "2d" badge for due dates
- **Alphabetical sorting**: Optional A-Z sort in Settings
- **Pull to refresh**: Double swipe down to sync
- **Subtasks display**: Indented rows with toggleable completion

#### Categories Support
- **CATEGORIES property**: Tag tasks with multiple categories (e.g., Work, Personal, Urgent)
- **Category picker**: Multi-select screen with checkboxes in task edit
- **Add/Delete categories**: Create new categories or batch-delete selected ones
- **HomeScreen display**: Optional [#tag] badge showing first category
- **Settings toggle**: Show/hide category tags on task list

#### Add to Calendar
- **Create calendar events from tasks**: Add task as VEVENT to any calendar
- **Pre-filled data**: Title, start/end dates, description from task
- **GPS location capture**: Capture current location for event
- **Calendar picker**: Select target calendar (cycles through available calendars)
- **DateTimePicker**: Visual date and time selection for event times

#### Settings Toggles
- Show reminder countdown
- Show categories
- Sort alphabetically
- Pull down to refresh
- Show completed tasks
- **On launch open**: Choose "Last viewed list" or a specific list to open on app start

#### UX Improvements
- **Double-tap to delete**: Task deletion requires confirmation (tap twice)
- **Cached list sync**: Task lists now sync with server on refresh (adds new lists, removes deleted)
- **Separate Task List picker**: Task lists moved to dedicated screen with Settings button at bottom
- **Pull to refresh on Task List picker**: Double swipe down syncs all lists and tasks

#### App-Based Reminder System
- **ZeppOS Alarm API integration**: Task reminders trigger even when app is closed
- **TaskReminderPopup**: Full-screen alarm popup with task title, description, due date
- **Alert options**: Configurable vibration (continuous/notification) and sound
- **Action buttons**:
  - **Complete Task**: Marks task done, cancels all alarms, exits app
  - **Snooze**: Opens TimePicker for custom duration, creates new alarm, exits app
  - **Dismiss**: Stops alerts and exits app
- **Snooze TimePicker**: On-the-spot duration selection (HH:MM format)
- **Default snooze duration**: Configurable in App-Based Reminder Settings
- **Per-task settings**: Enable/disable app reminders, vibration type, sound for each task
- **App-Based Reminder Settings screen**: Configure reminder behavior per task
- **VALARM parsing**: Extracts reminder times from CalDAV tasks (TRIGGER;RELATED=END)
- **Screen keep-alive**: Display stays on during alarm (10 minutes)

#### Local Lists
- **Local task lists**: Create and manage multiple lists stored entirely on device
- **Concurrent operation**: Use local lists alongside CalDAV lists simultaneously
- **Full task features**: Title, notes, priority, location, categories, completion tracking
- **Subtasks support**: Recursive subtask hierarchy for local tasks (unlimited depth)
- **Categories support**: Tag local tasks with categories, displayed as badges
- **Local Lists Management Screen**: Multi-select deletion of local lists
- **Smart navigation**: Seamless switching between local and CalDAV lists
- Local lists survive app restarts and are independent of CalDAV sync

#### Native Keyboard Integration
- **SYSTEM_KEYBOARD**: Native ZeppOS keyboard (API 4.2) for all text input
- Better user experience with system-native input
- Used for: task titles, notes, categories, subtasks, list names

#### Subtask Improvements
- **Recursive rendering**: Unlimited nesting depth for subtasks (CalDAV and local)
- **Full editing support**: Edit nested subtasks at any depth
- **Category badges**: Display category tags on subtasks
- **Reminder countdown**: Show due date countdown on subtasks

### Changed

#### API Migration
- **Upgraded to ZeppOS API 4.2** (from API 1.0)
- Complete rewrite of all screens, sensors, and UI components
- Modern import system (@zos/ui, @zos/router, @zos/sensor)
- Better stability and compatibility with latest devices

### Fixed
- **VALARM parser**: Handle both array and object alarm formats from CalDAV
- **Multiple alarm triggers**: Added guards to prevent button multi-tap issues on ZeppOS
- **Popup exit behavior**: App exits cleanly after alarm actions (no HomeScreen network sync)
- **TaskReminderPopup crashes**: Fixed vibration/sound initialization errors
- CalDAV iCalendar property parameter handling in parser
- UTC timezone handling (Z suffix) on all timestamp fields
- Parameter passing issues with push() navigation (config-based workaround)
- Crash loop prevention for corrupted list state
- **Login save button**: Fixed "Save configuration" not working after credential validation
- **iCalendar newline escaping**: Fixed 415 error when saving tasks with multi-line descriptions
- **Stale cached lists**: Fixed old task lists persisting after deletion on server

### Changed
- Revised task row display with notes indicator icon
- **Settings order**: Task lists now first, About moved to bottom

### Removed
- **Microsoft To Do support**: Removed MicrosoftHandler, MicrosoftAuth, and related UI
- **Google Tasks support**: Removed GoogleHandler, GoogleAuth, and related UI
- **TickTick support**: Removed TickTickHandler, TickTickAuth, and related UI
- **Translation support**: Removed all 20 language translations (app is now English-only)
- **Donate functionality**: Removed donate button from About screen
- **Server config info box**: Removed outdated wiki link from login (no longer needed with multi-user proxy)
- App now exclusively supports Nextcloud/CalDAV
- **ScreenBoard keyboard**: Completely replaced by SYSTEM_KEYBOARD
- Keyboard configuration screens (no longer needed)

### Rebranding
- Renamed app to "Tasks NC"
- Version reset to 1.0
- Developer changed to ether-strannik
- Added "Fork of ZeppTasks by melianmiko" credit

---

## [2.4] - Original Release
Last version by melianmiko before fork.

---

## Architecture Notes

### CalDAV Proxy Flow
```
Watch ←BLE→ Phone ←HTTPS→ Vercel Proxy ←CalDAV→ Nextcloud
                   POST +                PROPFIND
                   X-HTTP-Method-Override REPORT
                                         PUT
                                         DELETE
```

### VTODO Properties Supported
| Property    | Status | Notes |
|-------------|--------|-------|
| SUMMARY     | ✅ | Task title |
| STATUS      | ✅ | NEEDS-ACTION, IN-PROCESS, COMPLETED |
| PRIORITY    | ✅ | 0-9 with color coding |
| DTSTART     | ✅ | Start date/time |
| DUE         | ✅ | Countdown display |
| DESCRIPTION | ✅ | Notes with icon indicator |
| RELATED-TO  | ✅ | Subtasks hierarchy |
| GEO         | ✅ | GPS coordinates |
| LOCATION    | ✅ | Location text |
| CATEGORIES  | ✅ | Multi-select tags with [#tag] display |
| VALARM      | ✅ | Phone notifications + App-based reminders (ZeppOS Alarm API) |
| RRULE       | ❌ | Not implemented |