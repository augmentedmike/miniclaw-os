import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { Logger } from "pino";
import type { CalendarConfig } from "../src/config.js";
import { calHelper } from "../src/helper.js";

function schema(props: Record<string, unknown>, required?: string[]): unknown {
  return { type: "object", properties: props, required: required ?? [], additionalProperties: false };
}
function str(description: string): unknown { return { type: "string", description }; }
function optStr(description: string): unknown { return { type: "string", description }; }
function optNum(description: string): unknown { return { type: "number", description }; }
function optBool(description: string): unknown { return { type: "boolean", description }; }

function ok(data: unknown) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text }], details: {} };
}
function toolErr(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true, details: {} };
}

export function createCalendarTools(cfg: CalendarConfig, logger: Logger): AnyAgentTool[] {
  return [
    {
      name: "calendar_list",
      label: "Calendar List",
      description: "List all calendars on this Mac with name and writable status.",
      parameters: schema({}) as never,
      execute: async () => {
        try {
          const res = await calHelper(cfg, "list");
          if (res.error) return toolErr(res.error);
          return ok(res.result);
        } catch (e: unknown) {
          return toolErr(`calendar_list failed: ${e instanceof Error ? e.message : e}`);
        }
      },
    },

    {
      name: "calendar_events",
      label: "Calendar Events",
      description:
        "List upcoming calendar events. Returns events from today through days_ahead. " +
        "Use this to check the schedule before creating new events.",
      parameters: schema({
        days_ahead: optNum("Days ahead to include (0 = today only, default 7)"),
        calendar: optStr("Calendar name to filter by (omit for all calendars)"),
      }) as never,
      execute: async (_id: string, input: { days_ahead?: number; calendar?: string }) => {
        try {
          const res = await calHelper(cfg, "events", {
            days_ahead: input.days_ahead ?? 7,
            calendar: input.calendar,
          });
          if (res.error) return toolErr(res.error);
          return ok(res.result);
        } catch (e: unknown) {
          return toolErr(`calendar_events failed: ${e instanceof Error ? e.message : e}`);
        }
      },
    },

    {
      name: "calendar_search",
      label: "Calendar Search",
      description:
        "Search events by text (case-insensitive match against title, location, and notes).",
      parameters: schema({
        query: str("Search text"),
        days_ahead: optNum("Days ahead to search (default 30)"),
        calendar: optStr("Calendar name to filter by"),
      }, ["query"]) as never,
      execute: async (_id: string, input: { query: string; days_ahead?: number; calendar?: string }) => {
        try {
          const res = await calHelper(cfg, "search", {
            query: input.query,
            days_ahead: input.days_ahead ?? 30,
            calendar: input.calendar,
          });
          if (res.error) return toolErr(res.error);
          return ok(res.result);
        } catch (e: unknown) {
          return toolErr(`calendar_search failed: ${e instanceof Error ? e.message : e}`);
        }
      },
    },

    {
      name: "calendar_read",
      label: "Calendar Read",
      description: "Read full details of a single event by UID (includes notes, URL, recurrence).",
      parameters: schema({
        event_uid: str("The event UID"),
        calendar: optStr("Calendar name (optional, narrows search)"),
      }, ["event_uid"]) as never,
      execute: async (_id: string, input: { event_uid: string; calendar?: string }) => {
        try {
          const res = await calHelper(cfg, "read", {
            event_uid: input.event_uid,
            calendar: input.calendar,
          });
          if (res.error) return toolErr(res.error);
          return ok(res.result);
        } catch (e: unknown) {
          return toolErr(`calendar_read failed: ${e instanceof Error ? e.message : e}`);
        }
      },
    },

    {
      name: "calendar_create",
      label: "Calendar Create",
      description:
        "Create a new calendar event. Dates use 'YYYY-MM-DD HH:MM' for timed events " +
        "or 'YYYY-MM-DD' for all-day events.",
      parameters: schema({
        calendar: str("Calendar name (must be writable)"),
        summary: str("Event title"),
        start_date: str("Start date — 'YYYY-MM-DD HH:MM' or 'YYYY-MM-DD' for all-day"),
        end_date: str("End date — 'YYYY-MM-DD HH:MM' or 'YYYY-MM-DD' for all-day"),
        location: optStr("Event location"),
        description: optStr("Event notes/description"),
        all_day: optBool("Whether this is an all-day event (default false)"),
      }, ["calendar", "summary", "start_date", "end_date"]) as never,
      execute: async (_id: string, input: {
        calendar: string; summary: string; start_date: string; end_date: string;
        location?: string; description?: string; all_day?: boolean;
      }) => {
        logger.info(`mc-calendar: creating event "${input.summary}" on ${input.calendar}`);
        try {
          const res = await calHelper(cfg, "create", {
            calendar: input.calendar,
            summary: input.summary,
            start_date: input.start_date,
            end_date: input.end_date,
            location: input.location,
            description: input.description,
            all_day: input.all_day,
          });
          if (res.error) return toolErr(res.error);
          return ok(res.result);
        } catch (e: unknown) {
          return toolErr(`calendar_create failed: ${e instanceof Error ? e.message : e}`);
        }
      },
    },

    {
      name: "calendar_update",
      label: "Calendar Update",
      description: "Update an existing event's properties by UID.",
      parameters: schema({
        event_uid: str("The event UID to update"),
        calendar: optStr("Calendar name (narrows search)"),
        summary: optStr("New title"),
        start_date: optStr("New start date"),
        end_date: optStr("New end date"),
        location: optStr("New location"),
        description: optStr("New notes"),
        all_day: optBool("Set all-day status"),
      }, ["event_uid"]) as never,
      execute: async (_id: string, input: {
        event_uid: string; calendar?: string; summary?: string;
        start_date?: string; end_date?: string; location?: string;
        description?: string; all_day?: boolean;
      }) => {
        logger.info(`mc-calendar: updating event ${input.event_uid}`);
        try {
          const res = await calHelper(cfg, "update", input);
          if (res.error) return toolErr(res.error);
          return ok(res.result);
        } catch (e: unknown) {
          return toolErr(`calendar_update failed: ${e instanceof Error ? e.message : e}`);
        }
      },
    },

    {
      name: "calendar_delete",
      label: "Calendar Delete",
      description: "Delete an event by UID.",
      parameters: schema({
        event_uid: str("The event UID to delete"),
      }, ["event_uid"]) as never,
      execute: async (_id: string, input: { event_uid: string }) => {
        logger.info(`mc-calendar: deleting event ${input.event_uid}`);
        try {
          const res = await calHelper(cfg, "delete", { event_uid: input.event_uid });
          if (res.error) return toolErr(res.error);
          return ok(res.result);
        } catch (e: unknown) {
          return toolErr(`calendar_delete failed: ${e instanceof Error ? e.message : e}`);
        }
      },
    },
  ];
}
