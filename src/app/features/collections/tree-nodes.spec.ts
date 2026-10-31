import { CollectionTree, FolderNode, SavedRequest } from '../../core/models';
import { buildNodes, findNode, nodeKey } from './tree-nodes';

const request = (id: string, overrides: Partial<SavedRequest> = {}): SavedRequest => ({
  id,
  name: `R ${id}`,
  protocol: 'REST',
  method: 'GET',
  url: '',
  headers: null,
  queryParams: null,
  body: null,
  auth: null,
  soapAction: null,
  wsdlUrl: null,
  collectionId: 'c1',
  folderId: null,
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

const folder = (id: string, overrides: Partial<FolderNode> = {}): FolderNode => ({
  id,
  name: `F ${id}`,
  collectionId: 'c1',
  parentId: null,
  createdAt: '',
  requests: [],
  children: [],
  ...overrides,
});

const collection: CollectionTree = {
  id: 'c1',
  name: 'Mi API',
  workspaceId: 'w1',
  createdAt: '',
  folders: [
    folder('f1', {
      requests: [request('r1', { method: 'POST', folderId: 'f1' })],
      children: [folder('f2', { parentId: 'f1', requests: [request('r2', { folderId: 'f2' })] })],
    }),
  ],
  requests: [request('r3', { protocol: 'SOAP', method: null })],
};

describe('buildNodes', () => {
  it('builds collection > folders > requests, with folders before requests', () => {
    const [root] = buildNodes([collection], new Set());

    expect(root.label).toBe('Mi API');
    expect(root.children?.map((n) => n.key)).toEqual(['folder:f1', 'request:r3']);
    expect(root.children?.[0].children?.map((n) => n.key)).toEqual(['folder:f2', 'request:r1']);
  });

  it('labels requests with their method, or SOAP', () => {
    const nodes = buildNodes([collection], new Set());

    expect(findNode(nodes, 'request:r1')?.data?.badge).toBe('POST');
    expect(findNode(nodes, 'request:r3')?.data?.badge).toBe('SOAP');
  });

  it('marks requests as leaves and carries the ids needed to act on them', () => {
    const node = findNode(buildNodes([collection], new Set()), 'request:r2');

    expect(node?.leaf).toBe(true);
    expect(node?.data).toMatchObject({ kind: 'request', id: 'r2', collectionId: 'c1' });
  });

  it('expands everything except what the user collapsed', () => {
    const nodes = buildNodes([collection], new Set([nodeKey('folder', 'f1')]));

    expect(findNode(nodes, 'collection:c1')?.expanded).toBe(true);
    expect(findNode(nodes, 'folder:f1')?.expanded).toBe(false);
    expect(findNode(nodes, 'folder:f2')?.expanded).toBe(true);
  });

  it('returns no nodes when there are no collections', () => {
    expect(buildNodes([], new Set())).toEqual([]);
  });
});

describe('findNode', () => {
  it('returns null for an unknown key', () => {
    expect(findNode(buildNodes([collection], new Set()), 'request:nope')).toBeNull();
  });
});
