import type { Command } from "commander";
import type { Logger } from "openclaw/plugin-sdk";
import type { CalendarConfig } from "../src/config.js";
import { calHelperSync, ensureHelper } from "../src/helper.js";

interface Ctx {
  program: Command;
  cfg: CalendarConfig;
  logger: Logger;
}

export function registerCalendarCommands(ctx: Ctx): void {
  const { program, cfg } = ctx;

  const sub = program
    .command("mc-calendar")
    .description("Apple Calendar — list, create, search, and manage events");

  // ---- list ----
  sub
    .command("list")
    .description("List all calendars")
    .action(() => {
      const res = calHelperSync(cfg, "list");
      if (res.error) { console.error(res.error); process.exit(1); }
      for (const cal of res.result) {
        const rw = cal.writable ? "rw" : "ro";
        console.log(`  [${rw}] ${cal.name}`);
      }
    });

  // ---- events ----
  sub
    .command("events")
    .description("List upcoming events")
    .option("-d, --days <n>", "Days ahead (default 7)", "7")
    .option("-c, --calendar <name>", "Filter by calendar name")
    .action((opts: { days: string; calendar?: string }) => {
      const res = calHelperSync(cfg, "events", {
        days_ahead: parseInt(opts.days, 10),
        calendar: opts.calendar,
      });
      if (res.error) { console.error(res.error); process.exit(1); }
      if (!res.result.length) { console.log("No events found."); return; }
      for (const ev of res.result) {
        const time = ev.allDay ? "all-day" : `${ev.start} — ${ev.end}`;
        console.log(`  ${time}  ${ev.summary}`);
        if (ev.location) console.log(`    📍 ${ev.location}`);
        console.log(`    [${ev.calendar}] ${ev.uid}`);
        console.log();
      }
    });

  // ---- search ----
  sub
    .command("search <query>")
    .description("Search events by text")
    .option("-d, --days <n>", "Days ahead to search (default 30)", "30")
    .option("-c, --calendar <name>", "Filter by calendar name")
    .action((query: string, opts: { days: string; calendar?: string }) => {
      const res = calHelperSync(cfg, "search", {
        query,
        days_ahead: parseInt(opts.days, 10),
        calendar: opts.calendar,
      });
      if (res.error) { console.error(res.error); process.exit(1); }
      if (!res.result.length) { console.log("No events found."); return; }
      for (const ev of res.result) {
        console.log(`  ${ev.start}  ${ev.summary}  [${ev.calendar}]`);
      }
    });

  // ---- read ----
  sub
    .command("read <uid>")
    .description("Read full event details by UID")
    .action((uid: string) => {
      const res = calHelperSync(cfg, "read", { event_uid: uid });
      if (res.error) { console.error(res.error); process.exit(1); }
      const ev = res.result;
      console.log(`UID:       ${ev.uid}`);
      console.log(`Summary:   ${ev.summary}`);
      console.log(`Calendar:  ${ev.calendar}`);
      console.log(`Start:     ${ev.start}`);
      console.log(`End:       ${ev.end}`);
      console.log(`All-day:   ${ev.allDay}`);
      if (ev.location) console.log(`Location:  ${ev.location}`);
      if (ev.description) console.log(`Notes:     ${ev.description}`);
      if (ev.url) console.log(`URL:       ${ev.url}`);
      if (ev.recurrence) console.log(`Recurrence: ${ev.recurrence}`);
    });

  // ---- create ----
  sub
    .command("create")
    .description("Create a new event")
    .requiredOption("-c, --calendar <name>", "Calendar name")
    .requiredOption("-s, --summary <text>", "Event title")
    .requiredOption("--start <datetime>", "Start (YYYY-MM-DD HH:MM)")
    .requiredOption("--end <datetime>", "End (YYYY-MM-DD HH:MM)")
    .option("-l, --location <text>", "Location")
    .option("-n, --notes <text>", "Notes/description")
    .option("--all-day", "All-day event")
    .action((opts: {
      calendar: string; summary: string; start: string; end: string;
      location?: string; notes?: string; allDay?: boolean;
    }) => {
      const res = calHelperSync(cfg, "create", {
        calendar: opts.calendar,
        summary: opts.summary,
        start_date: opts.start,
        end_date: opts.end,
        location: opts.location,
        description: opts.notes,
        all_day: opts.allDay ?? false,
      });
      if (res.error) { console.error(res.error); process.exit(1); }
      console.log(`Created: ${res.result.summary} (${res.result.uid})`);
    });

  // ---- delete ----
  sub
    .command("delete <uid>")
    .description("Delete an event by UID")
    .action((uid: string) => {
      const res = calHelperSync(cfg, "delete", { event_uid: uid });
      if (res.error) { console.error(res.error); process.exit(1); }
      console.log(`Deleted: ${res.result.summary} (${uid})`);
    });

  // ---- status ----
  sub
    .command("status")
    .description("Check EventKit access and list calendars")
    .action(() => {
      console.log(`Helper binary: ${cfg.helperBin}`);
      try {
        ensureHelper(cfg);
        console.log("  Status: compiled");
      } catch (e: any) {
        console.log(`  Status: NOT COMPILED — ${e.message}`);
        return;
      }
      try {
        const res = calHelperSync(cfg, "list");
        if (res.error) { console.log(`  EventKit: ${res.error}`); return; }
        console.log(`  EventKit: access granted`);
        console.log(`  Calendars: ${res.result.length}`);
        for (const cal of res.result) {
          console.log(`    [${cal.writable ? "rw" : "ro"}] ${cal.name}`);
        }
      } catch (e: any) {
        console.log(`  EventKit: error — ${e.message}`);
      }
    });
}
