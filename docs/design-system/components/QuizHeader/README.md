# QuizHeader

The top strip of a quiz: exit, position, and either a result counter (practice) or a countdown (exam).

**Provide:** Quit (ghost button), position as `mono` "12/30", then Tag (practice) or Timer (exam). The Timer is `mono-lg` on `surface`; in the last two minutes it turns `bad` (`ds-timer--low`), gains the words "2 min left" and keeps the clock icon, so urgency is not colour alone. Announce the low-time state once to screen readers; never re-announce every second.

**Question navigator (exam only):** a grid of 44px numbered squares. Current is `ink` fill; answered gets a 5px bar along the bottom and an `accent-soft` fill; flagged shows a corner triangle in `warn`. All three differ by shape, not only colour.

**Do:** make Quit ask for confirmation once an exam is under way. **Don't:** show the timer in practice mode, or shrink the navigator squares below 44px.
