import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { AccountDto, CostMethod, CreateAccountRequest, ExportFormat } from '@t212/shared';
import { firstValueFrom } from 'rxjs';

/** Mutations. Reads use httpResource directly in the pages. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  createAccount(body: CreateAccountRequest): Promise<AccountDto> {
    return firstValueFrom(this.http.post<AccountDto>('/api/accounts', body));
  }

  sync(accountId: string, full = false): Promise<{ queued: boolean }> {
    return firstValueFrom(this.http.post<{ queued: boolean }>(`/api/accounts/${accountId}/sync`, { full }));
  }

  deleteAccount(accountId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/accounts/${accountId}`));
  }
}

export function exportUrl(accountId: string, format: ExportFormat, method: CostMethod, year: number | null): string {
  const params = new URLSearchParams({ format, method });
  if (year !== null) params.set('year', String(year));
  return `/api/accounts/${accountId}/export?${params}`;
}
