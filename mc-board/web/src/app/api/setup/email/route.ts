export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkImapAuth, checkSmtpAuth } from "@/lib/email-check";
import { writeSetupState, isSetupComplete } from "@/lib/setup-state";
import { consumeToken } from "@/lib/sensitive-auth";

function isGmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  return domain === "gmail.com" || domain === "googlemail.com";
}

export async function POST(req: Request) {
  const { email, appPassword, smtpHost, smtpPort, sensitiveToken } = await req.json();

  if (isSetupComplete() && !consumeToken(sensitiveToken)) {
    return NextResponse.json(
      { ok: false, error: "Password confirmation required" },
      { status: 403 },
    );
  }

  if (!email || !appPassword) {
    return NextResponse.json({ ok: false, error: "Email and password are required" }, { status: 400 });
  }

  // 1. Test credentials
  const gmail = isGmail(email);
  let authCheck: { ok: boolean; error?: string };

  if (gmail) {
    authCheck = await checkImapAuth(email, appPassword);
  } else {
    if (!smtpHost) {
      return NextResponse.json({ ok: false, error: "SMTP host is required for non-Gmail accounts" }, { status: 400 });
    }
    const port = parseInt(smtpPort || "587", 10);
    authCheck = await checkSmtpAuth(email, appPassword, smtpHost, port);
  }

  if (!authCheck.ok) {
    return NextResponse.json({ ok: false, error: authCheck.error || "Auth failed" }, { status: 400 });
  }

  // 2. Save to setup state — vault persists at "Finishing up" step after install.sh
  writeSetupState({
    emailAddress: email,
    emailAppPassword: appPassword,
    emailSmtpHost: smtpHost || "",
    emailSmtpPort: smtpPort || "587",
    emailConfigured: true,
  } as Record<string, string | boolean>);

  return NextResponse.json({ ok: true });
}
