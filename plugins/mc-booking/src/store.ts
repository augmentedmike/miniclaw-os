import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";

export interface Appointment {
  id: string;
  name: string;
  email: string;
  interest: string;
  scheduled_time: string;
  duration_min: number;
  notes: string;
  status: string; // pending | confirmed | cancelled
  manage_token: string;
  payment_id: string;
  refund_id: string;
  refund_amount: number;
  paid_at: string;
  cancelled_at: string;
  approved_at: string;
  created_at: string;
  updated_at: string;
}

function generateId(): string {
  return `apt_${randomBytes(4).toString("hex")}`;
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export class AppointmentStore {
  constructor(private db: Database.Database) {}

  create(data: {
    name: string;
    email: string;
    interest?: string;
    scheduled_time: string;
    duration_min?: number;
    notes?: string;
  }): Appointment {
    const now = new Date().toISOString();
    const apt: Appointment = {
      id: generateId(),
      name: data.name,
      email: data.email,
      interest: data.interest || "",
      scheduled_time: data.scheduled_time,
      duration_min: data.duration_min || 30,
      notes: data.notes || "",
      status: "pending",
      manage_token: generateToken(),
      payment_id: "",
      refund_id: "",
      refund_amount: 0,
      paid_at: "",
      cancelled_at: "",
      approved_at: "",
      created_at: now,
      updated_at: now,
    };

    this.db.prepare(`
      INSERT INTO appointments (id, name, email, interest, scheduled_time, duration_min, notes, status, manage_token, payment_id, refund_id, refund_amount, paid_at, cancelled_at, approved_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      apt.id, apt.name, apt.email, apt.interest, apt.scheduled_time,
      apt.duration_min, apt.notes, apt.status, apt.manage_token,
      apt.payment_id, apt.refund_id, apt.refund_amount, apt.paid_at,
      apt.cancelled_at, apt.approved_at, apt.created_at, apt.updated_at,
    );

    return apt;
  }

  getByToken(token: string): Appointment | null {
    return this.db.prepare("SELECT * FROM appointments WHERE manage_token = ?").get(token) as Appointment | undefined ?? null;
  }

  getById(id: string): Appointment | null {
    return this.db.prepare("SELECT * FROM appointments WHERE id = ?").get(id) as Appointment | undefined ?? null;
  }

  listUpcoming(limit = 20): Appointment[] {
    return this.db.prepare(`
      SELECT * FROM appointments
      WHERE status IN ('pending', 'confirmed') AND scheduled_time >= datetime('now')
      ORDER BY scheduled_time ASC LIMIT ?
    `).all(limit) as Appointment[];
  }

  listPending(): Appointment[] {
    return this.db.prepare(`
      SELECT * FROM appointments WHERE status = 'pending'
      ORDER BY created_at ASC
    `).all() as Appointment[];
  }

  approve(id: string): Appointment | null {
    const apt = this.getById(id);
    if (!apt || apt.status !== "pending") return null;
    const now = new Date().toISOString();
    this.db.prepare("UPDATE appointments SET status = 'confirmed', approved_at = ?, updated_at = ? WHERE id = ?").run(now, now, id);
    return { ...apt, status: "confirmed", approved_at: now, updated_at: now };
  }

  reject(id: string): Appointment | null {
    const apt = this.getById(id);
    if (!apt || apt.status !== "pending") return null;
    const now = new Date().toISOString();
    this.db.prepare("UPDATE appointments SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?").run(now, now, id);
    return { ...apt, status: "cancelled", cancelled_at: now, updated_at: now };
  }

  hasConflict(scheduledTime: string): boolean {
    const row = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM appointments
      WHERE scheduled_time = ? AND status IN ('pending', 'confirmed')
    `).get(scheduledTime) as { cnt: number };
    return row.cnt > 0;
  }

  countOnDate(dateStr: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM appointments
      WHERE scheduled_time LIKE ? AND status IN ('pending', 'confirmed')
    `).get(`${dateStr}%`) as { cnt: number };
    return row.cnt;
  }

  cancel(id: string, refundId?: string, refundAmount?: number): Appointment | null {
    const apt = this.getById(id);
    if (!apt || apt.status === "cancelled") return null;
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE appointments SET status = 'cancelled', cancelled_at = ?, refund_id = ?, refund_amount = ?, updated_at = ?
      WHERE id = ?
    `).run(now, refundId || "", refundAmount || 0, now, id);
    return { ...apt, status: "cancelled", cancelled_at: now, refund_id: refundId || "", refund_amount: refundAmount || 0, updated_at: now };
  }

  reschedule(id: string, newTime: string): Appointment | null {
    const apt = this.getById(id);
    if (!apt || apt.status === "cancelled") return null;
    const now = new Date().toISOString();
    this.db.prepare("UPDATE appointments SET scheduled_time = ?, updated_at = ? WHERE id = ?").run(newTime, now, id);
    return { ...apt, scheduled_time: newTime, updated_at: now };
  }

  getPref(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM preferences WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setPref(key: string, value: string): void {
    this.db.prepare("INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)").run(key, value);
  }
}
