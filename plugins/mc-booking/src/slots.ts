import type { BookingConfig } from "./config.js";
import type { AppointmentStore } from "./store.js";

export interface Slot {
  time: string;
  available: boolean;
}

export function generateSlots(cfg: BookingConfig, store: AppointmentStore): Slot[] {
  const slots: Slot[] = [];
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + cfg.windowWeeks * 7);

  const startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() + 1);

  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  if (totalDays < 0) return slots;

  for (let dayOffset = 0; dayOffset <= totalDays; dayOffset++) {
    const cursor = new Date(startDate);
    cursor.setDate(startDate.getDate() + dayOffset);

    const dayOfWeek = cursor.getDay();
    const isoDow = dayOfWeek === 0 ? 7 : dayOfWeek;

    if (!cfg.availableDays.includes(isoDow)) continue;

    const dateStr = cursor.toISOString().split("T")[0];

    // Skip blocked dates
    if (cfg.blockedDates.includes(dateStr)) continue;

    const dayCount = store.countOnDate(dateStr);

    for (const hour of cfg.timeSlots) {
      const slotTime = new Date(cursor);
      slotTime.setUTCHours(hour, 0, 0, 0);

      if (slotTime <= now) continue;

      const isoTime = slotTime.toISOString();
      const hasConflict = store.hasConflict(isoTime);
      const atCapacity = dayCount >= cfg.maxPerDay;

      slots.push({
        time: isoTime,
        available: !hasConflict && !atCapacity,
      });
    }
  }

  return slots;
}
