import { launchApp } from "@zos/router";

const globalData = getApp()._options.globalData;

AppService({
    onInit(params) {
        console.log('=== APP-SERVICE ON INIT ===');
        console.log('Params:', params);

        // Detect task alarms (params start with "task_")
        if (params && params.startsWith('task_')) {
            console.log('Task alarm detected');

            // Store params for popup page
            globalData.localStorage.setItem('pending_task_alarm', params);

            // Launch task reminder popup
            launchApp({
                appId: 1023438,  // Tasks NC app ID
                url: 'page/amazfit/TaskReminderPopup',
                params: params
            });

            console.log('Launched TaskReminderPopup');
        } else {
            console.log('Not a task alarm');
        }

        console.log('=== APP-SERVICE ON INIT END ===');
    }
});
