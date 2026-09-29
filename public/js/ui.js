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
