/**
 * mc-jobs — OpenClaw plugin
 *
 * Role-specific job templates for agents. Defines workflows, procedures,
 * and review gates for different roles (Software Developer, etc).
 *
 * Commands:
 *   mc jobs list            — list available jobs
 *   mc jobs get <jobId>     — show job details
 *   mc jobs init            — initialize default job templates
 *
 * Jobs are stored in ~/.openclaw/jobs/ as JSON files.
 */

import path from "path";
import os from "os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerJobsCommands } from "./cli/commands.js";
import { JobsStore, createSoftwareDeveloperJob } from "./src/jobs.js";

interface JobsConfig {
  jobsDir?: string;
  defaultJob?: string;
}

/**
 * Resolve jobs directory (in priority order):
 *   1. config.jobsDir
 *   2. ~/.openclaw/jobs (default)
 */
function resolveJobsDir(configJobsDir?: string): string {
  if (configJobsDir) {
    return configJobsDir;
  }
  return path.join(os.homedir(), ".openclaw", "jobs");
}

export default function register(api: OpenClawPluginApi): void {
  const raw = (api.pluginConfig ?? {}) as JobsConfig;
  const jobsDir = resolveJobsDir(raw.jobsDir);

  api.registerService({
    id: "mc-jobs",
    start(ctx) {
      api.logger.info(`mc-jobs loaded (jobsDir=${jobsDir})`);
      
      // Initialize with default job template if not present
      const store = new JobsStore(jobsDir);
      const devJob = store.loadJob("software-developer");
      
      if (!devJob) {
        api.logger.info(
          "Bootstrapping default Software Developer job template..."
        );
        const template = createSoftwareDeveloperJob();
        store.saveJob(template);
        api.logger.info(`✓ Software Developer job created at ${jobsDir}`);
      }
    },
  });

  api.registerCli((ctx) => {
    registerJobsCommands({
      program: ctx.program,
      jobsDir,
      logger: ctx.logger,
    });
  });
}
