import type { Database } from "./db.js";
import { type Project, generateProjectId, slugify } from "./project.js";

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  description: string;
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

  create(opts: { name: string; description?: string }): Project {
    const now = new Date().toISOString();
    const id = generateProjectId();
    const slug = slugify(opts.name);
    this.db.prepare(
      `INSERT INTO projects (id, name, slug, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    ).run(id, opts.name, slug, opts.description ?? "", now, now);
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

  update(id: string, updates: Partial<Pick<Project, "name" | "description">>): Project {
    const project = this.findById(id);
    const now = new Date().toISOString();
    const name = updates.name ?? project.name;
    const slug = updates.name ? slugify(updates.name) : project.slug;
    const description = updates.description !== undefined ? updates.description : project.description;
    this.db.prepare(
      `UPDATE projects SET name=?, slug=?, description=?, updated_at=? WHERE id=?`,
    ).run(name, slug, description, now, id);
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
