export function taskWindow(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { now: now.toISOString(), start: start.toISOString(), end: end.toISOString() };
}

export function reminderTime(due: string, minutes: string) {
  const date = new Date(due);
  if (Number.isNaN(date.getTime())) throw new Error("Choose a valid date and time");
  if (!minutes) return null;
  const offset = Number(minutes);
  if (![15, 60, 1440].includes(offset)) throw new Error("Choose a valid reminder");
  return new Date(date.getTime() - offset * 60000).toISOString();
}

export function localDateTime(value: string) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
