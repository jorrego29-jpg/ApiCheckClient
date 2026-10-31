import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { HistoryDetail, HistoryEntry } from '../models';
import { API_URL } from './api-url.token';

export interface HistoryQuery {
  workspaceId?: string; // solo las ejecuciones de peticiones de ese workspace
  requestId?: string;
  limit?: number; // el backend usa 50 por defecto y 200 como máximo
}

@Injectable({ providedIn: 'root' })
export class HistoryApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_URL)}/history`;

  list(query: HistoryQuery = {}) {
    let params = new HttpParams();
    if (query.workspaceId) params = params.set('workspaceId', query.workspaceId);
    if (query.requestId) params = params.set('requestId', query.requestId);
    if (query.limit !== undefined) params = params.set('limit', query.limit);
    return this.http.get<HistoryEntry[]>(this.baseUrl, { params });
  }

  get(id: string) {
    return this.http.get<HistoryDetail>(`${this.baseUrl}/${id}`);
  }
}
