import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { listCards, getCard, listProjects } from "@/lib/data";
import { getOrCreateSession, destroySession } from "@/lib/chat-session";

const CHAT_IMAGE_DIR = path.join(os.tmpdir(), "mc-chat-images");

export const dynamic = "force-dynamic";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

function getAssistantName(): string {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(STATE_DIR, "USER", "setup-state.json"), "utf-8"));
    return raw.shortName || raw.assistantName || "Assistant";
  } catch { // setup-state.json not found or invalid JSON — fall back to default
    return "Assistant";
  }
}

function readWorkspaceFile(filename: string): string {
  try { return fs.readFileSync(path.join(STATE_DIR, "workspace", filename), "utf-8").trim(); } catch { return ""; } // file not found or unreadable
}

function getSystemPrompt(): string {
  const name = getAssistantName();
  const parts = [
    readWorkspaceFile("IDENTITY.md"),
    readWorkspaceFile("SOUL.md"),
    readWorkspaceFile("refs/chat-persona.md").replace(/\{\{NAME\}\}/g, name),
    readWorkspaceFile("refs/TOOLS.md"),
  ].filter(Boolean);
  return parts.join("\n\n") || `You are ${name}, a helpful assistant embedded in a task board. Be direct, concise, and honest.`;
}

function buildBoardContext(projectId?: string, activeCardId?: string): string {
  const lines: string[] = [];
  const projects = listProjects();
  const activeProject = projectId ? projects.find(p => p.id === projectId) : null;
  if (activeProject) {
    lines.push(`## Current Project: ${activeProject.name} (${activeProject.id})`);
    if (activeProject.description) lines.push(`Description: ${activeProject.description}`);
    lines.push("");
  }
  const cards = listCards(projectId);
  for (const col of ["backlog", "in-progress", "in-review", "shipped"] as const) {
    const colCards = cards.filter(c => c.column === col);
    if (colCards.length === 0) continue;
    lines.push(`### ${col.toUpperCase()} (${colCards.length})`);
    for (const c of colCards) lines.push(`- [${c.id}] ${c.title}`);
    lines.push("");
  }
  if (activeCardId) {
    const card = getCard(activeCardId);
    if (card) {
      lines.push(`## Open Card: ${card.title} (${card.id})`);
      if (card.problem_description) lines.push(`Problem: ${card.problem_description}`);
      if (card.acceptance_criteria) lines.push(`Criteria:\n${card.acceptance_criteria}`);
    }
  }
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, sessionId, context, projectId, activeCardId, images } = body as {
      message: string;
      sessionId?: string;
      context?: string;
      projectId?: string;
      activeCardId?: string;
      images?: { base64: string; mediaType: string }[];
    };

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "message required" }), { status: 400 });
    }

    // Handle /clear as session reset
    if (message.trim() === "/clear") {
      if (sessionId) destroySession(sessionId);
      return new Response(JSON.stringify({ cleared: true }), { headers: { "Content-Type": "application/json" } });
    }

    const sid = sessionId || crypto.randomUUID();
    const persona = getSystemPrompt();
    const board = buildBoardContext(projectId, activeCardId);
    const systemPrompt = board ? `${persona}\n\n---\n\n## Board State\n\n${board}` : persona;

    const session = getOrCreateSession(sid, systemPrompt);

    let userText = message;
    if (context?.trim()) {
      userText = `[Context: ${context.slice(0, 500)}]\n\n${message}`;
    }

    // Save images to temp files and build image references for Claude
    let imagePaths: string[] = [];
    if (images && images.length > 0) {
      fs.mkdirSync(CHAT_IMAGE_DIR, { recursive: true });
      for (const img of images) {
        const ext = img.mediaType === "image/png" ? ".png"
          : img.mediaType === "image/jpeg" ? ".jpg"
          : img.mediaType === "image/gif" ? ".gif"
          : img.mediaType === "image/webp" ? ".webp"
          : ".png";
        const filename = `chat-${crypto.randomUUID()}${ext}`;
        const filepath = path.join(CHAT_IMAGE_DIR, filename);
        fs.writeFileSync(filepath, Buffer.from(img.base64, "base64"));
        imagePaths.push(filepath);
      }
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const send = (obj: object) => {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* client-disconnected */ }
        };

        send({ type: "session", sessionId: sid });

        const handler = (evt: { type: string; text?: string; name?: string; detail?: string }) => {
          send(evt);
          if (evt.type === "done") {
            session.removeListener("event", handler);
            try { controller.close(); } catch { /* client-disconnected */ }
          }
        };

        session.on("event", handler);
        session.send(userText, imagePaths.length > 0 ? imagePaths : undefined).catch((err) => {
          send({ type: "error", text: String(err) });
          session.removeListener("event", handler);
          try { controller.close(); } catch { /* client-disconnected */ }
        });

        req.signal.addEventListener("abort", () => {
          session.removeListener("event", handler);
          try { controller.close(); } catch { /* client-disconnected */ }
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
