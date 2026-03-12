import fs from "fs";
import path from "path";
import os from "os";

/**
 * Job — defines role-specific workflows, procedures, and review gates
 */
export interface Job {
  id: string;
  name: string;
  description: string;
  missionStatement: string;
  
  // Git configuration
  git: {
    userName: string;
    userEmail: string;
    vaultTokenName: string; // Name of token in vault (e.g., "gh-am-mini")
  };
  
  // Workspace paths
  workspace: {
    openclaw: string; // ~/.openclaw or similar
    home: string;     // ~/.openclaw or similar
    projects: string; // ~/.openclaw/projects or similar
  };
  
  // Tool setup
  tools: {
    name: string;
    required: boolean;
    description: string;
  }[];
  
  // Review gate — what must be verified before commit/push
  reviewGate: {
    description: string;
    steps: string[];
  };
}

/**
 * JobsStore — loads and manages job templates
 */
export class JobsStore {
  private jobsDir: string;

  constructor(jobsDir?: string) {
    this.jobsDir =
      jobsDir || path.join(os.homedir(), ".openclaw", "jobs");
  }

  /**
   * Load a job template by ID
   */
  loadJob(jobId: string): Job | null {
    const filePath = path.join(this.jobsDir, `${jobId}.json`);
    
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as Job;
    } catch (error) {
      throw new Error(`Failed to load job ${jobId}: ${error}`);
    }
  }

  /**
   * List all available jobs
   */
  listJobs(): Job[] {
    try {
      if (!fs.existsSync(this.jobsDir)) {
        return [];
      }
      
      const files = fs.readdirSync(this.jobsDir);
      const jobs: Job[] = [];
      
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        
        const jobId = file.replace(".json", "");
        const job = this.loadJob(jobId);
        
        if (job) {
          jobs.push(job);
        }
      }
      
      return jobs;
    } catch (error) {
      throw new Error(`Failed to list jobs: ${error}`);
    }
  }

  /**
   * Save a job template
   */
  saveJob(job: Job): void {
    try {
      if (!fs.existsSync(this.jobsDir)) {
        fs.mkdirSync(this.jobsDir, { recursive: true });
      }
      
      const filePath = path.join(this.jobsDir, `${job.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(job, null, 2));
    } catch (error) {
      throw new Error(`Failed to save job ${job.id}: ${error}`);
    }
  }

  /**
   * Get jobs directory
   */
  getJobsDir(): string {
    return this.jobsDir;
  }
}

/**
 * Factory: Create the Software Developer job template
 */
export function createSoftwareDeveloperJob(): Job {
  return {
    id: "software-developer",
    name: "Software Developer",
    description:
      "Full-stack software developer with git workflows, token management, and review gates.",
    missionStatement:
      "Build real, shipped software. Verify locally. Commit with clarity. Push when done.",

    git: {
      userName: "AugmentedMike",
      userEmail: "owner@example.com",
      vaultTokenName: "gh-am-mini",
    },

    workspace: {
      openclaw: path.join(os.homedir(), ".openclaw"),
      home: path.join(os.homedir(), ".openclaw"),
      projects: path.join(os.homedir(), ".openclaw", "projects"),
    },

    tools: [
      {
        name: "git",
        required: true,
        description: "Version control — commit, push, pull",
      },
      {
        name: "vault",
        required: true,
        description: "Secret management — token retrieval",
      },
      {
        name: "npm/pnpm",
        required: true,
        description: "Package manager — install, build, test",
      },
      {
        name: "github",
        required: false,
        description: "GitHub CLI for PR creation and issue tracking",
      },
    ],

    reviewGate: {
      description:
        "Before pushing, verify that all work is complete, tested locally, and committed with clear messages.",
      steps: [
        "1. Code runs locally without errors",
        "2. All tests pass (if applicable)",
        "3. git status shows clean working directory",
        "4. Commit message is clear and references card ID if applicable",
        "5. Ready to git push to main branch",
      ],
    },
  };
}
