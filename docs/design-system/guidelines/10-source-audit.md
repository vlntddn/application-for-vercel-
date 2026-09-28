# Source audit

What the original web app's design system contains, what this system keeps, and what it changes. Measured from the live app's stylesheet and rendered pages; values are exact unless marked approximate.

## What the original defines

| Area | Original value |
| --- | --- |
| Look | Neo-brutalist: hard 3px/2px `ink` borders, `6px 6px 0` and `3px 3px 0` hard shadows, radius 0 everywhere |
| Light theme | ink `#000000`, paper `#f4f1ea`, surface `#ffffff`, muted `rgba(0,0,0,.45)` |
| Dark theme | ink `#f4f1ea`, paper `#0c0c0c`, surface `#1a1a1a`, muted `rgba(244,241,234,.62)` |
| Signal colours | accent `#ff4d00`, ok `#00a651`, warn `#ffd000`, bad `#e4002b` |
| Heat map | five steps per theme, `#eceae3 → #ff4d00` (light), `#262626 → #ff4d00` (dark) |
| Type | Helvetica Neue / Arial stack, weight 900 uppercase for titles (41.6px, -0.02em), 600 for body, nav labels about 9.6px, tags about 10.4px |
| Layout | 760px breakpoint; bottom tab bar on phones, top bar on desktop; content column about 660px |
| Components | Masthead and wordmark, six-item nav, panel, card, stat, week strip, goal ring, heat map, tag, button, progress bar, quiz header, Vero/Falso answers, question navigator, timer, callout, dictionary and theory reader, footer notice, skip link |
| Good habits | Skip link, `prefers-reduced-motion`, visible focus, keyboard shortcuts (V, F, T), local-first privacy note |

## What this system keeps

The neo-brutalist DNA is the product's personality and is kept whole: `paper`/`ink`/`surface`, the `accent` orange as a brand fill, the two border weights, hard offset shadows that sink on press, square corners, the week strip, goal ring and heat map, the question-first quiz layout, the shortcut keys, and the local-first message.

## What it changes, and why

| # | Finding in the original | Measured | Change |
| --- | --- | --- | --- |
| 1 | Secondary text is `rgba(0,0,0,.45)` on paper | 3.3:1 (needs 4.5) | `ink-muted`, a solid colour: 7.0:1 light, 9.0:1 dark |
| 2 | Primary button is white text on `#ff4d00` | 3.3:1 | `on-accent` black: 6.3:1 |
| 3 | Orange used as text on paper (streak numeral, today's label, second word of the wordmark) | 2.9:1 | `accent-ink`: 5.1:1 light; orange stays a fill |
| 4 | Green `#00a651` and red `#e4002b` tell correct from wrong; green on paper | 2.8:1 and 4.3:1; the pair differs by hue only (1.5:1) | `ok` is a blue-teal, `bad` a crimson, both above 5.5:1, and every state has an icon, a word and a pattern |
| 5 | Accent orange and error red sit in the same hue family, so the primary button reads like an error | qualitative | Orange means "do this", crimson means "went wrong"; different hue, different icon |
| 6 | The Falso button is solid red before any answer; Vero is paper-white | qualitative | Both are neutral until feedback; the colour never hints at the answer |
| 7 | Everything is uppercase at weight 600-900, including instructions and exam rules | qualitative | Uppercase only for labels, buttons and titles; body, questions and explanations in sentence case |
| 8 | Text as small as 9.6-10.4px (nav, tags, week letters, hints, footer) | below 12px | 12px floor (`label-sm`, `kbd`); nav labels and tags now 12px |
| 9 | The privacy footer is fixed to the bottom | collides with the mobile tab bar | Dismissible `ds-notice`, never fixed |
| 10 | Helvetica Neue is not present on Android or Windows | falls back to Arial or Segoe UI | Onest webfont (Latin and Cyrillic) so Italian and translations look the same everywhere |
| 11 | Hover turns buttons yellow | yellow already means warning | Hover lifts 1px and fills `surface-sunken` |
| 12 | Focus ring is the orange accent | invisible on orange buttons | Solid `focus` blue, 3px, 3px offset |
| 13 | Six tabs on a phone bar | six targets share one bar | Five tabs; Settings behind a gear on phones |
| 14 | A wrong answer shows a counter and a shake | not inspected further | New Feedback panel with the right answer and the reason (see `Feedback`) |

Item 14 comes from the stylesheet only: I did not answer questions in the live app so as not to change its stored progress. If an explanation panel already exists, treat Feedback as a restyle.

One behaviour to check in the app itself: opening `#/settings` did not render a Settings screen in my run; it kept showing the previous page. It may be a hash-routing edge case.

## Intentional additions to the original inventory

`Wordmark` (needed so the product name can change without touching anything else), `Feedback` (the learning moment the original lacks), and the `ds-notice` strip inside `Callout`. Everything else in the component list is a family the original already has.
