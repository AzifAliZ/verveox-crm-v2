export function campaignSnapshot(
  selectedId: string | null,
  previousId: string | null,
  previousSnapshot: string | null,
  selectedName?: string,
) {
  if (selectedId === previousId) return previousSnapshot ?? selectedName ?? null;
  return selectedId ? (selectedName ?? null) : null;
}

export function activityDescription(raw: string | null) {
  if (!raw) return "";
  try {
    const changes = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(changes)
      .map(([key, value]) => {
        const label = key.replaceAll("_", " ");
        if (value && typeof value === "object" && "new" in value) {
          const change = value as { old?: unknown; new: unknown };
          return "old" in change
            ? `${label}: ${change.old ?? "—"} → ${change.new ?? "—"}`
            : `${label}: ${change.new ?? "—"}`;
        }
        return `${label}: ${value ?? "—"}`;
      })
      .join("\n");
  } catch {
    return raw;
  }
}
