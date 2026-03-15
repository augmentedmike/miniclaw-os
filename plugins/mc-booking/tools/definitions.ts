import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { BookingConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { AppointmentStore } from "../src/store.js";
import { generateSlots } from "../src/slots.js";

function schema(props: Record<string, unknown>, required?: string[]): unknown {
  return { type: "object", properties: props, required: required ?? [], additionalProperties: false };
}

function str(d: string): unknown { return { type: "string", description: d }; }
function optStr(d: string): unknown { return { type: "string", description: d }; }
function optNum(d: string): unknown { return { type: "number", description: d }; }

function ok(text: string) { return { content: [{ type: "text" as const, text: text.trim() }], details: {} }; }
function err(text: string) { return { content: [{ type: "text" as const, text: text.trim() }], isError: true, details: {} }; }

function getStore(cfg: BookingConfig): AppointmentStore {
  return new AppointmentStore(openDb(cfg.dbPath));
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function fmtApt(a: { id: string; name: string; email: string; scheduled_time: string; status: string; duration_min: number }): string {
  return `[${a.id}] ${fmtTime(a.scheduled_time)} (${a.duration_min}min) — ${a.name} <${a.email}> [${a.status}]`;
}

export function createBookingTools(cfg: BookingConfig): AnyAgentTool[] {
  return [
    {
      name: "booking_slots",
      label: "Available Slots",
      description: "List available booking slots. Use this to check when your human is free before proposing a meeting time.",
      parameters: schema({}) as never,
      async execute(_id: string) {
        try {
          const store = getStore(cfg);
          const slots = generateSlots(cfg, store);
          const available = slots.filter((s) => s.available);
          if (!available.length) return ok("No available slots in the next " + cfg.windowWeeks + " weeks.");
          const lines = available.map((s) => `${fmtTime(s.time)} (${s.time})`);
          return ok(`Available slots (${available.length}):\n${lines.join("\n")}`);
        } catch (e: unknown) {
          return err(`Failed to get slots: ${(e as Error).message}`);
        }
      },
    },

    {
      name: "booking_request",
      label: "Request Booking",
      description:
        "Create a booking request. The appointment starts as 'pending' and needs human approval. " +
        "Use this when someone asks to schedule a meeting — the human will be notified to approve or reject.",
      parameters: schema({
        name: str("Name of the person requesting the meeting"),
        email: str("Email of the person requesting the meeting"),
        scheduled_time: str("Proposed time in ISO 8601 format"),
        duration_min: optNum("Duration in minutes (default: from config)"),
        interest: optStr("What the meeting is about"),
        notes: optStr("Additional notes"),
      }, ["name", "email", "scheduled_time"]) as never,
      async execute(_id: string, _input: unknown) {
        const p = _input as Record<string, unknown>;
        try {
          const store = getStore(cfg);
          if (store.hasConflict(p.scheduled_time as string)) {
            return err("That time slot is already booked. Use booking_slots to find available times.");
          }
          const apt = store.create({
            name: p.name as string,
            email: p.email as string,
            scheduled_time: p.scheduled_time as string,
            duration_min: (p.duration_min as number) || cfg.durationMinutes,
            interest: (p.interest as string) || "",
            notes: (p.notes as string) || "",
          });
          return ok(
            `Booking request created: ${apt.id}\n` +
            `Status: pending (awaiting human approval)\n` +
            `Time: ${fmtTime(apt.scheduled_time)} (${apt.duration_min}min)\n` +
            `Contact: ${apt.name} <${apt.email}>\n` +
            `Notify your human to approve or reject this request.`,
          );
        } catch (e: unknown) {
          return err(`Failed to create booking: ${(e as Error).message}`);
        }
      },
    },

    {
      name: "booking_approve",
      label: "Approve Booking",
      description: "Approve a pending booking request. Only call this after your human has confirmed.",
      parameters: schema({ id: str("Appointment ID (apt_...)") }, ["id"]) as never,
      async execute(_id: string, _input: unknown) {
        const p = _input as Record<string, string>;
        try {
          const store = getStore(cfg);
          const apt = store.approve(p.id);
          if (!apt) return err("Appointment not found or not pending.");
          return ok(`Approved: ${apt.id} — ${fmtTime(apt.scheduled_time)} with ${apt.name}\nSend confirmation email to ${apt.email}.`);
        } catch (e: unknown) {
          return err(`Failed to approve: ${(e as Error).message}`);
        }
      },
    },

    {
      name: "booking_reject",
      label: "Reject Booking",
      description: "Reject a pending booking request.",
      parameters: schema({ id: str("Appointment ID (apt_...)") }, ["id"]) as never,
      async execute(_id: string, _input: unknown) {
        const p = _input as Record<string, string>;
        try {
          const store = getStore(cfg);
          const apt = store.reject(p.id);
          if (!apt) return err("Appointment not found or not pending.");
          return ok(`Rejected: ${apt.id}\nNotify ${apt.name} <${apt.email}> that the time doesn't work and suggest alternatives.`);
        } catch (e: unknown) {
          return err(`Failed to reject: ${(e as Error).message}`);
        }
      },
    },

    {
      name: "booking_list",
      label: "List Appointments",
      description: "List upcoming appointments (pending and confirmed).",
      parameters: schema({ limit: optNum("Max results (default: 20)") }) as never,
      async execute(_id: string, _input: unknown) {
        const p = _input as Record<string, unknown>;
        try {
          const store = getStore(cfg);
          const apts = store.listUpcoming((p.limit as number) || 20);
          if (!apts.length) return ok("No upcoming appointments.");
          return ok(apts.map(fmtApt).join("\n"));
        } catch (e: unknown) {
          return err(`Failed to list: ${(e as Error).message}`);
        }
      },
    },

    {
      name: "booking_pending",
      label: "Pending Requests",
      description: "List booking requests waiting for human approval.",
      parameters: schema({}) as never,
      async execute(_id: string) {
        try {
          const store = getStore(cfg);
          const pending = store.listPending();
          if (!pending.length) return ok("No pending booking requests.");
          return ok(`Pending requests (${pending.length}):\n${pending.map(fmtApt).join("\n")}`);
        } catch (e: unknown) {
          return err(`Failed to list pending: ${(e as Error).message}`);
        }
      },
    },

    {
      name: "booking_cancel",
      label: "Cancel Appointment",
      description: "Cancel an appointment by ID.",
      parameters: schema({ id: str("Appointment ID (apt_...)") }, ["id"]) as never,
      async execute(_id: string, _input: unknown) {
        const p = _input as Record<string, string>;
        try {
          const store = getStore(cfg);
          const apt = store.cancel(p.id);
          if (!apt) return err("Appointment not found or already cancelled.");
          return ok(`Cancelled: ${apt.id}\nNotify ${apt.name} <${apt.email}>.`);
        } catch (e: unknown) {
          return err(`Failed to cancel: ${(e as Error).message}`);
        }
      },
    },

    {
      name: "booking_reschedule",
      label: "Reschedule Appointment",
      description: "Move an appointment to a new time.",
      parameters: schema({
        id: str("Appointment ID (apt_...)"),
        new_time: str("New time in ISO 8601 format"),
      }, ["id", "new_time"]) as never,
      async execute(_id: string, _input: unknown) {
        const p = _input as Record<string, string>;
        try {
          const store = getStore(cfg);
          if (store.hasConflict(p.new_time)) return err("That time slot is already booked.");
          const apt = store.reschedule(p.id, p.new_time);
          if (!apt) return err("Appointment not found or cancelled.");
          return ok(`Rescheduled: ${apt.id}\nNew time: ${fmtTime(apt.scheduled_time)}\nNotify ${apt.name} <${apt.email}>.`);
        } catch (e: unknown) {
          return err(`Failed to reschedule: ${(e as Error).message}`);
        }
      },
    },

    {
      name: "booking_preferences",
      label: "Booking Preferences",
      description: "View or update scheduling preferences and rules. Shows human's availability rules when called without arguments.",
      parameters: schema({
        key: optStr("Preference key to set (e.g., 'rules', 'blockedDates')"),
        value: optStr("New value (JSON for arrays)"),
      }) as never,
      async execute(_id: string, _input: unknown) {
        const p = _input as Record<string, string>;
        try {
          if (p.key && p.value) {
            const store = getStore(cfg);
            store.setPref(p.key, p.value);
            return ok(`Preference '${p.key}' updated.`);
          }
          const lines = [
            `## Scheduling Preferences`,
            ``,
            `**Available days:** ${cfg.availableDays.map((d) => ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d]).join(", ")}`,
            `**Time slots:** ${cfg.timeSlots.map((h) => `${h > 12 ? h - 12 : h}${h >= 12 ? "pm" : "am"}`).join(", ")}`,
            `**Duration:** ${cfg.durationMinutes} minutes`,
            `**Max per day:** ${cfg.maxPerDay}`,
            `**Window:** ${cfg.windowWeeks} weeks`,
            `**Timezone:** ${cfg.timezone}`,
            `**Blocked dates:** ${cfg.blockedDates.length ? cfg.blockedDates.join(", ") : "(none)"}`,
            ``,
            `**Rules:**`,
            ...cfg.rules.map((r) => `- ${r}`),
          ];
          return ok(lines.join("\n"));
        } catch (e: unknown) {
          return err(`Failed: ${(e as Error).message}`);
        }
      },
    },
  ];
}
