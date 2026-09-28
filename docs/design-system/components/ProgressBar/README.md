# ProgressBar

A 16px outlined track with a fill and, always, the percentage beside it.

**Provide:** a value 0-100, an accessible name (`aria-label`, `role="progressbar"` with `aria-valuenow`), and the number in `ds-meter__val`. At 0% render no fill element, so no stray divider shows.

**Colour:** `accent` fill for work in progress, `ds-bar--ok` for mastered or finished. The fill's right edge carries a 2px `ink` divider; the track is `surface-sunken` with a 2px `ink` border.

**Do:** pair with a meta line ("531 questions · mastered 0%"). **Don't:** show the bar without the number, animate it over 300ms, or use it for the exam timer (use Timer).
