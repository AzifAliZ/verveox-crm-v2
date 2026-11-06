import { expect, it } from "vitest";
import { campaignSnapshot } from "../lib/lead-attribution";
it("preserves the original campaign snapshot during an unrelated edit", () => {
  expect(
    campaignSnapshot("campaign-a", "campaign-a", "Original campaign", "Renamed campaign"),
  ).toBe("Original campaign");
});
it("clears the snapshot when campaign attribution is deliberately removed", () => {
  expect(campaignSnapshot(null, "campaign-a", "Original campaign")).toBeNull();
});
it("records the newly selected campaign when attribution is deliberately changed", () => {
  expect(campaignSnapshot("campaign-b", "campaign-a", "Original campaign", "New campaign")).toBe(
    "New campaign",
  );
});
