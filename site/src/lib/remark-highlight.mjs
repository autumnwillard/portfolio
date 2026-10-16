// Turns `==text==` inside Markdown/MDX text nodes into <mark class="hl">text</mark>,
// the same markup the <Highlight> component renders.
const PATTERN = /==([^=]+?)==/g;

function markNode(value, isMdx) {
  if (isMdx) {
    return {
      type: 'mdxJsxTextElement',
      name: 'mark',
      attributes: [{ type: 'mdxJsxAttribute', name: 'class', value: 'hl' }],
      children: [{ type: 'text', value }],
    };
  }
  return {
    type: 'emphasis', // placeholder type, rendered via hName below
    data: { hName: 'mark', hProperties: { className: ['hl'] } },
    children: [{ type: 'text', value }],
  };
}

function walk(node, isMdx) {
  if (!node.children) return;
  const next = [];
  for (const child of node.children) {
    if (child.type === 'text' && child.value.includes('==')) {
      let last = 0;
      PATTERN.lastIndex = 0;
      let m;
      while ((m = PATTERN.exec(child.value))) {
        if (m.index > last) next.push({ type: 'text', value: child.value.slice(last, m.index) });
        next.push(markNode(m[1], isMdx));
        last = m.index + m[0].length;
      }
      if (last < child.value.length) next.push({ type: 'text', value: child.value.slice(last) });
    } else {
      walk(child, isMdx);
      next.push(child);
    }
  }
  node.children = next;
}

export default function remarkHighlight() {
  return (tree, file) => {
    const isMdx = String(file?.path ?? file?.history?.[0] ?? '').endsWith('.mdx');
    walk(tree, isMdx);
  };
}
