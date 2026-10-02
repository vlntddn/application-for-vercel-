/** Tiny DOM builder: el('div.card', {onclick}, child, ...) — text children are escaped by the DOM. */
export function el(spec, attrs = {}, ...children) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value);
    } else if (key in node && key !== 'list') {
      node[key] = value;
    } else {
      node.setAttribute(key, value);
    }
  }
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

export function clear(root, ...children) {
  root.replaceChildren(...children.filter((c) => c !== null && c !== undefined));
}

/** S2.8: inline SVG glyph (check / cross) built via createElementNS. */
export function svgIcon(kind) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ic');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svgNS, 'path');
  const d = kind === 'check'
    ? 'M4 12.5l5 5 11-11'
    : kind === 'warn'
      ? 'M12 4L2.5 20h19L12 4zm0 5.5v4.5m0 3v.5'
      : kind === 'grid'    // practice by topic
        ? 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z'
      : kind === 'book'    // theory
        ? 'M5 4.5h9a3 3 0 013 3v12H8a3 3 0 00-3 3z'
        : kind === 'chart' // stats
        ? 'M5 20v-7M12 20V6M19 20v-4M3.5 20.5h17'
        : kind === 'star'  // language of the exam
        ? 'M12 4l2.2 4.8 5.3.6-4 3.5 1.1 5.2-4.6-2.8-4.6 2.8 1.1-5.2-4-3.5 5.3-.6z'
        : kind === 'hash'  // the numbers
        ? 'M9 4.5L7 19.5M17 4.5l-2 15M5 9.5h15M4 14.5h15'
        : 'M6 6l12 12M18 6L6 18';
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

export function fmtTime(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString();
}

export function titleCase(name) {
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
}
