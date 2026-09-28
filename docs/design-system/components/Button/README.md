# Button

The single tappable action: one primary per screen, everything else default or ghost.

**Provide:** a verb-first label (`Begin exam`, `Next question`), set uppercase by the class; an optional leading or trailing icon from the icon set; `ds-btn--block` for a full-width thumb-zone action.

**Variants:** `ds-btn--primary` (`accent` fill, `on-accent` text, 6.3:1) for the one main action; default (`surface`) for alternatives; `ds-btn--ghost` for low-emphasis actions with an underlined label; `ds-btn--danger` (`bad` border and text) for destructive actions, which always ask for confirmation. `ds-btn--lg` is 56px tall for the action that ends a step.

**Behaviour:** hover lifts 1px; press moves it 3px onto its shadow and removes the shadow. Disabled drops to `surface-sunken` with `ink-muted` text and no shadow, and says why in a nearby hint.

**Do:** keep every button at least 48px tall and wide (`tap-min`); put the primary action in the bottom third of a phone. **Don't:** use white text on orange (the source did, 3.3:1), use yellow hover (yellow means warning), or place two primaries side by side.
