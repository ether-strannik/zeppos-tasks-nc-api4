import {deviceName} from "../lib/mmk/DeviceIdentifier";
import { OfflineHandler } from "./cached/OfflineHandler";
import {CachedTaskList} from "./cached/CachedTaskList";
import {LocalHandler} from "./cached/LocalHandler";
import {CalDAVHandler} from "./caldav/CalDAVHandler";

export class TasksProvider {
    constructor(config, messageBuilder) {
        this.config = config;
        this.messageBuilder = messageBuilder;
        this._handler = false;
        this._cachedHandler = null;
    }

    get cantListCompleted() {
        return this._handler.cantListCompleted;
    }

    _createHandler(data) {
        switch(data.provider) {
            case "caldav":
                return new CalDAVHandler(this.messageBuilder);
        }
    }

    init(forceRefresh = false) {
        // Reuse existing handler unless forcing refresh
        if(this._handler && !forceRefresh) return Promise.resolve();

        if(this.config.get("forever_offline")) {
            this._handler = new OfflineHandler(this.config);
            return Promise.resolve();
        }

        return this.messageBuilder.request({
            package: "tasks_login",
            action: "get_data",
            deviceName,
        }, {}).then((data) => {
            if(data.error) throw new Error(data.error);
            console.log(JSON.stringify(data));
            this._handler = this._createHandler(data);
            return true;
        })
    }

    setupOffline() {
        this._handler = new OfflineHandler(this.config);
        this.config.update({
            forever_offline: true,
            tasks: [],
            log: [],
        });
    }

    /**
     * Create cache data for offline work (single list - legacy)
     * @param {any} listId ID of list used for cache
     * @param {TaskInterface[]} tasks Exiting tasks
     */
    createCacheData(listId, tasks) {
        if(this.config.get("forever_offline", false))
            throw new Error("Cache data will override offline data.");

        // Helper to cache a task (including subtasks recursively)
        const cacheTask = (task) => ({
            id: task.id,
            title: task.title,
            description: task.description || "",
            completed: task.completed,
            important: task.important || false,
            checklistItems: task.checklistItems || [],
            uid: task.uid || null,
            parentId: task.parentId || null,
            priority: task.priority || 0,
            status: task.status || "NEEDS-ACTION",
            inProgress: task.inProgress || false,
            dueDate: task.dueDate ? task.dueDate.getTime() : null,
            location: task.location || "",
            geo: task.geo || null,
            subtasks: (task.subtasks || []).map(cacheTask)
        });

        const cacheData = tasks.map(cacheTask);

        this.config.update({
            tasks: cacheData,
            cacheListID: listId,
        });
    }

    /**
     * Cache all task lists with their tasks
     * @param {Array} lists Array of {id, title, tasks} objects
     */
    cacheAllLists(lists) {
        if(this.config.get("forever_offline", false))
            return; // Don't override offline data

        // Helper to cache a task (including subtasks recursively)
        const cacheTask = (task) => ({
            id: task.id,
            title: task.title,
            description: task.description || "",
            completed: task.completed,
            important: task.important || false,
            checklistItems: task.checklistItems || [],
            uid: task.uid || null,
            parentId: task.parentId || null,
            priority: task.priority || 0,
            status: task.status || "NEEDS-ACTION",
            inProgress: task.inProgress || false,
            dueDate: task.dueDate ? task.dueDate.getTime() : null,
            location: task.location || "",
            geo: task.geo || null,
            subtasks: (task.subtasks || []).map(cacheTask)
        });

        const cachedLists = lists.map(list => ({
            id: list.id,
            title: list.title,
            tasks: (list.tasks || []).map(cacheTask)
        }));

        this.config.update({
            cachedLists: cachedLists,
        });
    }

    /**
     * Get local handler for local list access
     */
    getCachedHandler() {
        if (!this._cachedHandler) {
            this._cachedHandler = new LocalHandler(this.config);
        }
        return this._cachedHandler;
    }

    /**
     * Check if cached lists are available
     */
    hasCachedLists() {
        const cachedLists = this.config.get("cachedLists", []);
        return cachedLists.length > 0;
    }

    getCachedTasksList() {
        return new CachedTaskList(this.config, !this.config.get("forever_offline", false));
    }

    getTaskLists() {
        return this._handler.getTaskLists();
    }

    getTaskList(id) {
        if(id === "cached") return this.getCachedTasksList();
        if(id.startsWith("local:")) return this.getCachedHandler().getTaskList(id);
        return this._handler.getTaskList(id);
    }
}