import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { CreateWorkspaceDto, Workspace, WorkspaceSummary } from '../models';
import { API_URL } from './api-url.token';

@Injectable({ providedIn: 'root' })
export class WorkspacesApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_URL)}/workspaces`;

  list() {
    return this.http.get<WorkspaceSummary[]>(this.baseUrl);
  }

  get(id: string) {
    return this.http.get<WorkspaceSummary>(`${this.baseUrl}/${id}`);
  }

  create(dto: CreateWorkspaceDto) {
    return this.http.post<Workspace>(this.baseUrl, dto);
  }
}
