import {CalDAVTask} from "./CalDAVTask";

/**
 * @implements TaskListInterface
 */
export class CalDAVTaskList {
  constructor(data, handler) {
    this.id = data.id;
    this.title = data.title;

    this._handler = handler;
  }

  getTask(id) {
    return new CalDAVTask({id}, this, this._handler);
  }

  getTasks(withCompleted, pageToken) {
    return this._handler.messageBuilder.request({
      package: "caldav_proxy",
      action: "list_tasks",
      listId: this.id,
      completed: withCompleted ? "all" : false,  // Fetch all or just incomplete
    }, {timeout: 5000}).then((d) => {
      if(d.error) throw new Error(d.error);

      const allTasks = d.map((r) => new CalDAVTask(r, this, this._handler));

      // Build UID -> task map for hierarchy
      const uidMap = {};
      for (const task of allTasks) {
        if (task.uid) {
          uidMap[task.uid] = task;
        }
      }

      // Assign subtasks to their parents
      const topLevelTasks = [];
      for (const task of allTasks) {
        if (task.parentId && uidMap[task.parentId]) {
          uidMap[task.parentId].subtasks.push(task);
        } else {
          topLevelTasks.push(task);
        }
      }

      return {
        tasks: topLevelTasks,
        nextPageToken: null,  // No pagination for CalDAV
      };
    })
  }

  insertTask(title, options = {}) {
    return this._handler.messageBuilder.request({
      package: "caldav_proxy",
      action: "insert_task",
      listId: this.id,
      title,
      options
    }, {timeout: 5000}).then((d) => {
      if(d.error) throw new Error(d.error);
      return true;
    })
  }

  /**
   * Insert a subtask with RELATED-TO pointing to parent
   * @param {string} title - Subtask title
   * @param {string} parentUid - UID of parent task
   */
  insertSubtask(title, parentUid) {
    return this._handler.messageBuilder.request({
      package: "caldav_proxy",
      action: "insert_task",
      listId: this.id,
      title,
      parentUid
    }, {timeout: 5000}).then((d) => {
      if(d.error) throw new Error(d.error);
      return true;
    })
  }
}