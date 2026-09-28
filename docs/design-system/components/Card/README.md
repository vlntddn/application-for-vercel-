# Card

A bordered surface that groups one topic; when it is a link, the whole card is the tap target.

**Provide:** eyebrow (chapter number), title in the exam's own language, a sub line in the learner's language, and a ProgressBar. Titles are sentence case in `heading`, not uppercase (the source's all-caps titles were the hardest thing to scan).

**States:** rest (`shadow-sm`), hover (lifts 2px, `shadow-md`), press (drops onto its shadow), done (`ds-card--done`: `ok-soft` fill, `ok` border, a Mastered tag with a check).

**Do:** keep to one card per topic with one link; two columns from 760px, one on phones. **Don't:** nest cards, put a Button inside a link card, or use a coloured left border as an accent.

`ds-panel` is the larger sibling for grouped content (this week, the exam rules): `shadow-md`, 16px padding on phones, 24px from 760px.
