export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { vaultSet } from "@/lib/vault";
import { checkGmailAuth, checkSmtpAuth } from "@/lib/email-check";
import { writeSetupState } from "@/lib/setup-state";

function isGmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  return domain === "gmail.com" || domain === "googlemail.com";
}

export async function POST(req: Request) {
  const { email, appPassword, smtpHost, smtpPort } = await req.json();

  if (!email || !appPassword) {
    return NextResponse.json({ ok: false, error: "Email and password are required" }, { status: 400 });
  }

  // 1. Test credentials
  const gmail = isGmail(email);
  let authCheck: { ok: boolean; error?: string };

  if (gmail) {
    authCheck = await checkGmailAuth(email, appPassword);
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

  // 2. Write to vault
  const emailResult = vaultSet("gmail-email", email);
  if (!emailResult.ok) {
    return NextResponse.json({ ok: false, error: `Vault error: ${emailResult.error}` }, { status: 500 });
  }

  const pwResult = vaultSet("gmail-app-password", appPassword);
  if (!pwResult.ok) {
    return NextResponse.json({ ok: false, error: `Vault error: ${pwResult.error}` }, { status: 500 });
  }

  // 3. Save SMTP config for non-Gmail
  if (!gmail && smtpHost) {
    vaultSet("smtp-host", smtpHost);
    vaultSet("smtp-port", smtpPort || "587");
  }

  // 4. Update setup state
  writeSetupState({ emailAddress: email, emailConfigured: true });

  return NextResponse.json({ ok: true });
}
