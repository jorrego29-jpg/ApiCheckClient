import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ExecuteRequestDto, ExecutionResult, WsdlInspection } from '../models';
import { API_URL } from './api-url.token';

@Injectable({ providedIn: 'root' })
export class ExecutionApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(API_URL)}/execution`;

  /** Ejecuta una petición REST o SOAP. Un fallo de red del destino llega como `response.error`, no como error HTTP. */
  run(dto: ExecuteRequestDto) {
    return this.http.post<ExecutionResult>(`${this.baseUrl}/run`, dto);
  }

  inspectWsdl(wsdlUrl: string) {
    const params = new HttpParams().set('url', wsdlUrl);
    return this.http.get<WsdlInspection>(`${this.baseUrl}/soap/inspect-wsdl`, { params });
  }
}
