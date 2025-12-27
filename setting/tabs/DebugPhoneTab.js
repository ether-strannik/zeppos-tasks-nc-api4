import {TextRoot} from "../../lib/mmk/setting/Layout";
import {Paragraph, Title} from "../../lib/mmk/setting/Typography";

export function DebugPhoneTab(ctx) {
  // Get phone-side debug log
  let phoneLogContent = "(No phone logs yet)";
  let phoneTimestamp = "";
  try {
    const phoneData = ctx.settingsStorage.getItem("phone_debug_log");
    if (phoneData) {
      const parsed = JSON.parse(phoneData);
      phoneTimestamp = parsed.timestamp;
      phoneLogContent = parsed.content;
    }
  } catch(e) {
    phoneLogContent = "Error parsing log: " + e;
  }

  const phoneLogLines = phoneLogContent.split('\n');

  return TextRoot([
    Toggle({
      label: "Prevent accessing internet (force cached/offline mode)",
      settingsKey: "force_offline"
    }),
    Paragraph([
      `Device: ${ctx.settingsStorage.getItem("device_name")}`
    ]),

    Title("Phone Debug Log (CalDAV)"),
    phoneTimestamp ? Paragraph([`Updated: ${phoneTimestamp}`], { fontSize: "0.75rem", color: "#888" }) : null,
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
    }, phoneLogLines.map(line =>
      Text({
        style: {
          display: "block",
          fontFamily: "monospace",
          fontSize: "11px",
          lineHeight: "1.4",
          color: "#00aaff",
          wordBreak: "break-all",
          whiteSpace: "pre-wrap"
        }
      }, line || " ")
    )),
  ]);
}
