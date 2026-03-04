import * as fs from "node:fs";
import * as path from "node:path";
import {
  type Project,
  generateProjectId,
  projectFilename,
  slugify,
} from "./project.js";

export class ProjectStore {
  readonly projectsDir: string;

  constructor(projectsDir: string) {
    this.projectsDir = projectsDir;
    fs.mkdirSync(projectsDir, { recursive: true });
  }

  create(opts: { name: string; description?: string }): Project {
    const now = new Date().toISOString();
    const slug = slugify(opts.name);
    const project: Project = {
      id: generateProjectId(),
      name: opts.name,
      slug,
      description: opts.description ?? "",
      status: "active",
      created_at: now,
      updated_at: now,
    };
    this._write(project);
    return project;
  }

  findById(id: string): Project {
    const files = this._projectFiles();
    const file = files.find(f => f.startsWith(id));
    if (!file) throw new Error(`Project not found: ${id}`);
    return this._read(file);
  }

  list(includeArchived = false): Project[] {
    const files = this._projectFiles();
    const projects = files.map(f => this._read(f));
    if (!includeArchived) return projects.filter(p => p.status === "active");
    return projects;
  }

  update(id: string, updates: Partial<Pick<Project, "name" | "description">>): Project {
    const project = this.findById(id);
    const oldFile = path.join(this.projectsDir, projectFilename(project));

    Object.assign(project, updates);
    if (updates.name) project.slug = slugify(updates.name);
    project.updated_at = new Date().toISOString();

    // Remove old file if filename changed
    const newFile = path.join(this.projectsDir, projectFilename(project));
    if (oldFile !== newFile) {
      try { fs.unlinkSync(oldFile); } catch { /* best-effort */ }
    }

    this._write(project);
    return project;
  }

  archive(id: string): Project {
    const project = this.findById(id);
    project.status = "archived";
    project.updated_at = new Date().toISOString();
    this._write(project);
    return project;
  }

  private _projectFiles(): string[] {
    return fs.readdirSync(this.projectsDir).filter(f => f.endsWith(".json"));
  }

  private _read(filename: string): Project {
    const content = fs.readFileSync(path.join(this.projectsDir, filename), "utf-8");
    return JSON.parse(content) as Project;
  }

  private _write(project: Project): void {
    const filename = projectFilename(project);
    fs.writeFileSync(
      path.join(this.projectsDir, filename),
      JSON.stringify(project, null, 2),
      "utf-8",
    );
  }
}
