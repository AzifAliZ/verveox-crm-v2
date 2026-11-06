import { describe, it, expect } from "vitest";
import { taskWindow, reminderTime } from "@/lib/followup";

describe("persistent follow-up timing", () => {
  it("includes already overdue tasks in due today", () => {
    const now = new Date(2026, 9, 29, 12);
    const w = taskWindow(now);
    expect(new Date(w.start).getHours()).toBe(0);
    expect(new Date(w.end).getDate()).toBe(30);
    expect(new Date(2026, 9, 29, 8).toISOString() >= w.start).toBe(true);
  });
  it("recalculates the reminder at the rescheduled time", () => {
    expect(reminderTime("2026-10-30T10:00:00Z", "60")).toBe("2026-10-30T09:00:00.000Z");
    expect(reminderTime("2026-11-01T10:00:00Z", "60")).toBe("2026-11-01T09:00:00.000Z");
  });
  it("does not request delivery when reminder is disabled", () => {
    expect(reminderTime("2026-10-30T10:00:00Z", "")).toBeNull();
  });
  it("rejects invalid timing", () => {
    expect(() => reminderTime("bad", "60")).toThrow();
    expect(() => reminderTime("2026-10-30T10:00:00Z", "-1")).toThrow();
  });
});
