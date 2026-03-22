import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { readSetupState } from "@/lib/setup-state";

/**
 * Send a welcome email from the agent to itself, confirming email is working.
 */
export function sendWelcomeEmail() {
  const state = readSetupState();
  const addr = state.emailAddress;
  const pw = (state as Record<string, string>).appPassword;
  if (!addr || !pw) return;

  const host = (state as Record<string, string>).emailSmtpHost || "smtp.gmail.com";
  const port = (state as Record<string, string>).emailSmtpPort || "587";
  const name = state.assistantName || "MiniClaw";

  const script = `
import smtplib, sys, ssl
from email.message import EmailMessage
addr, pw, host, port, name = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
msg = EmailMessage()
msg["Subject"] = f"Hello from {name}"
msg["From"] = addr
msg["To"] = addr
msg.set_content(f"Hi! I'm {name}, your MiniClaw AI assistant. I just finished setting up and I'm ready to work.\\n\\nThis email confirms that my email is configured and working.\\n\\n\\u2014 {name}")
try:
    if port == 465:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, context=ctx) as s:
            s.login(addr, pw)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port) as s:
            s.starttls()
            s.login(addr, pw)
            s.send_message(msg)
    print("sent")
except Exception as e:
    print(f"failed: {e}")
`;

  try {
    const tmpScript = path.join(os.tmpdir(), `mc-welcome-email-${process.pid}.py`);
    fs.writeFileSync(tmpScript, script, "utf-8");
    const result = execSync(
      `python3 "${tmpScript}" "${addr}" '${pw.replace(/'/g, "'\\''")}'  "${host}" "${port}" "${name}"`,
      { encoding: "utf-8", timeout: 30_000 },
    );
    fs.unlinkSync(tmpScript);
    console.log(`Welcome email: ${result.trim()}`);
  } catch (e) {
    console.error("Welcome email failed:", e);
  }
}
