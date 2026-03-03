/**
 * Agent tools for miniclaw-trust
 * Allow AM to perform handshakes and verify identities as part of a task.
 */

import { spawnSync } from "node:child_process";
import type { AnyAgentTool } from "openclaw/plugin-sdk";

function runTrust(args: string[]): { stdout: string; stderr: string; ok: boolean } {
  const result = spawnSync("openclaw", ["trust", ...args], {
    encoding: "utf-8",
    timeout: 10_000,
  });
  return {
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    ok: result.status === 0,
  };
}

function ok(text: string) {
  return { type: "text" as const, text };
}
function err(text: string) {
  return { type: "text" as const, text, isError: true };
}

export const trustTools: AnyAgentTool[] = [
  {
    name: "trust_challenge",
    label: "Trust: Challenge Peer",
    description: "Initiate a handshake with a trusted peer. Returns the challenge JSON to send to them.",
    parameters: {
      type: "object",
      properties: {
        peer_id: { type: "string", description: "The peer agent's ID (e.g. ar, am)" },
      },
      required: ["peer_id"],
    } as never,
    async execute({ peer_id }: { peer_id: string }) {
      const r = runTrust(["challenge", peer_id]);
      return r.ok ? ok(r.stdout) : err(r.stderr || r.stdout);
    },
  },

  {
    name: "trust_respond",
    label: "Trust: Respond to Challenge",
    description: "Sign and respond to a handshake challenge from a peer. Pass the challenge JSON.",
    parameters: {
      type: "object",
      properties: {
        challenge_json: { type: "string", description: "The TRUST_CHALLENGE JSON received from the peer" },
      },
      required: ["challenge_json"],
    } as never,
    async execute({ challenge_json }: { challenge_json: string }) {
      const r = runTrust(["respond", challenge_json]);
      return r.ok ? ok(r.stdout) : err(r.stderr || r.stdout);
    },
  },

  {
    name: "trust_complete",
    label: "Trust: Complete Handshake",
    description: "Verify a peer's response and issue an ACK. Establishes a session if valid.",
    parameters: {
      type: "object",
      properties: {
        challenge_json: { type: "string", description: "The original TRUST_CHALLENGE you sent" },
        response_json:  { type: "string", description: "The TRUST_RESPONSE received from the peer" },
      },
      required: ["challenge_json", "response_json"],
    } as never,
    async execute({ challenge_json, response_json }: { challenge_json: string; response_json: string }) {
      const r = runTrust(["complete", challenge_json, response_json]);
      return r.ok ? ok(r.stdout) : err(r.stderr || r.stdout);
    },
  },

  {
    name: "trust_verify",
    label: "Trust: Verify Signature",
    description: "Verify that a message was signed by a known trusted peer.",
    parameters: {
      type: "object",
      properties: {
        peer_id:   { type: "string", description: "The peer's agent ID" },
        message:   { type: "string", description: "The message that was signed" },
        signature: { type: "string", description: "The base64url signature to verify" },
      },
      required: ["peer_id", "message", "signature"],
    } as never,
    async execute({ peer_id, message, signature }: { peer_id: string; message: string; signature: string }) {
      const r = runTrust(["verify", peer_id, message, signature]);
      return r.ok ? ok(r.stdout) : err(r.stderr || r.stdout);
    },
  },

  {
    name: "trust_sessions",
    label: "Trust: Active Sessions",
    description: "List currently active trust sessions (peers with verified identity).",
    parameters: { type: "object", properties: {} } as never,
    async execute() {
      const r = runTrust(["sessions"]);
      return r.ok ? ok(r.stdout) : err(r.stderr || r.stdout);
    },
  },
];
