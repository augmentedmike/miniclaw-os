import EventKit
import Foundation

// MARK: - Helpers

let store = EKEventStore()
var outputPath: String? = nil

func requestAccess() {
    let sem = DispatchSemaphore(value: 0)
    var granted = false
    var requestError: Error?
    store.requestFullAccessToEvents { g, err in
        granted = g
        requestError = err
        sem.signal()
    }
    sem.wait()
    if !granted {
        if let requestError {
            fail("Calendar access denied: \(requestError.localizedDescription)")
        }
        fail("Calendar access denied. Grant access in System Settings > Privacy & Security > Calendars.")
    }
}

let dateFmt: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd HH:mm"
    f.locale = Locale(identifier: "en_US_POSIX")
    return f
}()

let dayFmt: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    f.locale = Locale(identifier: "en_US_POSIX")
    return f
}()

func formatDate(_ d: Date) -> String {
    dateFmt.string(from: d)
}

func parseDate(_ s: String) -> Date? {
    dateFmt.date(from: s) ?? dayFmt.date(from: s)
}

func jsonString(_ obj: Any) -> String {
    let data = try! JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted, .sortedKeys])
    return String(data: data, encoding: .utf8)!
}

func emit(_ obj: Any) {
    let out = jsonString(obj)
    if let path = outputPath {
        do {
            try out.write(toFile: path, atomically: true, encoding: .utf8)
            return
        } catch {}
    }
    print(out)
}

func fail(_ msg: String) -> Never {
    let obj: [String: Any] = ["error": msg]
    emit(obj)
    exit(0)
}

func eventDict(_ e: EKEvent, full: Bool = false) -> [String: Any] {
    var d: [String: Any] = [
        "uid": e.eventIdentifier ?? "",
        "summary": e.title ?? "",
        "start": formatDate(e.startDate),
        "end": formatDate(e.endDate),
        "allDay": e.isAllDay,
        "location": e.location ?? NSNull(),
        "calendar": e.calendar.title,
    ]
    if full {
        d["description"] = (e.notes ?? "").isEmpty ? NSNull() : e.notes!
        d["url"] = e.url?.absoluteString ?? NSNull()
        if let rules = e.recurrenceRules, !rules.isEmpty {
            d["recurrence"] = rules.map { $0.description }.joined(separator: "; ")
        } else {
            d["recurrence"] = NSNull()
        }
    }
    return d
}

func findCalendar(_ name: String) -> EKCalendar? {
    store.calendars(for: .event).first { $0.title == name }
}

func refreshStore() {
    store.reset()
}

// MARK: - Operations

func listCalendars() {
    let cals = store.calendars(for: .event).map { cal -> [String: Any] in
        ["name": cal.title, "writable": cal.allowsContentModifications]
    }
    emit(["result": cals])
}

func listEvents(daysAhead: Int, calendarName: String?) {
    refreshStore()
    let start = Calendar.current.startOfDay(for: Date())
    guard let end = Calendar.current.date(byAdding: .day, value: daysAhead + 1, to: start) else {
        fail("Invalid days_ahead value")
    }

    var calendars: [EKCalendar]? = nil
    if let name = calendarName {
        guard let cal = findCalendar(name) else { fail("Calendar '\(name)' not found") }
        calendars = [cal]
    }

    let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars)
    let events = store.events(matching: predicate)
    emit(["result": events.map { eventDict($0) }])
}

func searchEvents(query: String, daysAhead: Int, calendarName: String?) {
    refreshStore()
    let start = Calendar.current.startOfDay(for: Date())
    guard let end = Calendar.current.date(byAdding: .day, value: daysAhead + 1, to: start) else {
        fail("Invalid days_ahead value")
    }

    var calendars: [EKCalendar]? = nil
    if let name = calendarName {
        guard let cal = findCalendar(name) else { fail("Calendar '\(name)' not found") }
        calendars = [cal]
    }

    let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars)
    let events = store.events(matching: predicate)
    let q = query.lowercased()
    let matched = events.filter { e in
        (e.title ?? "").localizedCaseInsensitiveContains(q) ||
        (e.location ?? "").localizedCaseInsensitiveContains(q) ||
        (e.notes ?? "").localizedCaseInsensitiveContains(q)
    }
    emit(["result": matched.map { eventDict($0) }])
}

func readEvent(uid: String, calendarName: String?) {
    refreshStore()
    guard let event = store.event(withIdentifier: uid) else {
        fail("Event with UID '\(uid)' not found")
    }
    if let name = calendarName, event.calendar.title != name {
        fail("Event with UID '\(uid)' not found in calendar '\(name)'")
    }
    emit(["result": eventDict(event, full: true)])
}

func createEvent(calendarName: String, summary: String, startStr: String, endStr: String,
                 location: String?, description: String?, allDay: Bool) {
    guard let cal = findCalendar(calendarName) else { fail("Calendar '\(calendarName)' not found") }
    guard cal.allowsContentModifications else { fail("Calendar '\(calendarName)' is read-only") }
    guard let startDate = parseDate(startStr) else { fail("Invalid start_date: '\(startStr)'") }
    guard let endDate = parseDate(endStr) else { fail("Invalid end_date: '\(endStr)'") }

    let event = EKEvent(eventStore: store)
    event.calendar = cal
    event.title = summary
    event.startDate = startDate
    event.endDate = endDate
    event.isAllDay = allDay
    if let loc = location { event.location = loc }
    if let desc = description { event.notes = desc }

    do {
        try store.save(event, span: .thisEvent, commit: true)
        emit(["result": ["uid": event.eventIdentifier ?? "", "summary": summary, "calendar": calendarName]])
    } catch {
        fail("Failed to create event: \(error.localizedDescription)")
    }
}

func updateEvent(uid: String, calendarName: String?, summary: String?, startStr: String?,
                 endStr: String?, location: String?, description: String?, allDay: Bool?) {
    refreshStore()
    guard let event = store.event(withIdentifier: uid) else { fail("Event '\(uid)' not found") }
    guard event.calendar.allowsContentModifications else { fail("Calendar '\(event.calendar.title)' is read-only") }

    if let s = summary { event.title = s }
    if let s = startStr, let d = parseDate(s) { event.startDate = d }
    if let s = endStr, let d = parseDate(s) { event.endDate = d }
    if let s = location { event.location = s }
    if let s = description { event.notes = s }
    if let a = allDay { event.isAllDay = a }

    do {
        try store.save(event, span: .thisEvent, commit: true)
        emit(["result": ["uid": uid, "updated": true]])
    } catch {
        fail("Failed to update event: \(error.localizedDescription)")
    }
}

func deleteEvent(uid: String) {
    refreshStore()
    guard let event = store.event(withIdentifier: uid) else { fail("Event '\(uid)' not found") }
    guard event.calendar.allowsContentModifications else { fail("Calendar '\(event.calendar.title)' is read-only") }
    let name = event.title ?? ""
    do {
        try store.remove(event, span: .thisEvent, commit: true)
        emit(["result": ["uid": uid, "deleted": true, "summary": name]])
    } catch {
        fail("Failed to delete event: \(error.localizedDescription)")
    }
}

// MARK: - Main

let args = CommandLine.arguments
guard args.count >= 2 else {
    fail("Usage: calendar-helper <operation> [json-params] [output-file]")
}

let operation = args[1]
var params: [String: Any] = [:]
if args.count >= 3, let data = args[2].data(using: .utf8) {
    params = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
}
if args.count >= 4 {
    outputPath = args[3]
}

requestAccess()

switch operation {
case "list":
    listCalendars()
case "events":
    let daysAhead = (params["days_ahead"] as? Int) ?? 0
    listEvents(daysAhead: daysAhead, calendarName: params["calendar"] as? String)
case "search":
    guard let query = params["query"] as? String else { fail("Missing 'query'") }
    searchEvents(query: query, daysAhead: (params["days_ahead"] as? Int) ?? 30, calendarName: params["calendar"] as? String)
case "read":
    guard let uid = params["event_uid"] as? String else { fail("Missing 'event_uid'") }
    readEvent(uid: uid, calendarName: params["calendar"] as? String)
case "create":
    guard let cal = params["calendar"] as? String else { fail("Missing 'calendar'") }
    guard let summary = params["summary"] as? String else { fail("Missing 'summary'") }
    guard let startDate = params["start_date"] as? String else { fail("Missing 'start_date'") }
    guard let endDate = params["end_date"] as? String else { fail("Missing 'end_date'") }
    createEvent(calendarName: cal, summary: summary, startStr: startDate, endStr: endDate,
                location: params["location"] as? String, description: params["description"] as? String,
                allDay: params["all_day"] as? Bool ?? false)
case "update":
    guard let uid = params["event_uid"] as? String else { fail("Missing 'event_uid'") }
    updateEvent(uid: uid, calendarName: params["calendar"] as? String,
                summary: params["summary"] as? String, startStr: params["start_date"] as? String,
                endStr: params["end_date"] as? String, location: params["location"] as? String,
                description: params["description"] as? String, allDay: params["all_day"] as? Bool)
case "delete":
    guard let uid = params["event_uid"] as? String else { fail("Missing 'event_uid'") }
    deleteEvent(uid: uid)
default:
    fail("Unknown operation: \(operation)")
}
