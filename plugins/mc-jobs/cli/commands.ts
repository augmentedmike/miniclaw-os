import { Command } from "commander";
import { JobsStore, createSoftwareDeveloperJob } from "../src/jobs.js";
import type { Logger } from "openclaw/logger";

interface JobsCliOptions {
  program: Command;
  jobsDir?: string;
  logger: Logger;
}

export function registerJobsCommands(opts: JobsCliOptions): void {
  const { program, jobsDir, logger } = opts;
  const store = new JobsStore(jobsDir);

  const jobsCmd = program
    .command("jobs")
    .description("Manage job templates");

  jobsCmd
    .command("list")
    .description("List all available jobs")
    .action(() => {
      try {
        const jobs = store.listJobs();
        
        if (jobs.length === 0) {
          logger.info("No jobs found. Run 'mc jobs init' to bootstrap.");
          return;
        }
        
        logger.info("\nAvailable jobs:");
        for (const job of jobs) {
          logger.info(`  ${job.id} — ${job.name}`);
          logger.info(`    ${job.description}`);
        }
        logger.info("");
      } catch (error) {
        logger.error(`Failed to list jobs: ${error}`);
        process.exit(1);
      }
    });

  jobsCmd
    .command("get <jobId>")
    .description("Show details of a job")
    .action((jobId: string) => {
      try {
        const job = store.loadJob(jobId);
        
        if (!job) {
          logger.error(`Job not found: ${jobId}`);
          process.exit(1);
        }
        
        logger.info(`\n## ${job.name}\n`);
        logger.info(`Description: ${job.description}`);
        logger.info(`Mission: ${job.missionStatement}\n`);
        
        logger.info("Git Configuration:");
        logger.info(`  User: ${job.git.userName}`);
        logger.info(`  Email: ${job.git.userEmail}`);
        logger.info(`  Token: ${job.git.vaultTokenName}\n`);
        
        logger.info("Workspace Paths:");
        logger.info(`  OpenClaw: ${job.workspace.openclaw}`);
        logger.info(`  Home: ${job.workspace.home}`);
        logger.info(`  Projects: ${job.workspace.projects}\n`);
        
        logger.info("Required Tools:");
        for (const tool of job.tools) {
          const status = tool.required ? "[REQUIRED]" : "[optional]";
          logger.info(`  ${status} ${tool.name} — ${tool.description}`);
        }
        
        logger.info("\nReview Gate:");
        logger.info(`  ${job.reviewGate.description}`);
        for (const step of job.reviewGate.steps) {
          logger.info(`  ${step}`);
        }
        logger.info("");
      } catch (error) {
        logger.error(`Failed to get job: ${error}`);
        process.exit(1);
      }
    });

  jobsCmd
    .command("init")
    .description("Initialize default job templates")
    .action(() => {
      try {
        const sdJob = createSoftwareDeveloperJob();
        store.saveJob(sdJob);
        
        logger.info(`\n✓ Initialized job: ${sdJob.id}`);
        logger.info(`  Location: ${store.getJobsDir()}/${sdJob.id}.json\n`);
      } catch (error) {
        logger.error(`Failed to init jobs: ${error}`);
        process.exit(1);
      }
    });
}
