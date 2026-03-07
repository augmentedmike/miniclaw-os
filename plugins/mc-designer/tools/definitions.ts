// mc-designer agent tool definitions
// Phase 3: expose designer operations as agent-callable tools so agents on
// UI/design cards can autonomously generate, edit, and composite images.
//
// Implementation guide: ~/am/workspace/mc-designer-agent-integration.md
//
// STUB — tool signatures defined, execute() bodies are placeholders.
// Full implementation: use Pattern B (direct instance) from the design doc.
// The execute() bodies below use CLI delegation (Pattern A) as compilable stubs.

import { spawnSync } from "node:child_process";
import type { AnyAgentTool } from "openclaw/plugin-sdk";

// ---- helpers ----

function runDesigner(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("openclaw", ["mc-designer", ...args], {
    encoding: "utf-8",
    timeout: 90_000, // image gen takes 10-30s
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? 1,
  };
}

function schema(props: Record<string, unknown>, required?: string[]): unknown {
  return { type: "object", properties: props, required: required ?? [], additionalProperties: false };
}
function str(description: string) { return { type: "string", description }; }
function strEnum(values: string[], description: string) { return { type: "string", enum: values, description }; }
function optStr(description: string) { return { type: "string", description }; }

function ok(text: string) {
  return { content: [{ type: "text" as const, text: text.trim() }], details: {} };
}
function err(text: string) {
  return { content: [{ type: "text" as const, text: text.trim() }], isError: true, details: {} };
}

// ---- tool definitions ----

export const designerTools: AnyAgentTool[] = [
  {
    name: "designer_generate_image",
    label: "Designer Generate Image",
    description:
      "Generate an image using Gemini (gemini-2.0-flash-exp) and add it as a layer on a canvas. " +
      "Use role='background' for full-canvas fills (no x/y/w/h needed). " +
      "Use role='element' for isolated subjects — requires x, y, w, h for placement. " +
      "Canvas is auto-created if it does not exist. " +
      "Returns the saved image file path and layer metadata.",
    parameters: schema(
      {
        prompt:  str("Image generation prompt — describe what to generate"),
        canvas:  str("Canvas name (created if absent). Prefix with card ID, e.g. crd_a6b080cd-bg"),
        role:    strEnum(["background", "element"], "Layer role: background fills the full canvas; element is a positioned asset"),
        layer:   optStr("Layer name (auto-generated if omitted)"),
        width:   optStr("Canvas width in px when auto-creating (default: 1024)"),
        height:  optStr("Canvas height in px when auto-creating (default: 1024)"),
        x:       optStr("X position in px — required for element role"),
        y:       optStr("Y position in px — required for element role"),
        w:       optStr("Render width in px — required for element role"),
        h:       optStr("Render height in px — required for element role"),
      },
      ["prompt", "canvas", "role"],
    ) as never,
    execute: async (_toolCallId, params: Record<string, string | undefined>) => {
      // STUB: CLI delegation — replace with direct gemini.generate() call in full impl
      // See design doc Pattern B for direct instance approach.
      const args = ["gen", params.prompt!, "--canvas", params.canvas!, "--role", params.role!];
      if (params.layer)  args.push("--layer",  params.layer);
      if (params.width)  args.push("-W",        params.width);
      if (params.height) args.push("-H",        params.height);
      if (params.x)      args.push("-x",        params.x);
      if (params.y)      args.push("-y",        params.y);
      if (params.w)      args.push("--w",       params.w);
      if (params.h)      args.push("--h",       params.h);

      const { stdout, stderr, exitCode } = runDesigner(args);
      if (exitCode !== 0) return err(stderr || stdout || "designer gen failed");
      // Full impl: parse imagePath from stdout and call imageResultFromFile({ path, label, extraText })
      return ok(stdout);
    },
  },

  {
    name: "designer_composite_canvas",
    label: "Designer Composite Canvas",
    description:
      "Flatten all visible layers of a canvas in z-order and export a final PNG. " +
      "Call this after generating all layers to produce the deliverable. " +
      "Returns the output file path.",
    parameters: schema(
      {
        canvas: str("Canvas name to composite"),
        output: optStr("Output file path (auto-named in media/designer/output/ if omitted)"),
      },
      ["canvas"],
    ) as never,
    execute: async (_toolCallId, params: Record<string, string | undefined>) => {
      // STUB: CLI delegation — replace with direct compositeCanvas() call in full impl
      const args = ["composite", params.canvas!];
      if (params.output) args.push("--out", params.output);

      const { stdout, stderr, exitCode } = runDesigner(args);
      if (exitCode !== 0) return err(stderr || stdout || "designer composite failed");
      // Full impl: parse outputPath from stdout and call imageResultFromFile({ path, label })
      return ok(stdout);
    },
  },

  {
    name: "designer_edit_layer",
    label: "Designer Edit Layer",
    description:
      "Edit an existing layer on a canvas using Gemini. " +
      "Describe what to change in natural language. " +
      "Returns the updated image file path.",
    parameters: schema(
      {
        canvas:       str("Canvas name"),
        layer:        str("Layer name or ID to edit"),
        instructions: str("Edit instructions — describe what to change"),
      },
      ["canvas", "layer", "instructions"],
    ) as never,
    execute: async (_toolCallId, params: Record<string, string>) => {
      // STUB: CLI delegation — replace with direct gemini.edit() call in full impl
      const { stdout, stderr, exitCode } = runDesigner([
        "edit", params.canvas, params.layer, params.instructions,
      ]);
      if (exitCode !== 0) return err(stderr || stdout || "designer edit failed");
      // Full impl: parse imagePath from stdout and call imageResultFromFile({ path, label })
      return ok(stdout);
    },
  },
];
