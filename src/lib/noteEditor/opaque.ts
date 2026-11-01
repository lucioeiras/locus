import { schemaCtx } from '@milkdown/kit/core';
import type { MarkSchema, NodeSchema, MarkdownNode } from '@milkdown/kit/transformer';
import { $node, $remark } from '@milkdown/kit/utils';

// Keep unsupported AST fragments as literal, non-executable Markdown. Raw block
// HTML gets a block node as well: putting it in an inline-only node can drop it
// when it occurs next to lists or other block content.
export const opaqueBlock = $node('locus_opaque_block', () => ({
  group: 'block',
  atom: true,
  isolating: true,
  attrs: { value: { default: '' } },
  toDOM: (node) => ['pre', { 'data-opaque-markdown': '' }, node.attrs.value],
  parseDOM: [
    { tag: 'pre[data-opaque-markdown]', getAttrs: (dom) => ({ value: dom.textContent ?? '' }) },
  ],
  parseMarkdown: {
    match: (node) => node.type === 'locus_opaque_block',
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'locus_opaque_block',
    runner: (state, node) => {
      state.addNode('html', undefined, node.attrs.value);
    },
  },
}));

export const preserveOpaque = $remark('locus-preserve-opaque', (ctx) => () => (tree, file) => {
  const schema = ctx.get(schemaCtx);
  const specs = Object.values({ ...schema.nodes, ...schema.marks }).map(
    (type) => type.spec as NodeSchema | MarkSchema
  );
  type Ast = MarkdownNode & { children?: Ast[] };
  const source = String(file);
  const visit = (parent: Ast) => {
    if (!parent.children) return;
    parent.children = parent.children.map((node) => {
      if (
        (parent.type === 'root' && node.type === 'html') ||
        !specs.some((spec) => spec.parseMarkdown?.match(node))
      ) {
        const from = node.position?.start.offset;
        const to = node.position?.end.offset;
        if (from === undefined || to === undefined)
          throw new Error('Unsupported Markdown without source position');
        const value = source.slice(from, to);
        // Unknown inline fragments can use CommonMark's safe literal HTML atom.
        return { type: parent.type === 'root' ? 'locus_opaque_block' : 'html', value };
      }
      visit(node);
      return node;
    });
  };
  visit(tree as Ast);
});
