import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  Collection,
  CollectionSummary,
  CollectionTree,
  CreateCollectionDto,
  CreateFolderDto,
  CreateRequestDto,
  Folder,
  SavedRequest,
  SavedRequestDetail,
  UpdateCollectionDto,
  UpdateFolderDto,
  UpdateRequestDto,
} from '../models';
import { API_URL } from './api-url.token';

@Injectable({ providedIn: 'root' })
export class CollectionsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_URL)}/collections`;

  // --- Colecciones ---
  list(workspaceId: string) {
    const params = new HttpParams().set('workspaceId', workspaceId);
    return this.http.get<CollectionSummary[]>(this.baseUrl, { params });
  }

  tree(collectionId: string) {
    return this.http.get<CollectionTree>(`${this.baseUrl}/${collectionId}/tree`);
  }

  create(dto: CreateCollectionDto) {
    return this.http.post<Collection>(this.baseUrl, dto);
  }

  update(id: string, dto: UpdateCollectionDto) {
    return this.http.put<Collection>(`${this.baseUrl}/${id}`, dto);
  }

  remove(id: string) {
    return this.http.delete<Collection>(`${this.baseUrl}/${id}`);
  }

  // --- Carpetas ---
  createFolder(dto: CreateFolderDto) {
    return this.http.post<Folder>(`${this.baseUrl}/folders`, dto);
  }

  updateFolder(id: string, dto: UpdateFolderDto) {
    return this.http.put<Folder>(`${this.baseUrl}/folders/${id}`, dto);
  }

  /** Borra también las subcarpetas y todas las peticiones que contienen. */
  removeFolder(id: string) {
    return this.http.delete<Folder>(`${this.baseUrl}/folders/${id}`);
  }

  // --- Peticiones ---
  createRequest(dto: CreateRequestDto) {
    return this.http.post<SavedRequest>(`${this.baseUrl}/requests`, dto);
  }

  getRequest(id: string) {
    return this.http.get<SavedRequestDetail>(`${this.baseUrl}/requests/${id}`);
  }

  updateRequest(id: string, dto: UpdateRequestDto) {
    return this.http.put<SavedRequest>(`${this.baseUrl}/requests/${id}`, dto);
  }

  removeRequest(id: string) {
    return this.http.delete<SavedRequest>(`${this.baseUrl}/requests/${id}`);
  }
}
