import {gettext as t} from "i18n";
import {BottomSheet} from "../../lib/mmk/setting/BottomSheet";
import {StateManager} from "../../lib/mmk/setting/StateManager";
import {TextRoot} from "../../lib/mmk/setting/Layout";
import {Paragraph} from "../../lib/mmk/setting/Typography";
import {Input} from "../../lib/mmk/setting/Input";
import {PrimaryButton} from "../../lib/mmk/setting/Buttons";

export function LoginNextcloudBottomSheet(ctx, onCancel) {
  const state = new StateManager(ctx, "login_nextcloud");
  const [url, setUrl] = state.useSetting("nextcloud_url_validate", "");
  const [urlValid, setUrlValid] = state.useSetting("nextcloud_url_valid", false);

  let urlCheckStatus = "Checking, is URL valid…";
  switch(urlValid) {
    case true:
      urlCheckStatus = "Nextcloud URL is valid.";
      break;
    case false:
      urlCheckStatus = "Enter valid cloud URL to continue.";
      break;
  }

  return BottomSheet(true, onCancel, [
    TextRoot([
      Paragraph([
        t("Enter your Nextcloud installation URL:"),
      ]),
    ]),
    Input("Server URL", url, (v) => {
      setUrlValid("sus");
      setUrl(v);
    }),
    TextRoot([
      Paragraph([t(urlCheckStatus)], {
        opacity: ".75",
        fontSize: ".7em",
      })
    ]),
    ...(urlValid === true ? NextcloudCredentialsForm(ctx, url) : []),
  ])
}

// Default shared proxy URL
const DEFAULT_PROXY_URL = "https://caldav-proxy-emn8.vercel.app";

function NextcloudCredentialsForm(ctx, url) {
  const state = new StateManager(ctx, "nextcloud_credentials");
  const [login, setLogin] = state.useState("");
  const [password, setPassword] = state.useState("");
  const [proxyUrl, setProxyUrl] = state.useState(DEFAULT_PROXY_URL);
  const [_, setTestConfig] = state.useSetting("caldav_validate", "");
  const [testResult, setTestResult] = state.useSetting("caldav_validate_result", false);

  function startValidationIfPossible(login, password) {
    if(login === "" || password === "")
      return setTestResult(false);

    setTestResult("sus");
    setTestConfig({host: url, user: login, password: password, proxyUrl: proxyUrl});
  }

  let credCheckStatus = "Checking, is login/password valid…";
  switch(testResult) {
    case true:
      credCheckStatus = "Credentials are valid, connection success.";
      break;
    case false:
      credCheckStatus = "Authorization failed, or server configuration isn't valid.";
      break;
  }

  return [
    TextRoot([
      Paragraph(t("Enter your cloud credentials. If two-factor auth is enabled, you must " +
        "create and use an application password.")),
    ]),
    Input(t("Username"), login, (v) => {
      setLogin(v);
      startValidationIfPossible(v, password);
    }),
    Input(t("Password"), password , (v) => {
      setPassword(v);
      startValidationIfPossible(login, v);
    }),
    TextRoot([
      Paragraph([t(credCheckStatus)], {
        opacity: ".75",
        fontSize: ".7em",
      }),
    ]),
    TextRoot([
      Paragraph(t("Proxy URL (for advanced users):")),
    ]),
    Input(t("Proxy URL"), proxyUrl, (v) => {
      setProxyUrl(v || DEFAULT_PROXY_URL);
    }),
    TextRoot([
      Paragraph([t("Default: " + DEFAULT_PROXY_URL)], {
        opacity: ".5",
        fontSize: ".6em",
      }),
      testResult === true ? PrimaryButton(t("Save configuration"), () => {
        ctx.settingsStorage.setItem("auth_token", JSON.stringify({
          host: url,
          user: login,
          password: password,
          proxyUrl: proxyUrl || DEFAULT_PROXY_URL
        }));
      }) : null,
    ]),
  ]
}
