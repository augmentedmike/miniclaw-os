export interface RepoConfig {
  name: string;
  path: string;
  remote?: string;     // default: "origin"
  stableTag?: string;  // default: "stable"
}

export interface UpdateConfig {
  stateDir: string;
  pluginDir: string;
  updateTime: string;         // cron expression
  autoRollback: boolean;
  notifyOnUpdate: boolean;
  smokeTimeout: number;       // ms
  repos: RepoConfig[];
}

export interface RollbackRef {
  name: string;
  path: string;
  previousRef: string;
  updatedRef: string;
}

export interface UpdateState {
  lastCheck: string | null;          // ISO timestamp
  lastUpdate: string | null;         // ISO timestamp
  lastResult: "success" | "failed" | "rolled-back" | null;
  rollbackRefs: RollbackRef[];
  versions: Record<string, string>;  // repo name → current ref
}
