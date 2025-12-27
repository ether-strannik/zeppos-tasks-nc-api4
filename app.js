import {log} from "@zos/utils";
import {LocalStorage} from "@zos/storage";
import {MessageBuilder} from './lib/zeppos/message'
import {ConfigStorage} from "./lib/mmk/ConfigStorage";
import {prepareFetch} from './lib/mmk/FetchForward';
import {t} from "./lib/mmk/i18n";
import {FsTools} from "./lib/mmk/Path";

const logger = log.getLogger("app");

const appId = 1023438;
FsTools.appTags = [appId, "app"];

const messageBuilder = new MessageBuilder({ appId });
const config = new ConfigStorage();

App({
  globalData: {
    appTags: [appId, "app"],
    messageBuilder,
    config,
    localStorage: null,
    // tasksProvider will be added after src/ migration
    t,
  },

  onCreate(options) {
    logger.log("app.onCreate()");

    this.globalData.localStorage = new LocalStorage();
    prepareFetch(messageBuilder);

    this.globalData.messageBuilder.connect();
    this.globalData.config.load();
  },

  onDestroy(options) {
    logger.log("app.onDestroy()");
    this.globalData.messageBuilder.disConnect();
  }
})
