import { CollectionTree, FolderNode, SavedRequest } from '../models';

/** Busca una petición en los árboles cargados, a cualquier profundidad. */
export function findRequest(trees: readonly CollectionTree[], id: string): SavedRequest | null {
  for (const tree of trees) {
    const inRoot = tree.requests.find((request) => request.id === id);
    if (inRoot) return inRoot;
    for (const folder of tree.folders) {
      const inFolder = findInFolder(folder, id);
      if (inFolder) return inFolder;
    }
  }
  return null;
}

function findInFolder(folder: FolderNode, id: string): SavedRequest | null {
  const own = folder.requests.find((request) => request.id === id);
  if (own) return own;
  for (const child of folder.children) {
    const inChild = findInFolder(child, id);
    if (inChild) return inChild;
  }
  return null;
}
