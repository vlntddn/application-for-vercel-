# Heatmap

A 13-week by 7-day grid of 14px cells coloured by how many questions were answered that day, five levels from `heat-0` to `heat-4`.

**Provide:** one value 0-4 per day (thresholds 0, 1-5, 6-10, 11-19, goal met), a title on each cell, a legend, and a text summary ("62 active days") because the grid itself is decoration for screen readers.

**Do:** scroll horizontally inside its container on narrow screens; keep level 0 outlined in `line-soft` so empty days still read as cells. **Don't:** use it as the only place a streak or goal is shown, or add a hover-only tooltip on touch devices (use the summary line).
