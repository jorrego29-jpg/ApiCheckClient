export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** Lo que devuelven GET /workspaces y GET /workspaces/:id. */
export interface WorkspaceSummary extends Workspace {
  _count: { collections: number; environments: number };
}

export interface CreateWorkspaceDto {
  name: string;
}
