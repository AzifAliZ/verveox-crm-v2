import { describe, expect, it } from "vitest";
import { stagePatch, validThresholds, validPoints } from "@/lib/pipeline";

describe("independent pipeline and scoring configuration", () => {
  it("a move only updates stage, preserving temperature and priority", () => {
    expect({
      temperature: "warm",
      priority: "urgent",
      score: 45,
      ...stagePatch("qualified"),
    }).toEqual({ stage: "qualified", temperature: "warm", priority: "urgent", score: 45 });
    expect(Object.keys(stagePatch("new"))).toEqual(["stage"]);
  });
  it("accepts 35/70 thresholds and rejects overlapping or out-of-range thresholds", () => {
    expect(validThresholds(35, 70)).toBe(true);
    expect(validThresholds(70, 70)).toBe(false);
    expect(validThresholds(-1, 70)).toBe(false);
    expect(validThresholds(35, 101)).toBe(false);
  });
  it("accepts bounded integer scoring points", () => {
    expect(validPoints(25)).toBe(true);
    expect(validPoints(-10)).toBe(true);
    expect(validPoints(101)).toBe(false);
    expect(validPoints(2.5)).toBe(false);
  });
});
