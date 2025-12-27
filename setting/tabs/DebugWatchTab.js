import {TextRoot} from "../../lib/mmk/setting/Layout";
import {Paragraph, Title} from "../../lib/mmk/setting/Typography";

export function DebugWatchTab(ctx) {
  // Get debug log from watch
  let watchLogContent = "(No log synced yet. Use 'Sync log to phone' on watch)";
  let watchTimestamp = "";
  try {
    const logData = ctx.settingsStorage.getItem("debug_log");
    if (logData) {
      const parsed = JSON.parse(logData);
      watchTimestamp = parsed.timestamp;
      watchLogContent = parsed.content;
    }
  } catch(e) {
    watchLogContent = "Error parsing log: " + e;
  }

  const watchLogLines = watchLogContent.split('\n');

  return TextRoot([
    Paragraph([
      `Device: ${ctx.settingsStorage.getItem("device_name")}`
    ]),

    Title("Watch Debug Log"),
    watchTimestamp ? Paragraph([`Synced: ${watchTimestamp}`], { fontSize: "0.75rem", color: "#888" }) : null,
    View({
      style: {
        backgroundColor: "#1a1a1a",
        padding: "12px",
        borderRadius: "8px",
        marginTop: "8px",
        marginBottom: "16px",
        flex: 1,
        overflow: "auto"
      }
    }, watchLogLines.map(line =>
      Text({
        style: {
          display: "block",
          fontFamily: "monospace",
          fontSize: "11px",
          lineHeight: "1.4",
          color: "#00ff00",
          wordBreak: "break-all",
          whiteSpace: "pre-wrap"
        }
      }, line || " ")
    )),
  ]);
}
