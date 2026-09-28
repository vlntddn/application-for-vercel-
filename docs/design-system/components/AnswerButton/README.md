# AnswerButton

The two-way verdict on an exam statement: Vero on the left, Falso on the right, always in that order.

**Provide:** nothing but the pair. Both buttons are neutral at rest: `surface`, 3px `ink` border, `shadow-sm`, 72px tall, `button-lg` label with a check (Vero) or cross (Falso) icon. Neither is coloured, so the colour of a button never hints at the answer.

**After an answer:** the chosen button locks and shows a state. `ds-answer--ok` uses `ok-soft`, an `ok` border, a check and the word Correct. `ds-answer--bad` uses `bad-soft`, a `bad` border, a cross, the word Wrong and a hatched edge strip. When the learner was wrong, the other button gets `ds-answer--reveal` (dashed `ok` border, the words Right answer). Untouched buttons drop to `ink-muted`. Meaning is carried by icon, word and pattern as well as colour.

**Changes from the source:** Falso was solid red, which read as "wrong" before anyone answered; Vero was paper-white. Now they are symmetrical until feedback.

**Do:** put the pair in the bottom third of the screen on phones; support keys V and F on desktop. **Don't:** swap sides, colour a button before the answer, or shake the screen (use the state change and, if needed, a single 120ms press).
