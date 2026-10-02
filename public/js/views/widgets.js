// Shared date widgets used by two or more screens (dashboard, stats).
// Extracted from stats.js (Sprint 2, T3) — pure code move, no behavior change.

/** Local calendar date as YYYY-MM-DD — matches how the domain stores days. */
export function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The last seven days, oldest first, marked with whether the user studied.
 * Week starts on Monday, as it does in Italy.
 */
export function weekStrip(activeDays = []) {
  const done = new Set(activeDays);
  const initials = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const todayKey = dayKey(new Date());
  const cells = [];
  for (let back = 6; back >= 0; back--) {
    const date = new Date();
    date.setDate(date.getDate() - back);
    const key = dayKey(date);
    // getDay(): 0 = Sunday, so shift to a Monday-first index.
    cells.push({
      key,
      label: initials[(date.getDay() + 6) % 7],
      studied: done.has(key),
      isToday: key === todayKey,
    });
  }
  return cells;
}
