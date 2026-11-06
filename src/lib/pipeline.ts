import type { Stage } from "@/lib/crm";

/** A stage move must never change classification or priority. */
export function stagePatch(stage: Stage) {
  return { stage };
}

export function validThresholds(warm: number, hot: number) {
  return Number.isInteger(warm) && Number.isInteger(hot) && warm >= 0 && hot <= 100 && warm < hot;
}

export function validPoints(points: number) {
  return Number.isInteger(points) && points >= -100 && points <= 100;
}
