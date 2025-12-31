import {CachedTaskList} from "./CachedTaskList";

/**
 * Handler for local task lists (stored on device)
 */
export class LocalHandler {
    constructor(config) {
        this.config = config;
        this.cantListCompleted = false;
    }

    getTaskLists() {
        const localLists = this.config.get("localLists", []);
        return Promise.resolve(
            localLists.map(list => new LocalListWrapper(list, this.config))
        );
    }

    getTaskList(id) {
        const localLists = this.config.get("localLists", []);
        const listData = localLists.find(l => l.id === id);

        if (listData) {
            return new LocalListWrapper(listData, this.config);
        }

        return null;
    }
}

/**
 * Wrapper for a local task list
 */
class LocalListWrapper {
    constructor(data, config) {
        this.id = data.id;
        this.title = data.title;
        this._tasks = data.tasks || [];
        this.config = config;
    }

    getTasks(withComplete = false, page = null) {
        // Always read fresh data from config to pick up any changes
        const localLists = this.config.get("localLists", []);
        const listData = localLists.find(l => l.id === this.id);
        const taskList = listData ? listData.tasks : [];

        const tasks = taskList.map(taskData =>
            new LocalTask(taskData, this, this.config)
        );

        const filtered = withComplete
            ? tasks
            : tasks.filter(t => !t.completed);

        return Promise.resolve({
            tasks: filtered,
            nextPageToken: null
        });
    }

    getTask(id) {
        // Recursively search for task (handles both top-level tasks and subtasks)
        const findTask = (taskList) => {
            for (let task of taskList) {
                if (task.id === id || task.uid === id) {
                    return task;
                }
                if (task.subtasks && task.subtasks.length > 0) {
                    const found = findTask(task.subtasks);
                    if (found) return found;
                }
            }
            return null;
        };

        const taskData = findTask(this._tasks);
        if (taskData) {
            return new LocalTask(taskData, this, this.config);
        }
        return null;
    }

    insertTask(title) {
        const localLists = this.config.get("localLists", []);
        const nextId = this.config.get("next_id", 0);
        const newTaskId = `cached:${nextId}`;

        const newTask = {
            id: newTaskId,
            uid: newTaskId,  // Set uid so subtasks can reference this task
            title: title,
            completed: false,
            important: false,
            checklistItems: [],
            subtasks: [],
            priority: 0,
            status: "NEEDS-ACTION",
            categories: []
        };

        // Update local lists
        const listIndex = localLists.findIndex(l => l.id === this.id);
        if (listIndex >= 0) {
            localLists[listIndex].tasks.unshift(newTask);
        }

        this.config.update({
            localLists: localLists,
            next_id: nextId + 1
        });

        return Promise.resolve(new LocalTask(newTask, this, this.config));
    }

    insertSubtask(title, parentUid) {
        const localLists = this.config.get("localLists", []);
        const listIndex = localLists.findIndex(l => l.id === this.id);

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
            status: "NEEDS-ACTION",
            categories: []
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
}

/**
 * Wrapper for a local task
 */
class LocalTask {
    constructor(data, list, config) {
        this.id = data.id;
        this.title = data.title;
        this.description = data.description || "";
        this.completed = data.completed;
        this.important = data.important || false;
        this.checklistItems = data.checklistItems || [];
        this.uid = data.uid || null;
        this.parentId = data.parentId || null;
        this.priority = data.priority || 0;
        this.status = data.status || "NEEDS-ACTION";
        this.inProgress = data.inProgress || false;
        this.dueDate = data.dueDate ? new Date(data.dueDate) : null;
        this.location = data.location || "";
        this.geo = data.geo || null;
        this.categories = data.categories || [];
        this.subtasks = (data.subtasks || []).map(s => new LocalTask(s, list, config));
        this.list = list;
        this.config = config;
    }

    /**
     * Get time until due date (e.g., "3.5h", "2d", "-1d" for overdue)
     * Returns null if no due date
     */
    getReminderCountdown() {
        if (!this.dueDate) return null;

        const diff = this.dueDate.getTime() - Date.now();
        const hours = diff / (1000 * 60 * 60);

        if (Math.abs(hours) < 24) {
            const h = hours.toFixed(1);
            return `${h}h`;
        } else {
            const days = Math.round(hours / 24);
            return `${days}d`;
        }
    }

    /**
     * Get color for priority level (Nextcloud/tasks.org standard)
     * 0 = None (white), 1-4 = High (red), 5 = Medium (yellow), 6-9 = Low (blue)
     */
    getPriorityColor() {
        if (this.priority >= 1 && this.priority <= 4) return 0xFF5555; // High - Red
        if (this.priority === 5) return 0xFFDD00; // Medium - Yellow
        if (this.priority >= 6 && this.priority <= 9) return 0x5599FF; // Low - Blue
        return 0xFFFFFF; // None - White
    }

    _updateTask(updates) {
        const localLists = this.config.get("localLists", []);
        const listIndex = localLists.findIndex(l => l.id === this.list.id);
        if (listIndex >= 0) {
            // Recursively find and update task (handles both top-level tasks and subtasks)
            const findAndUpdate = (taskList) => {
                for (let task of taskList) {
                    if (task.id === this.id || task.uid === this.id) {
                        Object.assign(task, updates);
                        return true;
                    }
                    if (task.subtasks && findAndUpdate(task.subtasks)) {
                        return true;
                    }
                }
                return false;
            };

            if (findAndUpdate(localLists[listIndex].tasks)) {
                this.config.update({ localLists: localLists });
            }
        }
    }

    sync() {
        return Promise.resolve();
    }

    setCompleted(value) {
        return this.setStatus(value ? "COMPLETED" : "NEEDS-ACTION");
    }

    setStatus(newStatus) {
        this._updateTask({
            status: newStatus,
            completed: newStatus === "COMPLETED",
            inProgress: newStatus === "IN-PROCESS"
        });
        this.status = newStatus;
        this.completed = newStatus === "COMPLETED";
        this.inProgress = newStatus === "IN-PROCESS";

        return Promise.resolve();
    }

    cycleStatus() {
        const nextStatus = {
            "NEEDS-ACTION": "IN-PROCESS",
            "IN-PROCESS": "COMPLETED",
            "COMPLETED": "NEEDS-ACTION"
        };
        return this.setStatus(nextStatus[this.status] || "IN-PROCESS");
    }

    setTitle(value) {
        this._updateTask({ title: value });
        this.title = value;
        return Promise.resolve();
    }

    setDescription(value) {
        this._updateTask({ description: value });
        this.description = value;
        return Promise.resolve();
    }

    setImportant(value) {
        this._updateTask({ important: value });
        this.important = value;
        return Promise.resolve();
    }

    setPriority(value) {
        value = parseInt(value, 10) || 0;
        if (value < 0) value = 0;
        if (value > 9) value = 9;

        this._updateTask({ priority: value });
        this.priority = value;
        return Promise.resolve();
    }

    setCategories(categories) {
        // Ensure categories is an array
        if (!Array.isArray(categories)) {
            categories = [];
        }

        this._updateTask({ categories: categories });
        this.categories = categories;
        return Promise.resolve();
    }

    setLocation(lat, lon, locationText = "") {
        if (lat !== null && lon !== null) {
            this.geo = { lat, lon };
        } else {
            this.geo = null;
        }
        this.location = locationText || "";

        this._updateTask({ geo: this.geo, location: this.location });
        return Promise.resolve();
    }

    delete() {
        const localLists = this.config.get("localLists", []);
        const listIndex = localLists.findIndex(l => l.id === this.list.id);

        if (listIndex >= 0) {
            // Recursively delete task (handles both top-level tasks and subtasks)
            const findAndDelete = (taskList) => {
                for (let i = 0; i < taskList.length; i++) {
                    if (taskList[i].id === this.id || taskList[i].uid === this.id) {
                        taskList.splice(i, 1);
                        return true;
                    }
                    if (taskList[i].subtasks && findAndDelete(taskList[i].subtasks)) {
                        return true;
                    }
                }
                return false;
            };

            if (findAndDelete(localLists[listIndex].tasks)) {
                this.config.update({ localLists: localLists });
            }
        }

        return Promise.resolve();
    }

    setChecklistItemChecked(itemId, isChecked) {
        // Update local cache
        const item = this.checklistItems.find(i => i.id === itemId);
        if (item) {
            item.isChecked = isChecked;
            this._updateTask({ checklistItems: this.checklistItems });
        }

        return Promise.resolve();
    }
}
