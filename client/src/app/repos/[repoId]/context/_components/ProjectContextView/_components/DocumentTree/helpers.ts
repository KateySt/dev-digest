import type { SpecFile } from "@/lib/types";

export interface TreeNode {
  /** Path segment name — a folder name, or the filename for a leaf. */
  name: string;
  /** Repo-relative path up to and including this node. */
  path: string;
  isFile: boolean;
  children?: TreeNode[];
  doc?: SpecFile;
}

/** Groups a flat repo-relative document list into a folder tree, GitHub-sidebar
 *  style — one node per path segment, folders before files, alphabetical
 *  within each level, so a long shared prefix (`docs/agent-prompts/skills/…`)
 *  is shown once as nested folders instead of repeated on every row. */
export function buildDocumentTree(documents: SpecFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const doc of documents) {
    const parts = doc.path.split("/");
    let level = root;
    let acc = "";
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part;
      const isFile = i === parts.length - 1;
      let node = level.find((n) => n.name === part && n.isFile === isFile);
      if (!node) {
        node = { name: part, path: acc, isFile, children: isFile ? undefined : [], doc: isFile ? doc : undefined };
        level.push(node);
      }
      if (!isFile) level = node.children!;
    });
  }

  sortTree(root);
  return root;
}

function sortTree(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  for (const n of nodes) {
    if (n.children) sortTree(n.children);
  }
}

/** Every folder path that has a descendant matching `predicate` — used to
 *  auto-expand the path down to the selected document without expanding
 *  unrelated branches. */
export function foldersContaining(nodes: TreeNode[], predicate: (n: TreeNode) => boolean): Set<string> {
  const hit = new Set<string>();

  function walk(list: TreeNode[]): boolean {
    let found = false;
    for (const n of list) {
      const self = predicate(n);
      const child = n.children ? walk(n.children) : false;
      if (self || child) {
        found = true;
        if (!n.isFile) hit.add(n.path);
      }
    }
    return found;
  }

  walk(nodes);
  return hit;
}
