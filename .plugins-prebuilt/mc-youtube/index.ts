/**
 * mc-youtube — OpenClaw plugin
 *
 * YouTube video processing: download, extract keyframes, and summarise
 * video content for the agent's knowledge base.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveConfig } from "./src/config.js";

export default function register(api: OpenClawPluginApi): void {
  const raw = (api.pluginConfig ?? {}) as Record<string, unknown>;
  const cfg = resolveConfig(raw);
  api.logger.info(`mc-youtube loaded (mediaDir=${cfg.mediaDir})`);
}
