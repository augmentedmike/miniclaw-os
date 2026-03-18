import type { Command } from "commander";
import type { Logger } from "openclaw/plugin-sdk";
import type { BookingConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { AppointmentStore } from "../src/store.js";
import { generateSlots } from "../src/slots.js";

interface Ctx {
  program: Command;
  cfg: BookingConfig;
  logger: Logger;
}

export function registerBookingCommands(ctx: Ctx): void {
  const { program, cfg } = ctx;

  const sub = program
    .command("mc-booking")
    .description("Scheduling assistant — slots, bookings, preferences");

  sub
    .command("slots")
    .description("List available booking slots")
    .action(() => {
      const store = new AppointmentStore(openDb(cfg.dbPath));
      const slots = generateSlots(cfg, store);
      const available = slots.filter((s) => s.available);

      if (!available.length) {
        console.log("No available slots.");
        return;
      }

      console.log(`Available slots (next ${cfg.windowWeeks} weeks):`);
      let lastDate = "";
      for (const s of available) {
        const d = new Date(s.time);
        const dateStr = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        if (dateStr !== lastDate) {
          console.log();
          console.log(`  ${dateStr}`);
          lastDate = dateStr;
        }
        console.log(`    ${timeStr}  (${s.time})`);
      }
    });

  sub
    .command("list")
    .description("List upcoming appointments")
    .option("-n, --limit <n>", "Max appointments", "20")
    .action((opts: { limit: string }) => {
      const store = new AppointmentStore(openDb(cfg.dbPath));
      const apts = store.listUpcoming(parseInt(opts.limit, 10));

      if (!apts.length) {
        console.log("No upcoming appointments.");
        return;
      }

      for (const a of apts) {
        const d = new Date(a.scheduled_time);
        console.log(`[${a.id}] ${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} (${a.duration_min}min) — ${a.name} <${a.email}> [${a.status}]`);
      }
    });

  sub
    .command("pending")
    .description("List pending booking requests awaiting approval")
    .action(() => {
      const store = new AppointmentStore(openDb(cfg.dbPath));
      const pending = store.listPending();

      if (!pending.length) {
        console.log("No pending requests.");
        return;
      }

      for (const a of pending) {
        const d = new Date(a.scheduled_time);
        console.log(`[${a.id}] ${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} — ${a.name} <${a.email}>`);
        if (a.interest) console.log(`  Interest: ${a.interest}`);
      }
    });

  sub
    .command("approve <id>")
    .description("Approve a pending booking request")
    .action((id: string) => {
      const store = new AppointmentStore(openDb(cfg.dbPath));
      const apt = store.approve(id);
      if (!apt) {
        console.error("Appointment not found or not pending.");
        process.exit(1);
      }
      console.log(`Approved: ${apt.id} — ${apt.name}`);
    });

  sub
    .command("reject <id>")
    .description("Reject a pending booking request")
    .action((id: string) => {
      const store = new AppointmentStore(openDb(cfg.dbPath));
      const apt = store.reject(id);
      if (!apt) {
        console.error("Appointment not found or not pending.");
        process.exit(1);
      }
      console.log(`Rejected: ${apt.id}`);
    });

  sub
    .command("cancel <id>")
    .description("Cancel an appointment")
    .action((id: string) => {
      const store = new AppointmentStore(openDb(cfg.dbPath));
      const apt = store.cancel(id);
      if (!apt) {
        console.error("Appointment not found or already cancelled.");
        process.exit(1);
      }
      console.log(`Cancelled: ${apt.id}`);
    });

  sub
    .command("preferences")
    .description("Show scheduling preferences and rules")
    .action(() => {
      const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      console.log("Scheduling Preferences:");
      console.log(`  Available days: ${cfg.availableDays.map((d) => dayNames[d]).join(", ")}`);
      console.log(`  Time slots:     ${cfg.timeSlots.map((h) => `${h > 12 ? h - 12 : h}${h >= 12 ? "pm" : "am"}`).join(", ")}`);
      console.log(`  Duration:       ${cfg.durationMinutes} minutes`);
      console.log(`  Max per day:    ${cfg.maxPerDay}`);
      console.log(`  Window:         ${cfg.windowWeeks} weeks`);
      console.log(`  Timezone:       ${cfg.timezone}`);
      if (cfg.blockedDates.length) console.log(`  Blocked dates:  ${cfg.blockedDates.join(", ")}`);
      if (cfg.rules.length) {
        console.log("  Rules:");
        for (const r of cfg.rules) console.log(`    - ${r}`);
      }
    });
}
