# Field

Form controls for Settings: text input, select, segmented control and switch, all 48px or taller with 3px `ink` borders.

**Provide:** a visible label above every control (uppercase 13px), an optional hint in `ink-muted`, and for errors a message with an icon. Error fields use a `bad` border, a `bad-soft` fill and the message text, so the state does not rest on colour.

**Segmented control:** for two to four exclusive choices (theme, translation language mode). The selected option inverts to `ink` and shows a check. **Switch:** the label always states the current value ("Daily reminder: on"); on is an `accent` track with a square knob on the right.

**Focus:** every control shows the system's 3px `focus` outline with a 3px offset.

**Do:** use a native select for long lists such as languages (right-to-left scripts included). **Don't:** use placeholder text as a label, or make a switch smaller than 60 x 34px.
