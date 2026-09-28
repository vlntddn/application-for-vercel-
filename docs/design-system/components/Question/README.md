# Question

One exam statement with everything needed to judge it, in reading order: image (if any), statement, translation, verdict.

**Provide:** the statement in the exam's language (`question` style, 20/30, sentence case, never smaller); an optional image in `ds-question__media` (4:3, 3px `ink` border, max 220px tall); the learner's translation on demand; the AnswerButton pair. Keyboard hints (`ds-hints`) render only on devices with hover.

**Translation layer:** the Translate control is a dashed-border toggle, `aria-pressed` when on. The translation appears below the statement in a dashed `surface-sunken` block tagged with the language code, so it always looks like a helper and never like exam content. Default is off: learners read the exam language first.

**Changes from the source:** statement text sized up from 16px to 20px; translate button gets a 48px target; the pair moves to the thumb zone. The statement never turns uppercase.

**Do:** keep the statement, translation and pair in one column, 390px wide on phones and up to `content-max` on desktop. **Don't:** put the answer buttons above the statement, hide the statement behind the image, or auto-translate.
