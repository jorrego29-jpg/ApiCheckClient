import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  CreateEnvironmentDto,
  CreateVariableDto,
  Environment,
  UpdateEnvironmentDto,
  UpdateVariableDto,
  Variable,
} from '../models';
import { API_URL } from './api-url.token';

@Injectable({ providedIn: 'root' })
export class EnvironmentsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_URL)}/environments`;

  list(workspaceId: string) {
    const params = new HttpParams().set('workspaceId', workspaceId);
    return this.http.get<Environment[]>(this.baseUrl, { params });
  }

  get(id: string) {
    return this.http.get<Environment>(`${this.baseUrl}/${id}`);
  }

  create(dto: CreateEnvironmentDto) {
    return this.http.post<Environment>(this.baseUrl, dto);
  }

  update(id: string, dto: UpdateEnvironmentDto) {
    return this.http.put<Environment>(`${this.baseUrl}/${id}`, dto);
  }

  remove(id: string) {
    return this.http.delete<Environment>(`${this.baseUrl}/${id}`);
  }

  // --- Variables ---
  addVariable(environmentId: string, dto: CreateVariableDto) {
    return this.http.post<Variable>(`${this.baseUrl}/${environmentId}/variables`, dto);
  }

  updateVariable(variableId: string, dto: UpdateVariableDto) {
    return this.http.put<Variable>(`${this.baseUrl}/variables/${variableId}`, dto);
  }

  removeVariable(variableId: string) {
    return this.http.delete<Variable>(`${this.baseUrl}/variables/${variableId}`);
  }
}
