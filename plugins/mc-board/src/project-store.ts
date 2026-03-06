import type { Database } from "./db.js";
import { type Project, generateProjectId, slugify } from "./project.js";

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  work_dir: string;
  github_repo: string;
  build_command: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    work_dir: row.work_dir ?? "",
    github_repo: row.github_repo ?? "",
    build_command: row.build_command ?? "",
    status: row.status as "active" | "archived",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class ProjectStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  create(opts: { name: string; description?: string; work_dir?: string; github_repo?: string; build_command?: string }): Project {
    const now = new Date().toISOString();
    const id = generateProjectId();
    const slug = slugify(opts.name);
    this.db.prepare(
      `INSERT INTO projects (id, name, slug, description, work_dir, github_repo, build_command, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    ).run(id, opts.name, slug, opts.description ?? "", opts.work_dir ?? "", opts.github_repo ?? "", opts.build_command ?? "", now, now);
    return this.findById(id);
  }

  findById(id: string): Project {
    const row = this.db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as ProjectRow | undefined;
    if (!row) throw new Error(`Project not found: ${id}`);
    return rowToProject(row);
  }

  list(includeArchived = false): Project[] {
    const rows = (includeArchived
      ? this.db.prepare(`SELECT * FROM projects ORDER BY created_at ASC`).all()
      : this.db.prepare(`SELECT * FROM projects WHERE status = 'active' ORDER BY created_at ASC`).all()
    ) as ProjectRow[];
    return rows.map(rowToProject);
  }

  update(id: string, updates: Partial<Pick<Project, "name" | "description" | "work_dir" | "github_repo" | "build_command">>): Project {
    const project = this.findById(id);
    const now = new Date().toISOString();
    const name = updates.name ?? project.name;
    const slug = updates.name ? slugify(updates.name) : project.slug;
    const description = updates.description !== undefined ? updates.description : project.description;
    const work_dir = updates.work_dir !== undefined ? updates.work_dir : project.work_dir;
    const github_repo = updates.github_repo !== undefined ? updates.github_repo : project.github_repo;
    const build_command = updates.build_command !== undefined ? updates.build_command : project.build_command;
    this.db.prepare(
      `UPDATE projects SET name=?, slug=?, description=?, work_dir=?, github_repo=?, build_command=?, updated_at=? WHERE id=?`,
    ).run(name, slug, description, work_dir, github_repo, build_command, now, id);
    return this.findById(id);
  }

  archive(id: string): Project {
    const now = new Date().toISOString();
    const exists = this.db.prepare(`SELECT id FROM projects WHERE id = ?`).get(id);
    if (!exists) throw new Error(`Project not found: ${id}`);
    this.db.prepare(`UPDATE projects SET status='archived', updated_at=? WHERE id=?`).run(now, id);
    return this.findById(id);
  }
}
