import { TreeNode } from 'primeng/api';
import { CollectionTree, FolderNode, SavedRequest } from '../../core/models';

export type NodeKind = 'collection' | 'folder' | 'request';

export interface NodeData {
  kind: NodeKind;
  id: string;
  collectionId: string;
  /** Solo en peticiones: etiqueta del método ('GET', 'SOAP', …). */
  badge?: string;
  /** Solo en peticiones: protocolo, para colorear la etiqueta. */
  protocol?: SavedRequest['protocol'];
}

export type ExplorerNode = TreeNode<NodeData>;

export const nodeKey = (kind: NodeKind, id: string) => `${kind}:${id}`;

/**
 * Convierte los árboles del backend en nodos de `p-tree`. Todo aparece desplegado salvo lo que
 * el usuario haya plegado (`collapsed`, por clave de nodo), para que sobreviva a las recargas.
 */
export function buildNodes(
  trees: readonly CollectionTree[],
  collapsed: ReadonlySet<string>,
): ExplorerNode[] {
  return trees.map((tree) => {
    const key = nodeKey('collection', tree.id);
    return {
      key,
      label: tree.name,
      expanded: !collapsed.has(key),
      data: { kind: 'collection', id: tree.id, collectionId: tree.id },
      children: [
        ...tree.folders.map((folder) => folderNode(folder, collapsed)),
        ...tree.requests.map(requestNode),
      ],
    };
  });
}

function folderNode(folder: FolderNode, collapsed: ReadonlySet<string>): ExplorerNode {
  const key = nodeKey('folder', folder.id);
  return {
    key,
    label: folder.name,
    expanded: !collapsed.has(key),
    data: { kind: 'folder', id: folder.id, collectionId: folder.collectionId },
    children: [
      ...folder.children.map((child) => folderNode(child, collapsed)),
      ...folder.requests.map(requestNode),
    ],
  };
}

function requestNode(request: SavedRequest): ExplorerNode {
  return {
    key: nodeKey('request', request.id),
    label: request.name,
    leaf: true,
    data: {
      kind: 'request',
      id: request.id,
      collectionId: request.collectionId,
      protocol: request.protocol,
      badge: request.protocol === 'SOAP' ? 'SOAP' : (request.method ?? 'GET'),
    },
  };
}

export function findNode(nodes: readonly ExplorerNode[], key: string): ExplorerNode | null {
  for (const node of nodes) {
    if (node.key === key) return node;
    const inside = node.children ? findNode(node.children, key) : null;
    if (inside) return inside;
  }
  return null;
}
