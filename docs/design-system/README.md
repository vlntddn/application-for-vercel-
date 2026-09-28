Passo is a driving-theory trainer: short, honest, a little loud. The system is neo-brutalist on purpose: hard borders, hard shadows, square corners, one hot orange. It borrows the confidence of a road sign and spends it on being readable. Passo is a working name; the product name is one string in the Wordmark and nothing else depends on it.

## Content fundamentals

Write like a coach who wants you to pass: direct, warm, never cute. Use "you", short sentences, and a verb first on every button. Real copy from the product to imitate: "Ready for the exam? Keep the streak alive." · "Read the Italian first — translate only when stuck." · "You have not answered a question yet. Start with practice: 20 questions on a topic you pick — about 5 minutes." · "No mistakes to review. Nice work."

Set body copy, questions, explanations and helper text in sentence case. Reserve UPPERCASE for the short things the type styles mark as uppercase: `display-xl`, `display-l`, `title`, `label`, `label-sm`, `button`, `button-lg`. Never set a full sentence in uppercase (the original did, which made long copy hard to scan).

Keep the exam's language exam-only. Statements, chapter titles and the trigger words `sempre`, `mai`, `solo`, `deve`, `può` stay in the target language and are never rewritten. Everything around them (buttons, hints, feedback, settings) speaks the learner's language. Translation is a layer the learner asks for (`Question`), never the default.

Say what happened and what to do next in the same breath: "Not quite. Right answer: Falso. The word solo makes it absolute." Never scold, never use exclamation marks, no emoji. A missed day is not an error; a wrong answer is information. Numbers are digits ("20 questions", "3 errors", "18:42").

## Visual foundations

**Colour.** Two themes, `light` first, `dark` second; every colour is a token that changes with the theme. Set the page in `paper`, put cards, panels, inputs and the tab bar on `surface`, and sink tracks and translation blocks into `surface-sunken`. Text is `ink`; secondary text is `ink-muted`. The brand orange `accent` is a fill: primary button, done cells, progress fill, heat-map peak. Text on it is always `on-accent`. When orange must be text or a line on paper, use `accent-ink`. Yellow `warn` fills guides and warnings with `on-warn` text; `warn-ink` is its text form. Answer states use `ok` and `bad` with their `-soft` backgrounds: `ok` is a blue-teal so it stays distinct from `bad` for red-green colour-blind learners, and both always appear with an icon and a word. Never use `accent` and `bad` for each other's jobs: orange means "do this", crimson means "this went wrong".

**Type.** Onest for everything readable (it carries Latin and Cyrillic, so translations render in the same voice), IBM Plex Mono for numerals, counters and keyboard hints. Use `question` (20/30) for the statement being judged, `body` (16/24) for running text, `body-sm` (14/20, `ink-muted`) for meta, `label` and `label-sm` (uppercase) for eyebrows and tags, `button` and `button-lg` for actions, `display-xl`, `display-l` and `title` for numbers and screen titles, `mono-lg` for the exam clock. The floor is 12px (`label-sm`, `kbd`). Never go below it. Do not add weights or sizes outside the styles.

**Borders and shadows.** Every container has a `border-3` (3px) `ink` border; small parts (tags, tracks, week cells, dividers) use `border-2`. Raised things carry a hard, zero-blur offset shadow in `ink`: `shadow-sm` (3px) at rest for buttons, cards and answer buttons, `shadow-md` (6px) for panels, hovered cards and the feedback panel. Pressing removes the shadow and moves the element 3px down and right, so it sinks onto its shadow. Corners are `radius-none`; the only exceptions are `radius-xs` on keyboard hints and `radius-full` on dots and ring caps.

**Spacing and layout.** Build from the `space-*` scale on a 4px base. Phones use a 16px (`space-4`) gutter and one column; from 760px the gutter is 24px (`space-6`), cards go two-up, the reading column stops at `content-max` (720px), and the tab bar moves to the top. Every touch target is at least `tap-min` (48px). Put the main action and the answer buttons in the bottom third of a phone; keep the tab bar `nav-h` (64px) tall plus the safe-area inset, and hide it during a quiz. Leave `space-16` under scrolling content so nothing hides behind the bar.

**Focus and states.** Every interactive element shows a solid 3px `focus` outline with a 3px offset; never remove it. Hover lifts 1-2px; press sinks; disabled uses `surface-sunken`, `ink-muted` text, no shadow. Selected is an `ink` fill with `on-ink` text plus a check. State is never colour alone: pair `ok` with a check and the word, `bad` with a cross, the word and a hatch, flagged with a corner mark.

**Motion.** Keep it physical and short: 80ms for press and hover, at most 300ms for a progress fill or ring. No shakes, bounces or confetti. Honour `prefers-reduced-motion`: the base class turns all transitions off.

**Imagery.** Road-sign images are content, not decoration: show them in a `border-3` frame at 4:3 on `surface`, never cropped, never recoloured. There is no illustration or mascot. The product mark is the Wordmark until a logo is commissioned.

## Iconography

One icon family, drawn in the product's own style: 24px grid, 2.5px stroke, square line caps, `currentColor`, no fill. Size 24px in navigation and buttons, 28px inside answer buttons, 14-20px inside tags and cells. The set: home, book, target, timer, x-circle, sliders, check, cross, arrow, back, triangle-alert, bulb, translate, info. Home, book, target and timer are copied from the original; the rest are drawn to match. Use an icon only with a label or an accessible name. No emoji and no icon fonts.

## Accessibility

Meet 4.5:1 for text and 3:1 for borders, focus rings and meaningful icons in both themes; the token usage notes name the ground each text colour reads on. Name every non-text control, give progress bars `role="progressbar"` with values, announce feedback with `role="status"`, and never re-announce the countdown each second. Support keyboard play on desktop (V, F, T, Enter) and honour system text size up to 200% by using `rem`-safe wrapping rather than fixed heights on text.

## Markets and languages

The system is built to travel. Chrome, tokens and components are market-neutral; only content changes. A new market supplies: the exam's language and question bank, its pass rule (for Italy: 30 statements, 20 minutes, at most 3 errors), its road-sign images, and its verdict pair. Vero/Falso is a two-button `AnswerButton`; a market with multiple-choice questions uses the same button in a stacked list with `ds-answer` states unchanged. Keep the pair or list order fixed within a market. Right-to-left interface languages mirror layout and arrows, keep numerals and timers left-to-right, and reuse every component as is. Set the fallback font stack for scripts Onest does not cover (Arabic, Devanagari, CJK); the token stack already ends in `system-ui`.
