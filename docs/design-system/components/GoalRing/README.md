# GoalRing

A 112px ring showing today's questions against the daily goal, with the numbers in the centre.

**Provide:** current count, goal, and an accessible name ("12 of 20 questions today"). The ring is an `ink` outline, a `surface-sunken` track and an `accent` arc from twelve o'clock clockwise; the outline is what carries the 3:1 boundary, since `accent` on `paper` is 2.9:1.

**Do:** show the numbers as text and let the arc be the secondary cue; swap the sub line for "Goal met" at 20/20. **Don't:** animate longer than 400ms, or use the ring for anything except the daily goal.
