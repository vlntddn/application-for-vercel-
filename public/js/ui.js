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
