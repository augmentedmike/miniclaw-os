export const dynamic = "force-dynamic";

import * as os from "node:os";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { readSetupState, writeSetupState } from "@/lib/setup-state";
import {
  STATE_DIR,
  normalizeBotId,
  configureGateway,
  applyGithubAuth,
  seedGithubSetupCard,
  setGithubDefaultRepo,
  seedBoardDb,
  seedOnboardingCard,
  ensureProjectsFolder,
  personalizeWorkspace,
  seedRolodexContacts,
  ensureGatewayRunning,
  registerCronJobs,
  ensureEmailWatchCron,
  persistUpdateTime,
  sendWelcomeEmail,
} from "@/lib/setup";

export async function POST() {
  const setupState = readSetupState();
  const botId = normalizeBotId(setupState.telegramBotUsername);

  if (!botId) {
    return NextResponse.json(
      { ok: false, error: "Telegram bot username is required before completing setup" },
      { status: 400 },
    );
  }

  // Configure openclaw.json, register telegram channel, store token in vault
  configureGateway(botId, setupState.telegramBotToken, setupState.telegramChatId);

  // Authenticate gh CLI with the GitHub token (non-fatal if it fails)
  const ghAuth = applyGithubAuth();
  if (!ghAuth.ok) {
    console.warn("gh auth login skipped:", ghAuth.error);
  }

  // Set mc-github defaultRepo in openclaw.json
  setGithubDefaultRepo();

  // Create USER/brain/ and seed the board DB with default projects
  seedBoardDb();

  // Seed GitHub presence setup card if GH token is configured
  if (ghAuth.ok) {
    seedGithubSetupCard();
  }

  // Create canonical projects folder and ~/mc-projects symlink
  const projectsFolder = ensureProjectsFolder();

  // Re-run workspace personalization now that setup-state.json is complete
  personalizeWorkspace();

  // Seed rolodex with human owner and agent contacts
  // NOTE: human gets NO email here — the onboarding card asks the agent to collect it
  seedRolodexContacts();

  // Seed onboarding card so the agent asks the human their real name & email
  seedOnboardingCard();

  // Install and start the openclaw gateway
  const gw = ensureGatewayRunning();

  // Register cron jobs with the running gateway
  registerCronJobs();

  // Register email watch cron if email is configured
  ensureEmailWatchCron();

  // Persist the user's chosen nightly update time to mc-update plugin config
  persistUpdateTime();

  // Send welcome email from the agent
  sendWelcomeEmail();

  const state = writeSetupState({
    complete: true,
    completedAt: new Date().toISOString(),
  });

  // Run smoke + doctor in background — don't block the user
  const smokePath = `${STATE_DIR}/miniclaw/SYSTEM/bin:${os.homedir()}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ""}`;
  spawn("bash", ["-c", "mc-smoke && mc-doctor --auto"], {
    env: { ...process.env, PATH: smokePath },
    stdio: "ignore",
    detached: true,
  }).unref();

  return NextResponse.json({
    ok: true,
    state,
    ghAuth,
    gateway: gw,
    projectsFolder,
  });
}
