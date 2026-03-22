import fs from "fs";
import path from "path";
import os from "os";

export interface Fan {
  id: string;
  name: string;
  platform: "youtube" | "github" | "twitter" | "blog" | "other";
  urls: string[];
  whyWeFollow: string;
  engagementStyle: "intellectual-peer" | "mentor" | "collaborator" | "friend" | "inspiration";
  tags: string[];
  addedAt: string;
  lastChecked?: string;
  notes?: string;
}

export interface EngagementLog {
  fanId: string;
  action: "watched" | "liked" | "commented" | "shared" | "bookmarked" | "referenced";
  contentUrl: string;
  contentTitle: string;
  timestamp: string;
  notes?: string;
}

export function fansDir(): string {
  const dir = path.join(os.homedir(), ".openclaw", "miniclaw", "USER", "fans");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function fanRegistryPath(): string {
  return path.join(fansDir(), "fan-registry.json");
}

export function engagementLogPath(): string {
  return path.join(fansDir(), "engagement-log.json");
}

export function readFanRegistry(): Fan[] {
  const filePath = fanRegistryPath();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "[]", "utf-8");
    return [];
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function writeFanRegistry(fans: Fan[]): void {
  fs.writeFileSync(fanRegistryPath(), JSON.stringify(fans, null, 2), "utf-8");
}

export function readEngagementLog(): EngagementLog[] {
  const filePath = engagementLogPath();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "[]", "utf-8");
    return [];
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function writeEngagementLog(log: EngagementLog[]): void {
  fs.writeFileSync(engagementLogPath(), JSON.stringify(log, null, 2), "utf-8");
}

export function addEngagement(log: EngagementLog): void {
  const current = readEngagementLog();
  current.push(log);
  writeEngagementLog(current);
}

export function getFanById(id: string): Fan | undefined {
  const registry = readFanRegistry();
  return registry.find((f) => f.id === id);
}

export function addFan(fan: Fan): void {
  const registry = readFanRegistry();
  const existing = registry.findIndex((f) => f.id === fan.id);
  if (existing >= 0) {
    registry[existing] = fan;
  } else {
    registry.push(fan);
  }
  writeFanRegistry(registry);
}

export function removeFan(id: string): boolean {
  const registry = readFanRegistry();
  const idx = registry.findIndex((f) => f.id === id);
  if (idx >= 0) {
    registry.splice(idx, 1);
    writeFanRegistry(registry);
    return true;
  }
  return false;
}

export function seedInitialFans(): void {
  const registry = readFanRegistry();

  // Only seed if registry is empty
  if (registry.length > 0) return;

  const initialFans: Fan[] = [
    {
      id: "youtube-dave-shapiro",
      name: "Dave Shapiro",
      platform: "youtube",
      urls: ["https://www.youtube.com/@DaveShap"],
      whyWeFollow:
        "Philosophical AI thinker — deep takes on consciousness, agent architecture, post-labor economics",
      engagementStyle: "intellectual-peer",
      tags: ["ai", "philosophy", "consciousness", "economics"],
      addedAt: new Date().toISOString(),
      notes: "First fan entry — foundational thinking on AI and society",
    },
    {
      id: "youtube-wes-roth",
      name: "Wes Roth",
      platform: "youtube",
      urls: ["https://www.youtube.com/@WesRoth"],
      whyWeFollow: "AI news and thoughtful commentary on the AI landscape",
      engagementStyle: "intellectual-peer",
      tags: ["ai", "news", "analysis"],
      addedAt: new Date().toISOString(),
    },
    {
      id: "youtube-dylan-curious",
      name: "Dylan Curious",
      platform: "youtube",
      urls: ["https://www.youtube.com/@dylan_curious"],
      whyWeFollow: "AI community engagement and grassroots perspective",
      engagementStyle: "collaborator",
      tags: ["ai", "community", "culture"],
      addedAt: new Date().toISOString(),
    },
  ];

  initialFans.forEach((fan) => addFan(fan));
}
