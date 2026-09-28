# WeekStrip

Seven day cells showing which of the last seven days met the daily goal, today last.

**Provide:** seven days ending today with a one-letter weekday under each, and an accessible name per cell ("Monday: goal met"). Done is an `accent` fill with a check in `on-accent`; today has a 3px border, a hard shadow and its letter in `accent-ink`; an empty past day is a plain `surface` cell; a future day is dashed in `ink-muted`.

**Changes from the source:** cells are 44px tall and share the row equally, so all seven fit on a 360px phone; letters are 12px (were 9.6px); done days show a check instead of relying on fill alone; today no longer uses an orange border on paper.

**Do:** pair it with the "5/7 days" Tag. **Don't:** colour missed days red; missing a day is not an error.
