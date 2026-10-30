export interface Variable {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  environmentId: string;
}

export interface Environment {
  id: string;
  name: string;
  isGlobal: boolean;
  workspaceId: string;
  variables: Variable[];
}

export interface CreateVariableDto {
  key: string;
  value: string;
  enabled?: boolean;
}

export interface CreateEnvironmentDto {
  name: string;
  workspaceId: string;
  isGlobal?: boolean;
  variables?: CreateVariableDto[];
}

export interface UpdateEnvironmentDto {
  name?: string;
  isGlobal?: boolean;
}

export interface UpdateVariableDto {
  key?: string;
  value?: string;
  enabled?: boolean;
}
