import { NodeType, SyntaxNode, Tree } from "@lezer/common";

interface SimpleNode {
  node: NodeType;
  children?: SimpleNode[];
  raw?: string;
}

export function simpleNode(node: SyntaxNode, source: string): SimpleNode {
  let raw: string | undefined = undefined;
  if (!node.firstChild) {
    raw = source.slice(node.from, node.to);
  }

  const children: SimpleNode[] = [];
  for (let c = node.firstChild; c; c = c.nextSibling) {
    children.push(simpleNode(c, source));
  }

  return {
    node: node.type,
    ...(children.length ? { children } : {}),
    ...(raw ? { raw } : {}),
  };
}

export function simpleTree(tree: Tree, source: string): SimpleNode {
  return simpleNode(tree.topNode, source);
}
