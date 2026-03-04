import { randomBytes } from "node:crypto";

export interface Project {
  id: string;         // prj_<hex>
  name: string;
  slug: string;       // url-safe lowercase, used in filename
  description: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

export function generateProjectId(): string {
  return "prj_" + randomBytes(4).toString("hex");
}

export function projectFilename(project: Project): string {
  return `${project.id}-${project.slug}.json`;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
