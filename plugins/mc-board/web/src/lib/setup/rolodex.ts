import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { readSetupState } from "@/lib/setup-state";
import { STATE_DIR } from "./constants";

/**
 * Seed the rolodex with the human owner and agent contacts.
 * Writes contacts.json so the rolodex SQLite migration picks them up on first open.
 * Only seeds if contacts.json doesn't exist yet or is empty.
 *
 * IMPORTANT identity rules:
 * - The wizard's emailAddress field is the AGENT's email, NOT the human's.
 * - Human contact is seeded with NO email (emails: []).
 *   The agent should later ask the human for their real name & email via the
 *   onboarding seed card created by seedOnboardingCard().
 */
export function seedRolodexContacts() {
  const setupState = readSetupState();
  const rolodexDir = path.join(STATE_DIR, "miniclaw", "USER", "rolodex");
  const contactsPath = path.join(rolodexDir, "contacts.json");

  // Skip if contacts.json already has data
  if (fs.existsSync(contactsPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(contactsPath, "utf-8"));
      if (Array.isArray(existing) && existing.length > 0) return;
    } catch { /* treat parse errors as empty */ }
  }

  fs.mkdirSync(rolodexDir, { recursive: true });

  const contacts = [];

  // Human owner contact — NO email, NO real name yet.
  // The onboarding seed card will prompt the agent to ask the human for these.
  contacts.push({
    id: crypto.randomUUID(),
    name: "My Human",
    emails: [],
    phones: [],
    domains: [],
    tags: ["owner", "human"],
    trustStatus: "verified",
    lastVerified: new Date().toISOString(),
    notes: "Human owner — added during setup. Name and email TBD (agent will ask).",
  });

  // Agent contact — emailAddress from the wizard is the AGENT's own email.
  // Do NOT put the human's email here.
  const agentName = setupState.assistantName || "MiniClaw";
  const agentShort = setupState.shortName || agentName;
  const agentEmail = setupState.emailAddress || "";
  const agentGh = (setupState as Record<string, string>).ghUsername || "";
  contacts.push({
    id: crypto.randomUUID(),
    name: agentName,
    emails: agentEmail ? [agentEmail] : [],
    phones: [],
    domains: [],
    tags: ["agent", "self"],
    trustStatus: "verified",
    lastVerified: new Date().toISOString(),
    notes: agentGh ? `AI agent (${agentShort}). GitHub: ${agentGh}.` : `AI agent (${agentShort}) — added during setup.`,
  });

  fs.writeFileSync(contactsPath, JSON.stringify(contacts, null, 2) + "\n", "utf-8");
}
