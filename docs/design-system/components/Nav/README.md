# Nav

The primary navigation: a five-tab bar fixed to the bottom on phones, a six-item bar in the masthead from 760px.

**Provide:** the destinations (Home, Theory, Practice, Exam, Mistakes; Settings joins from tablet up, and on phones lives behind a gear in the masthead), each with its icon and a label. The current page carries `aria-current="page"` and inverts to `ink` with `on-ink` text.

**Icons:** the source's set, 24px grid, 2.5px stroke, square caps (Home, Theory, Practice and Exam are copied from it; Mistakes and Settings are redrawn to match).

**Changes from the source:** labels are 12px (were 9.6px); the tab bar is 64px tall plus the safe-area inset; Settings leaves the phone bar so five targets each get at least 72px; the Mistakes tab shows the count of open mistakes in a `bad` badge.

**Do:** hide the bar during a quiz or exam so the answers own the bottom of the screen. **Don't:** add a sixth tab on phones or truncate labels.
