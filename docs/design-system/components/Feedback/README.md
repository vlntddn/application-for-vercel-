# Feedback

The panel that appears under the answers once a verdict is given: what happened, why, and the next step.

**Provide:** heading with icon (Correct / Not quite), on a wrong answer the right answer in words, a one-to-two-sentence reason that names the trigger word (`sempre`, `mai`, `solo`, `deve`, `può`), and the next action. `role="status"` announces it to screen readers.

**Colour:** `ds-feedback--ok` (`ok-soft` fill, `ok` border and heading) or `ds-feedback--bad` (`bad-soft`, `bad`). Body text stays `ink` (17:1). The heading is the word plus icon, never colour alone. Wrong answers offer Save to mistakes beside the primary Next.

**Intentional addition:** the source only shows a "correct" counter and a shake, so a wrong answer teaches nothing. This panel is the biggest learning improvement in the system.

**Do:** focus the Next button when the panel appears; let Enter, Space or a swipe advance. **Don't:** auto-advance, or hide the explanation behind a tap.
