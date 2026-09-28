# Wordmark

The product name set in type with one accent square, used in the masthead, splash and store listing until a logo exists.

**Provide:** `name` (one word, set uppercase by the class), optional tagline. The square (`accent` fill, 2px `ink` outline) is part of the mark; it always follows the last letter.

**Sizes:** `--sm` (22px) for the mobile masthead, default (32px) for the desktop masthead, `--lg` (56px) for splash and sign-in.

**Do:** keep `ink` for the name and `ink-muted` for the tagline; leave clear space of one square on all sides. **Don't:** recolour the name with `accent` (2.9:1 on `paper`), split it over two lines, or add a second word in orange as the source did.

**Renaming:** change the string only. No token, component or layout depends on the name.
